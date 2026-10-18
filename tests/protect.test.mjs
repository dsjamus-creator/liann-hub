// Comic page protection: the Worker (sign-in, signed links, headers, limits) and the hub's page signer.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import worker, { allow, hmac } from '../worker/index.js'
import { createPageSigner, comicPath, watermarkStyle } from '../src/pages.js'
import { parseComics } from '../src/comics.js'

const ORIGIN = 'https://app.lwliann.com'
const TOKEN = 'aaa.bbb.ccc'
const USER = { id: '11111111-2222-4333-8444-555555555555', email: 'ann@example.com' }
const env = {
  SIGNING_KEY: 'test-key', PINYIN_API: 'https://api.test',
  PAGES: { get: async key => key === 'reader/ep-01/000.webp' ? { body: 'IMG', size: 3 } : null },
  ASSETS: { fetch: async () => new Response('asset') },
}
const NOW = 1_800_000_000_000
const fetchImpl = async (url, init = {}) => {
  if (String(url).endsWith('/v1/auth/config')) return Response.json({ authentication: { enabled: true, supabaseUrl: 'https://s.test', publishableKey: 'pk' } })
  if (String(url) === 'https://s.test/auth/v1/user') return init.headers.authorization === `Bearer ${TOKEN}` ? Response.json(USER) : new Response('{}', { status: 401 })
  throw new Error('unexpected ' + url)
}
const call = (path, init = {}, at = NOW) => worker.fetch(new Request(ORIGIN + path, init), env, {}, { fetchImpl, now: at })
const sign = (paths, token = TOKEN, at = NOW) => call('/comic/sign', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ paths }) }, at)

test('anyone can get links, signed-in or not, but only for comic page paths', async () => {
  assert.equal((await call('/comic/sign')).status, 405)
  for (const bad of [['/comic/../x.webp'], ['/data/downloads.json'], ['/comic/ep-01/000.png'], ['/comic/ep-01/000.webp?x=1'], []]) assert.equal((await sign(bad)).status, 400, JSON.stringify(bad))
  const ok = await sign(['/comic/ep-01/000.webp'])
  assert.equal(ok.status, 200)
  const body = await ok.json()
  assert.equal(body.expires, Math.floor((NOW + 30 * 60 * 1000) / 1000))
  assert.match(body.urls['/comic/ep-01/000.webp'], /^\/comic\/ep-01\/000\.webp\?e=\d+&u=[0-9a-f]{12}&s=[0-9a-f]{40}$/)
  const anon = await call('/comic/sign', { method: 'POST', headers: { 'cf-connecting-ip': '203.0.113.7' }, body: JSON.stringify({ paths: ['/comic/ep-01/000.webp'] }) })
  assert.equal(anon.status, 200, 'a visitor who is not signed in can read')
  const stale = await sign(['/comic/ep-01/000.webp'], 'x.y.z')
  assert.equal(stale.status, 200, 'an expired or bad token is just an anonymous visitor')
  const a = (await anon.json()).urls['/comic/ep-01/000.webp'], b2 = (await (await sign(['/comic/ep-01/000.webp'])).json()).urls['/comic/ep-01/000.webp']
  assert.notEqual(a.match(/u=([0-9a-f]+)/)[1], b2.match(/u=([0-9a-f]+)/)[1], 'visitors are told apart by address, signed-in users by account')
  const link = a, img = { 'sec-fetch-dest': 'image', 'sec-fetch-site': 'same-origin' }
  assert.equal((await call(link, { headers: img })).status, 200, 'an anonymous link serves the page')
})

test('a signed link serves the page privately, only as an image, only until it expires', async () => {
  const link = (await (await sign(['/comic/ep-01/000.webp'])).json()).urls['/comic/ep-01/000.webp']
  const img = { 'sec-fetch-dest': 'image', 'sec-fetch-site': 'same-origin' }
  const r = await call(link, { headers: img })
  assert.equal(r.status, 200)
  assert.equal(await r.text(), 'IMG')
  assert.equal(r.headers.get('content-type'), 'image/webp')
  assert.match(r.headers.get('cache-control'), /private/)
  assert.equal(r.headers.get('cross-origin-resource-policy'), 'same-origin')
  assert.equal((await call(link)).status, 200, 'older browsers send no fetch metadata')
  assert.equal((await call(link, { headers: { 'sec-fetch-dest': 'document' } })).status, 403, '"open image in new tab"')
  assert.equal((await call(link, { headers: { 'sec-fetch-dest': 'iframe' } })).status, 403)
  assert.equal((await call(link, { headers: { ...img, 'sec-fetch-site': 'cross-site' } })).status, 403, 'another site cannot embed it')
  assert.equal((await call(link, { headers: img }, NOW + 31 * 60 * 1000)).status, 403, 'expired')
  assert.equal((await call('/comic/ep-01/000.webp', { headers: img })).status, 403, 'unsigned')
  assert.equal((await call(link.replace(/s=[0-9a-f]/, 's=0'), { headers: img })).status, 403, 'forged')
  assert.equal((await call(link.replace('000', '001'), { headers: img })).status, 403, 'a link is for one page')
  assert.equal((await call(link.replace('ep-01/000', 'ep-01/000x'), { headers: img })).status, 403)
  assert.equal((await call(link, { method: 'POST' })).status, 405)
})

