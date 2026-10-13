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

test('a missing learner profile leads to AlongSide through a one-time pass, on AlongSide addresses only', async () => {
  const f = fakeServer(), profile = { url: 'https://be.test/student#profile', sessionPass: { url: 'https://be.test/learning/session-pass', next: '/student#profile' } }
  const acct = createAccount({ pinyinApi: 'https://api.test', backend: 'https://be.test', fetchImpl: f.fetchImpl, storage: f.storage })
  await acct.verifyCode('a@b.c', '123456')
  let sent
  const pass = (url = 'https://be.test/auth/liann/continue#pass=abc') => opts => { sent = opts; return { ok: true, status: 200, json: async () => ({ url, expiresInSeconds: 60 }) } }
  const route = (key, fn) => { const orig = f.fetchImpl; f.fetchImpl = async (u, o = {}) => `${o.method || 'GET'} ${u}` === key ? fn(o) : orig(u, o) }
  const acct2 = () => createAccount({ pinyinApi: 'https://api.test', backend: 'https://be.test', fetchImpl: (u, o) => f.fetchImpl(u, o), storage: f.storage })

  route('GET https://be.test/learning/setlists', () => ({ ok: false, status: 403, json: async () => ({ error: 'not_a_student', profile }) }))
  const error = await acct2().setlists().then(() => null, e => e)
  assert.equal(error.code, 'not_a_student')
  assert.deepEqual(error.profile, profile)

  route('POST https://be.test/learning/session-pass', pass())
  assert.equal(await acct2().profileLink(profile), 'https://be.test/auth/liann/continue#pass=abc')
  assert.equal(sent.headers.Authorization, 'Bearer at1')
  assert.deepEqual(JSON.parse(sent.body), { next: '/student#profile' })

  // A reply naming another site is never followed: the pass request stays on AlongSide, and so does the result.
  await acct2().profileLink({ sessionPass: { url: 'https://evil.test/steal', next: '//evil.test' } })
  assert.deepEqual(JSON.parse(sent.body), { next: '/student#profile' })
  route('POST https://be.test/learning/session-pass', pass('https://evil.test/x'))
  await assert.rejects(acct2().profileLink(profile), /unexpected address/)

  // An AlongSide without the pass yet: open the form itself.
  route('POST https://be.test/learning/session-pass', () => ({ ok: false, status: 404, json: async () => ({}) }))
  assert.equal(await acct2().profileLink(undefined), 'https://be.test/student#profile')
})

test('the Library asks for the learner profile instead of showing an error', () => {
  const html = vHub({ user: { email: 'x@y.z' }, page: 'library', theme: { ds: 'liann', t: 'dark' }, setlists: { status: 'needs_profile' } })
  assert.match(html, /id="finishprofile"/)
  assert.match(html, /Finish your learner profile/)
  assert.doesNotMatch(html, /id="retrylib"/)
  const after = vHub({ user: { email: 'x@y.z' }, page: 'library', theme: { ds: 'liann', t: 'dark' }, setlists: { status: 'needs_profile', opened: true } })
  assert.match(after, /id="retrylib"/)
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
