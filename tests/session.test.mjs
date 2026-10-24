import test from 'node:test'
import assert from 'node:assert/strict'
import worker from '../worker/index.js'

const ORIGIN = 'https://app.lwliann.com'
const env = {
  PINYIN_API: 'https://api.test', SESSION_KEY: 'a'.repeat(64), SIGNING_KEY: 'b'.repeat(64),
  ASSETS: { fetch: async () => new Response('asset') },
}
const calls = []
const fetchImpl = async (url, init = {}) => {
  calls.push({ url, init })
  if (url === 'https://api.test/v1/auth/config') return Response.json({ authentication: { enabled: true, supabaseUrl: 'https://s.test', publishableKey: 'pk' } })
  if (url === 'https://s.test/auth/v1/verify') {
    const body = JSON.parse(init.body)
    return body.token === '246810' ? Response.json({ access_token: 'access-one', refresh_token: 'refresh-one', expires_in: 3600 }) : Response.json({ error: 'bad_code' }, { status: 403 })
  }
  if (url === 'https://s.test/auth/v1/token?grant_type=refresh_token') {
    return JSON.parse(init.body).refresh_token === 'refresh-one'
      ? Response.json({ access_token: 'access-two', refresh_token: 'refresh-two', expires_in: 3600 })
      : Response.json({ error: 'invalid_refresh_token' }, { status: 401 })
  }
  if (url === 'https://s.test/auth/v1/logout?scope=local') return new Response(null, { status: 204 })
  throw new Error(`unexpected URL ${url}`)
}
const call = (path, { method = 'POST', origin = ORIGIN, cookie = '', body = '{}', contentType = 'application/json', site = 'same-origin', sessionId = '' } = {}) => worker.fetch(new Request(ORIGIN + path, {
  method, headers: { origin, cookie, 'content-type': contentType, 'sec-fetch-site': site, ...(sessionId ? { 'x-session-id': sessionId } : {}) }, body: method === 'POST' ? body : undefined,
}), env, {}, { fetchImpl })
const login = () => call('/session/verify', { body: JSON.stringify({ email: 'ann@example.com', code: '246810' }) })

test('code verification sets a sealed, host-only HttpOnly cookie and returns only a short-lived access token', async () => {
  const r = await login()
  assert.equal(r.status, 200)
  assert.deepEqual(Object.keys(await r.clone().json()).sort(), ['access_token', 'expires_at', 'session_id'])
  assert.equal((await r.json()).access_token, 'access-one')
  const cookie = r.headers.get('set-cookie')
  assert.match(cookie, /^__Host-liann-refresh=v1\./)
  assert.match(cookie, /Path=\/; HttpOnly; Secure; SameSite=Strict/)
  assert.ok(!cookie.includes('refresh-one'), 'raw refresh token never enters the cookie')
  assert.match(cookie, /liann_comic_session=; Max-Age=0/, 'a new account clears the previous reader pass')
  assert.equal(r.headers.get('cache-control'), 'no-store')
})

test('reload refreshes through the cookie and rotates it without exposing the refresh token', async () => {
  const original = (await login()).headers.get('set-cookie').split(';')[0]
  const r = await call('/session/refresh', { cookie: original })
  assert.equal(r.status, 200)
  assert.equal((await r.json()).access_token, 'access-two')
  assert.ok(!r.headers.get('set-cookie').includes('refresh-two'))
  assert.notEqual(r.headers.get('set-cookie').split(';')[0], original)
  assert.equal(calls.at(-1).init.body, JSON.stringify({ refresh_token: 'refresh-one' }))
})

test('missing, forged and cross-origin requests cannot refresh or create sessions', async () => {
  assert.equal((await call('/session/refresh')).status, 401)
  const good = (await login()).headers.get('set-cookie').split(';')[0]
  assert.equal((await call('/session/refresh', { cookie: good.replace(/.$/, 'A') })).status, 401)
  assert.equal((await call('/session/refresh', { cookie: good, origin: 'https://evil.example' })).status, 403)
  assert.equal((await call('/session/refresh', { cookie: good, site: 'same-site' })).status, 403)
  assert.equal((await call('/session/verify', { method: 'GET' })).status, 405)
  assert.equal((await call('/session/verify', { body: JSON.stringify({ email: 'ann@example.com', code: '111111' }) })).status, 403)
  assert.equal((await call('/session/other')).status, 404)
})

test('an older tab cannot refresh or revoke a newer cookie session', async () => {
  const oldId = (await (await login()).json()).session_id
  const newer = await login(), newerCookie = newer.headers.get('set-cookie').split(';')[0]
  const newerId = (await newer.json()).session_id
  assert.notEqual(oldId, newerId)
  const before = calls.length
  assert.equal((await call('/session/refresh', { cookie: newerCookie, sessionId: oldId })).status, 409)
  assert.equal((await call('/session/logout', { cookie: newerCookie, sessionId: oldId })).status, 409)
  assert.equal(calls.length, before, 'mismatched tabs cannot call Supabase Auth')
  assert.equal((await call('/session/refresh', { cookie: newerCookie, sessionId: newerId })).status, 200)
})

test('sign-out revokes only this Supabase session and clears the browser cookie', async () => {
  const signedIn = await login(), original = signedIn.headers.get('set-cookie').split(';')[0]
  const r = await call('/session/logout', { cookie: original, sessionId: (await signedIn.json()).session_id })
  assert.equal(r.status, 204)
  assert.match(r.headers.get('set-cookie'), /Max-Age=0/)
  assert.ok(calls.some(c => c.url === 'https://s.test/auth/v1/logout?scope=local'))
  assert.equal((await call('/session/logout')).status, 204)
})

test('an unconfirmed Supabase logout keeps the rotated cookie available for retry', async () => {
  const signedIn = await login(), original = signedIn.headers.get('set-cookie').split(';')[0], sessionId = (await signedIn.json()).session_id
  const request = new Request(`${ORIGIN}/session/logout`, { method: 'POST', headers: {
    origin: ORIGIN, cookie: original, 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', 'x-session-id': sessionId,
  }, body: '{}' })
  const failedLogout = (url, init) => url.endsWith('/logout?scope=local')
    ? Promise.resolve(new Response(null, { status: 503 })) : fetchImpl(url, init)
  const r = await worker.fetch(request, env, {}, { fetchImpl: failedLogout })
  assert.equal(r.status, 503)
  assert.match(r.headers.get('set-cookie'), /^__Host-liann-refresh=v1\./)
  assert.notEqual(r.headers.get('set-cookie').split(';')[0], original)
})
