import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { parseManifest, safeFileUrl, formatBytes } from '../src/downloads.js'
import { createAccount } from '../src/account.js'
import { APPS, appUrl, config } from '../src/config.js'
import { esc, vHub, statusOf, profileOf, sourceName } from '../src/views.js'

const BASE = 'https://app.lwliann.com/data/downloads.json'
const SHA = 'a'.repeat(64)

test('the shipped downloads manifest parses, and nothing without a checksum is offered', async () => {
  const raw = JSON.parse(await readFile(new URL('../data/downloads.json', import.meta.url), 'utf8'))
  const list = parseManifest(raw, BASE)
  assert.equal(list.length, raw.length)
  for (const d of list) assert.equal(d.available, Boolean(d.href && d.bytes && d.sha256))
})

test('every app that points at Downloads names a slot that exists in the manifest', async () => {
  const slots = new Set(JSON.parse(await readFile(new URL('../data/downloads.json', import.meta.url), 'utf8')).map(d => d.hubSlot))
  for (const a of APPS.filter(a => a.slot)) assert.ok(slots.has(a.slot), `${a.id} → ${a.slot}`)
})

test('a complete entry is downloadable; unsafe or incomplete ones are not', () => {
  const [ok, http, dots, noSha, js] = parseManifest([
    { hubSlot: 'a', name: 'A', file: 'files/a.zip', bytes: 10, sha256: SHA },
    { hubSlot: 'b', name: 'B', file: 'http://evil.example/b.zip', bytes: 10, sha256: SHA },
    { hubSlot: 'c', name: 'C', file: '../secret.zip', bytes: 10, sha256: SHA },
    { hubSlot: 'd', name: 'D', file: 'd.zip', bytes: 10, sha256: 'nope' },
    { hubSlot: 'e', name: 'E', file: 'javascript:alert(1)', bytes: 10, sha256: SHA },
  ], BASE)
  assert.equal(ok.available, true); assert.equal(ok.href, 'https://app.lwliann.com/data/files/a.zip')
  for (const d of [http, dots, noSha, js]) assert.equal(d.available, false, d.slot)
  assert.equal(safeFileUrl('https://cdn.example/x.zip', BASE), 'https://cdn.example/x.zip')
  assert.equal(formatBytes(65252918), '65 MB')
})

test('Game 3 on the hub is the Unity app, not the web edition', () => {
  const tones = APPS.find(a => a.id === 'tones')
  assert.equal(tones.st, 'native'); assert.equal(appUrl(tones), null)
  assert.equal(statusOf(tones, []).text, 'Unity build on its way')
  assert.match(statusOf(tones, [{ slot: tones.slot, available: true, version: '0.2.0' }]).text, /0\.2\.0/)
})

test('web games open on the games origin', () => {
  assert.equal(appUrl(APPS.find(a => a.id === 'tiles')), 'https://playtest.lwliann.com/playtest/game/')
  assert.equal(appUrl(APPS.find(a => a.id === 'puzzle')), 'https://playtest.lwliann.com/playtest/puzzle/')
})

test('rendering escapes names from the server', () => {
  const html = vHub({ user: { email: 'x@y.z' }, page: 'library', theme: { ds: 'liann', t: 'dark' },
    setlists: { status: 'ok', items: [{ id: '00000000-0000-0000-0000-000000000000', name: '<img src=x onerror=alert(1)>', words: 2 }] } })
  assert.ok(!html.includes('<img src=x'))
  assert.equal(esc(`"'<>&`), '&quot;&#39;&lt;&gt;&amp;')
  assert.deepEqual(profileOf({ email: 'ann.mingen@example.com' }), { name: 'Ann Mingen', g: 'A' })
})

function fakeServer() {
  const calls = [], store = new Map()
  const storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) }
  const reply = (status, body) => ({ ok: status < 400, status, json: async () => body })
  const routes = {
    'GET https://api.test/v1/auth/config': () => reply(200, { authentication: { enabled: true, supabaseUrl: 'https://sb.test', publishableKey: 'pk' } }),
    'POST https://sb.test/auth/v1/otp': () => reply(200, {}),
    'POST https://sb.test/auth/v1/verify': opts => JSON.parse(opts.body).token === '123456'
      ? reply(200, { access_token: 'at1', refresh_token: 'rt1', expires_in: 3600, user: { email: 'a@b.c' } }) : reply(403, { error_code: 'otp_expired', msg: 'Token has expired or is invalid' }),
    'POST https://sb.test/auth/v1/token?grant_type=refresh_token': () => reply(200, { access_token: 'at2', refresh_token: 'rt2', expires_in: 3600 }),
    'GET https://sb.test/auth/v1/user': () => reply(200, { email: 'A@B.C', email_confirmed_at: '2026-10-12' }),
    'GET https://be.test/learning/setlists': opts => opts.headers.Authorization?.startsWith('Bearer ') ? reply(200, { setlists: [{ id: 'x', name: 'L', words: 3 }] }) : reply(401, {}),
  }
  const fetchImpl = async (url, opts = {}) => { const key = `${opts.method || 'GET'} ${url}`; calls.push(key); return (routes[key] || (() => reply(404, {})))(opts) }
  return { calls, store, storage, fetchImpl }
}

test('email code sign-in stores a session and reads SetLists with a bearer token', async () => {
  const f = fakeServer(); let clock = 1_000_000_000_000
  const acct = createAccount({ pinyinApi: 'https://api.test', backend: 'https://be.test', fetchImpl: f.fetchImpl, storage: f.storage, now: () => clock })
  await acct.requestCode('a@b.c')
  await assert.rejects(acct.verifyCode('a@b.c', '000000'), /wrong or has expired/)
  assert.deepEqual(await acct.verifyCode('a@b.c', '123456'), { email: 'a@b.c', confirmed: true })
  assert.equal((await acct.setlists())[0].words, 3)
  clock += 2 * 3600 * 1000 // token expired → refreshed once
  assert.equal(await acct.accessToken(), 'at2')
  assert.ok(f.calls.includes('POST https://sb.test/auth/v1/token?grant_type=refresh_token'))
  await acct.signOut()
  assert.equal(acct.hasSession(), false)
  await assert.rejects(acct.setlists(), /Sign in/)
})

test('config holds public addresses only', async () => {
  const src = await readFile(new URL('../src/config.js', import.meta.url), 'utf8')
  assert.doesNotMatch(src, /(service_role|sb_secret_|sb_publishable_|eyJhbGci)/)
  assert.equal(config.hubOrigin, 'https://app.lwliann.com')
})

test('Game 3 Unity files are Claude-produced; every other download is expected from Codex', async () => {
  const raw = JSON.parse(await readFile(new URL('../data/downloads.json', import.meta.url), 'utf8'))
  for (const e of raw) assert.equal(e.producer, e.product === 'mahjong-tones' ? 'claude' : 'codex', e.hubSlot)
})

test('SetList sources show product names, and unknown ones pass through', () => {
  assert.equal(sourceName('lyricsync'), 'LyricSync')
  assert.equal(sourceName('liann-mahjong-tones'), 'Mahjong Tones')
  assert.equal(sourceName('something-new'), 'something-new')
})
