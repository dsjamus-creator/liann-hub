import test from 'node:test'
import assert from 'node:assert/strict'
import worker from '../worker/index.js'

const ORIGIN = 'https://app.lwliann.com'
const env = {
  PINYIN_API: 'https://api.test', SESSION_KEY: 'a'.repeat(64), SIGNING_KEY: 'b'.repeat(64),
  ASSETS: { fetch: async () => new Response('asset') },
  SESSION_RATE_BUCKET: { getByName: () => ({ consume: async () => ({ allowed: true, retryAfter: 0 }) }) },
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
  method, headers: { origin, cookie, 'content-type': contentType, 'sec-fetch-site': site, 'cf-connecting-ip': '192.0.2.10', ...(sessionId ? { 'x-session-id': sessionId } : {}) }, body: method === 'POST' ? body : undefined,
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
  assert.equal((await call('/session/refresh', { cookie: good.replace(/(v1\.[^.]+\.)/, '$1x') })).status, 401)
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
    origin: ORIGIN, cookie: original, 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', 'cf-connecting-ip': '192.0.2.10', 'x-session-id': sessionId,
  }, body: '{}' })
  const failedLogout = (url, init) => url.endsWith('/logout?scope=local')
    ? Promise.resolve(new Response(null, { status: 503 })) : fetchImpl(url, init)
  const r = await worker.fetch(request, env, {}, { fetchImpl: failedLogout })
  assert.equal(r.status, 503)
  assert.match(r.headers.get('set-cookie'), /^__Host-liann-refresh=v1\./)
  assert.notEqual(r.headers.get('set-cookie').split(';')[0], original)
})

test('session abuse brakes use HMAC-scoped actor buckets and stop before Auth', async () => {
  const counts = new Map(), seen = []
  const limitedEnv = {
    ...env,
    SESSION_RATE_BUCKET: { getByName: name => ({ consume: async (kind, digest) => {
      seen.push({ name, kind, digest })
      if (kind === 'refresh_ip' || kind === 'logout_session') return { allowed: false, retryAfter: 37 }
      if (kind === 'verify_email') return { allowed: true, retryAfter: 0 }
      const countKey = `${kind}:${digest}`, next = (counts.get(countKey) || 0) + 1
      counts.set(countKey, next)
      return { allowed: next <= 2, retryAfter: next <= 2 ? 0 : 37 }
    } }) },
  }
  const request = (path, ip = '192.0.2.10') => new Request(ORIGIN + path, {
    method: 'POST', headers: { origin: ORIGIN, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json', ...(ip ? { 'cf-connecting-ip': ip } : {}) },
    body: JSON.stringify({ email: 'ann@example.com', code: '111111' }),
  })
  const run = (path, ip) => worker.fetch(request(path, ip), limitedEnv, {}, { fetchImpl })
  assert.equal((await run('/session/verify')).status, 403)
  assert.equal((await run('/session/verify')).status, 403)
  const before = calls.length
  const denied = await run('/session/verify')
  assert.equal(denied.status, 429)
  assert.equal(denied.headers.get('retry-after'), '37')
  assert.equal(calls.length, before, 'denied request never reaches Supabase')
  assert.equal((await run('/session/verify', '192.0.2.11')).status, 403)
  const verifyIps = seen.filter(x => x.kind === 'verify_ip').map(x => x.digest)
  assert.equal(verifyIps.length, 4)
  assert.equal(verifyIps[0], verifyIps[1])
  assert.equal(verifyIps[0], verifyIps[2])
  assert.notEqual(verifyIps[0], verifyIps[3])
  assert.ok(!verifyIps[0].includes('192.0.2.'), 'raw IP is not stored in the Durable Object key')
  assert.equal((await run('/session/refresh')).status, 429, 'refresh uses its own limiter')
  const signedIn = await login(), cookie = signedIn.headers.get('set-cookie').split(';')[0], sessionId = (await signedIn.json()).session_id
  const logoutRequest = new Request(ORIGIN + '/session/logout', { method: 'POST', headers: {
    origin: ORIGIN, cookie, 'x-session-id': sessionId, 'sec-fetch-site': 'same-origin', 'cf-connecting-ip': '192.0.2.10',
  } })
  const beforeLogout = calls.length
  assert.equal((await worker.fetch(logoutRequest, limitedEnv, {}, { fetchImpl })).status, 429, 'the sealed session has its own logout limit')
  assert.equal(seen.at(-1).kind, 'logout_session')
  assert.ok(!seen.at(-1).digest.includes(sessionId), 'the session ID is not a Durable Object key')
  assert.equal(calls.length, beforeLogout, 'limited logout never calls Auth')
  const allowedLogout = await worker.fetch(logoutRequest, { ...limitedEnv, SESSION_RATE_BUCKET: env.SESSION_RATE_BUCKET }, {}, { fetchImpl })
  assert.equal(allowedLogout.status, 204, 'logout remains available despite refresh saturation on the same IP')
  assert.equal((await run('/session/verify', '')).status, 503, 'missing trusted client IP fails closed')
  assert.equal((await worker.fetch(request('/session/verify'), { ...env, SESSION_RATE_BUCKET: null }, {}, { fetchImpl })).status, 503)
})
