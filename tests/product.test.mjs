import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, access } from 'node:fs/promises'
import { APPS } from '../src/config.js'
import { parseManifest } from '../src/downloads.js'
import { detectOS, orderPlatforms, platformModel, productHTML, STORES } from '../src/product.js'

const BASE = 'https://app.lwliann.com/data/downloads.json'
const products = JSON.parse(await readFile(new URL('../data/products.json', import.meta.url), 'utf8')).products
const manifest = parseManifest(JSON.parse(await readFile(new URL('../data/downloads.json', import.meta.url), 'utf8')), BASE)

test('every product has a page shell, an app card and manifest slots that exist', async () => {
  for (const p of products) {
    const shell = await readFile(new URL(`../${p.id}.html`, import.meta.url), 'utf8')
    assert.match(shell, new RegExp(`data-product="${p.id}"`), `${p.id}.html names its product`)
    assert.ok(shell.includes('src/product.js'), `${p.id}.html loads the product module`)
    assert.ok(shell.includes(`https://app.lwliann.com/${p.id}`), `${p.id}.html carries its canonical address`)
    const app = APPS.find(a => a.id === p.app)
    assert.ok(app, `${p.id} → app card ${p.app}`)
    assert.equal(app.page, p.id, `${app.id}.page points back at the product`)
    assert.equal(app.g, p.glyph, `${p.id} glyph matches the card`)
    for (const pl of p.platforms) {
      if (pl.slot) assert.ok(manifest.some(d => d.slot === pl.slot), `${p.id} ${pl.os} → slot ${pl.slot}`)
      if (pl.store) assert.ok(STORES[pl.store], `${p.id} ${pl.os} store ${pl.store}`)
      assert.ok(['ok', 'testing', 'soon'].includes(pl.status), `${p.id} ${pl.os} status`)
    }
  }
  for (const a of APPS.filter(a => a.page)) {
    assert.ok(products.some(p => p.id === a.page), `${a.id} → product ${a.page}`)
    await access(new URL(`../${a.page}.html`, import.meta.url))
  }
})

test('the visitor platform comes from the user agent, and their row goes first', () => {
  assert.equal(detectOS('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36'), 'android')
  assert.equal(detectOS('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15'), 'ios')
  assert.equal(detectOS('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130'), 'windows')
  assert.equal(detectOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15'), 'mac')
  assert.equal(detectOS(''), 'other')
  const poly = products.find(p => p.id === 'polyflow')
  assert.deepEqual(orderPlatforms(poly.platforms, 'android').map(p => p.os), ['android', 'web', 'windows'])
  assert.deepEqual(orderPlatforms(poly.platforms, 'windows').map(p => p.os), ['windows', 'web', 'android'])
  assert.deepEqual(orderPlatforms(poly.platforms, 'other').map(p => p.os), ['web', 'android', 'windows'])
  const dual = products.find(p => p.id === 'dual-subs')
  assert.equal(orderPlatforms(dual.platforms, 'mac')[0].os, 'chrome', 'a desktop visitor sees the browser rows first')
})

test('a platform row offers Open, a store badge or a checked file from the same record', () => {
  const poly = products.find(p => p.id === 'polyflow')
  const windows = platformModel(poly.platforms.find(p => p.os === 'windows'), manifest)
  assert.equal(windows.status, 'Ready')
  assert.deepEqual(windows.buttons.map(b => [b.kind, b.disabled || false]), [['store', true], ['file', false]])
  assert.match(windows.buttons[1].href, /PolyFlow-Setup-0\.1\.1\.exe$/)
  assert.match(windows.buttons[1].meta, /Version 0\.1\.1 · 111 MB/)
  assert.equal(windows.buttons[1].sha256, undefined, 'the checksum stays on the Downloads page')
  const android = platformModel(poly.platforms.find(p => p.os === 'android'), manifest)
  assert.match(android.buttons[1].href, /PolyFlow-Android-0\.1\.1\.apk$/)
  const web = platformModel(poly.platforms.find(p => p.os === 'web'), manifest)
  assert.deepEqual(web.buttons.map(b => b.label), ['Open'])
  const ios = platformModel(products.find(p => p.id === 'alongside').platforms.find(p => p.os === 'ios'), manifest)
  assert.equal(ios.status, 'Coming soon'); assert.equal(ios.buttons[0].label, 'Coming to the App Store'); assert.equal(ios.buttons[0].disabled, true)
  const live = platformModel({ os: 'android', store: 'play', storeUrl: 'https://play.google.com/store/apps/details?id=com.lwliann.polyflow', status: 'ok' }, [])
  assert.equal(live.status, 'Ready'); assert.equal(live.buttons[0].href, 'https://play.google.com/store/apps/details?id=com.lwliann.polyflow')
  const waiting = platformModel({ os: 'windows', slot: 'nope/none', status: 'soon' }, manifest)
  assert.equal(waiting.status, 'Coming soon'); assert.equal(waiting.buttons[0].meta, 'Waiting for the latest file')
})

test('the page escapes record text and shows every platform', () => {
  const html = productHTML({ id: 'x', app: 'poly', name: '<b>X</b>', glyph: '琴', kind: 'App', oneLine: 'One "line"', audience: 'A', points: ['<i>p</i>'],
    platforms: [{ os: 'web', url: 'https://example.com/?a=1&b=2', status: 'ok' }, { os: 'android', store: 'play', storeUrl: '', status: 'testing' }], links: [['G', 'https://example.com/g']], privacyUrl: 'https://example.com/p', support: 'a@b.c' }, [], 'android', [{ id: 'polyflow', glyph: '琴', name: 'PolyFlow' }])
  assert.ok(!html.includes('<b>X</b>') && html.includes('&lt;b&gt;X&lt;/b&gt;'))
  assert.ok(!html.includes('<i>p</i>'))
  assert.ok(html.includes('href="https://example.com/?a=1&amp;b=2"'))
  assert.match(html, /data-os="android"[\s\S]*data-os="web"/, 'the android visitor sees Android first')
  assert.ok(html.includes('Coming to Google Play') && html.includes('Privacy notice') && html.includes('mailto:a@b.c') && html.includes('href="/polyflow"'))
})