test('a signed page that is not in the bucket is 404, other paths go to the site, not the bucket', async () => {
  const link = (await (await sign(['/comic/ep-01/001.webp'])).json()).urls['/comic/ep-01/001.webp']
  assert.equal((await call(link)).status, 404)
  assert.equal(await (await call('/')).text(), 'asset')
  assert.equal((await call('/comic/ep-01/%2e%2e/x')).status, 404)
})

test('bulk fetching is slowed down', () => {
  const id = 'limit-test'
  for (let i = 0; i < 5; i++) assert.ok(allow(id, [5, 1000], 1000 + i))
  assert.equal(allow(id, [5, 1000], 1010), false)
  assert.ok(allow(id, [5, 1000], 2500), 'allowed again once the window has passed')
})

test('hmac is stable and depends on the key and the text', async () => {
  assert.equal(await hmac('k', 'a'), await hmac('k', 'a'))
  assert.notEqual(await hmac('k', 'a'), await hmac('k', 'b'))
  assert.notEqual(await hmac('k', 'a'), await hmac('j', 'a'))
})

test('the shipped comic data uses protected pages, and the hub signs exactly those', async () => {
  const raw = JSON.parse(await readFile(new URL('../data/comics.json', import.meta.url), 'utf8'))
  const eps = parseComics(raw, ORIGIN + '/')
  assert.ok(eps.length >= 2)
  for (const ep of eps) {
    assert.ok(ep.pages.every(p => comicPath(p, ORIGIN)), `${ep.id}: every page is a protected /comic/ page`)
    assert.ok(!ep.cover.includes('/comic/'), 'the cover on the Read card stays public')
  }
})

test('the page signer asks once, reuses links, refreshes near expiry, and explains failures', async () => {
  let now = NOW, calls = 0, token = TOKEN, status = 200, seenAuth
  const f = async (url, init) => {
    calls++
    assert.equal(url, ORIGIN + '/comic/sign')
    seenAuth = init.headers.authorization
    if (token) assert.equal(seenAuth, `Bearer ${token}`)
    if (status !== 200) return new Response('{}', { status })
    const paths = JSON.parse(init.body).paths
    return Response.json({ expires: Math.floor(now / 1000) + 1800, urls: Object.fromEntries(paths.map(p => [p, `${p}?e=1&u=2&s=3`])) })
  }
  const signer = createPageSigner({ getToken: async () => token, fetchImpl: f, origin: ORIGIN, now: () => now })
  const ep = { raw: [ORIGIN + '/comic/ep-01/000.webp', 'https://downloads.lwliann.com/other.webp', ORIGIN + '/comic/ep-01/001.webp'] }
  const a = await signer.pagesOf(ep)
  assert.deepEqual(a, [ORIGIN + '/comic/ep-01/000.webp?e=1&u=2&s=3', 'https://downloads.lwliann.com/other.webp', ORIGIN + '/comic/ep-01/001.webp?e=1&u=2&s=3'])
  await signer.pagesOf(ep); assert.equal(calls, 1, 'links are reused')
  now += 21 * 60 * 1000; await signer.pagesOf(ep); assert.equal(calls, 2, 'refreshed with less than 10 minutes left')
  now += 21 * 60 * 1000; status = 429
  await assert.rejects(signer.pagesOf(ep), { code: 'slow_down' })
  status = 500; await assert.rejects(signer.pagesOf(ep), { code: 'unavailable' })
  status = 200; token = null; seenAuth = 'unset'
  assert.equal((await signer.pagesOf(ep)).length, 3, 'a visitor who is not signed in still gets the pages')
  assert.equal(seenAuth, undefined, 'and sends no Authorization header')
  const open = createPageSigner({ getToken: async () => token, fetchImpl: f, origin: ORIGIN, now: () => now })
  assert.deepEqual(await open.pagesOf({ raw: ['https://downloads.lwliann.com/a.webp'] }), ['https://downloads.lwliann.com/a.webp'], 'nothing to sign, no call, no token needed')
})

test('the watermark carries the reader and cannot break out of its markup', () => {
  const css = decodeURIComponent(watermarkStyle('a"<b>&\'@x.test').replace(/^background-image:url\("data:image\/svg\+xml,|"\)$/g, ''))
  assert.ok(css.includes('a&quot;&lt;b&gt;&amp;&apos;@x.test'))
  assert.ok(!/<b>/.test(css))
})
