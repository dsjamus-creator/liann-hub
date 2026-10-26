import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFile } from 'node:fs/promises'
import { installMode } from '../src/pwa.js'
import { installCard } from '../src/views.js'

const read = p => readFile(new URL(`../${p}`, import.meta.url), 'utf8')
const pngSize = async p => { const b = await readFile(new URL(`../${p}`, import.meta.url)); assert.equal(b.subarray(1, 4).toString(), 'PNG', `${p} is a PNG`); return [b.readUInt32BE(16), b.readUInt32BE(20)] }

test('what the Downloads page offers depends on the device', () => {
  const phone = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36'
  assert.equal(installMode({ ua: phone, canPrompt: true }), 'prompt')
  assert.equal(installMode({ ua: phone }), 'browser', 'no prompt yet: point at the browser menu')
  assert.equal(installMode({ ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15' }), 'ios')
  assert.equal(installMode({ ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15', touchPoints: 5 }), 'ios', 'iPad reports as a Mac')
  assert.equal(installMode({ ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5)' }), 'browser')
  assert.equal(installMode({ ua: phone, standalone: true, canPrompt: true }), 'installed', 'already running as an app')
  assert.equal(installMode({ ua: 'Mozilla/5.0 (Windows NT 10.0) LiANN-HUB/0.1.0 Chrome/130 Electron/44.7.0 Safari/537.36' }), 'installed', 'the Windows and Mac app is already installed')
})

test('the install card shows a button only when the browser can prompt, and nothing when installed', () => {
  assert.match(installCard('prompt'), /data-install>Install</)
  assert.ok(!installCard('ios').includes('data-install>') && installCard('ios').includes('Add to Home Screen'))
  assert.match(installCard('browser'), /Install app or Add to Home screen/)
  assert.equal(installCard('installed'), '')
  assert.equal(installCard(undefined), '')
})

test('the web app manifest describes an installable app with real icons', async () => {
  const m = JSON.parse(await read('manifest.webmanifest'))
  assert.equal(m.display, 'standalone'); assert.equal(m.start_url, '/'); assert.equal(m.scope, '/'); assert.equal(m.id, '/')
  assert.equal(m.short_name, 'LiANN HUB'); assert.equal(m.theme_color, '#121410'); assert.equal(m.background_color, '#121410')
  const need = [['any', 192], ['any', 512], ['maskable', 512]]
  for (const [purpose, size] of need) {
    const icon = m.icons.find(i => i.purpose === purpose && i.sizes === `${size}x${size}`)
    assert.ok(icon, `a ${purpose} ${size}px icon is declared`)
    assert.deepEqual(await pngSize(icon.src.slice(1)), [size, size], `${icon.src} really is ${size}px`)
  }
  assert.deepEqual(await pngSize('assets/icons/apple-touch-icon-180.png'), [180, 180])
  const html = await read('index.html')
  assert.ok(html.includes('<link rel="manifest" href="/manifest.webmanifest">') && html.includes('rel="apple-touch-icon"'))
  assert.match(await read('_headers'), /\/manifest\.webmanifest\n\s+Content-Type: application\/manifest\+json/)
})

test('the service worker only answers page navigations, and only with the offline page when the network fails', async () => {
  const handlers = {}, store = new Map(), cacheCalls = []
  const caches = {
    open: async () => ({ add: async u => { cacheCalls.push(u); store.set(u, new Response('offline page')) } }),
    match: async u => store.get(u), keys: async () => ['liann-hub-offline-v1', 'old'], delete: async () => true,
  }
  const self = { addEventListener: (t, fn) => { handlers[t] = fn }, skipWaiting: async () => {}, clients: { claim: async () => {} } }
  vm.runInNewContext(await read('sw.js'), { self, caches, fetch: async () => { throw new Error('offline') }, Response })
  let waited; await handlers.install({ waitUntil: p => { waited = p } }); await waited
  assert.deepEqual(cacheCalls, ['/offline.html'], 'only the offline page is cached')
  let answered = 'untouched'
  handlers.fetch({ request: { mode: 'cors', url: 'https://app.lwliann.com/data/downloads.json' }, respondWith: () => { answered = 'touched' } })
  assert.equal(answered, 'untouched', 'data and asset requests are never intercepted')
  let page
  handlers.fetch({ request: { mode: 'navigate', url: 'https://app.lwliann.com/' }, respondWith: p => { page = p } })
  assert.equal(await (await page).text(), 'offline page', 'an offline navigation gets the offline page')
})

test('the offline page needs no script and links back to the hub', async () => {
  const html = await read('offline.html')
  assert.ok(!/<script/i.test(html), 'the hub CSP allows no inline script')
  assert.ok(html.includes('href="/"') && /You are offline/.test(html))
})
