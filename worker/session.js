// The hub keeps only a short-lived access token in page memory. Supabase refresh tokens
// are sealed into an HttpOnly, host-only cookie and are exchanged only by this Worker.
import { authHeaders, visitorIp } from './auth-forwarding.js'
const COOKIE = '__Host-liann-refresh'
const COOKIE_AGE = 30 * 24 * 60 * 60
const AAD = new TextEncoder().encode('liann-hub-refresh-v1')
const enc = new TextEncoder()
const dec = new TextDecoder()

const headers = { 'cache-control': 'no-store', pragma: 'no-cache', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' }
const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status, headers: { ...headers, 'content-type': 'application/json', ...extra } })
const clearCookie = `${COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict`
const b64 = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64 = value => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)), c => c.charCodeAt(0))

async function cookieKey(env) {
  if (!/^[0-9a-f]{64}$/.test(env.SESSION_KEY || '')) throw new Error('session key unavailable')
  const bytes = Uint8Array.from(env.SESSION_KEY.match(/../g), x => parseInt(x, 16))
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

async function seal(token, sessionId, env) {
  if (typeof token !== 'string' || token.length < 8 || token.length > 2048 || !/^[0-9a-f-]{36}$/.test(sessionId)) throw new Error('invalid session')
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: AAD }, await cookieKey(env), enc.encode(JSON.stringify({ token, sessionId })))
  return `v1.${b64(iv)}.${b64(new Uint8Array(cipher))}`
}

async function unseal(request, env) {
  const value = (request.headers.get('cookie') || '').split(';').map(x => x.trim()).find(x => x.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1)
  const parts = /^v1\.([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]{32,3000})$/.exec(value || '')
  if (!parts) return null
  try {
    const session = JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(parts[1]), additionalData: AAD }, await cookieKey(env), unb64(parts[2]))))
    return typeof session.token === 'string' && session.token.length >= 8 && session.token.length <= 2048 && /^[0-9a-f-]{36}$/.test(session.sessionId) ? session : null
  } catch { return null }
}

const setCookie = value => `${COOKIE}=${value}; Max-Age=${COOKIE_AGE}; Path=/; HttpOnly; Secure; SameSite=Strict`
const sameOrigin = request => request.headers.get('origin') === new URL(request.url).origin && !['cross-site', 'same-site'].includes(request.headers.get('sec-fetch-site'))

async function rateGate(request, env, path, sessionId = null) {
  const limiter = path === '/session/verify' ? env.SESSION_VERIFY_LIMITER
    : path === '/session/refresh' ? env.SESSION_REFRESH_LIMITER : env.SESSION_LOGOUT_LIMITER
  if (!limiter || typeof limiter.limit !== 'function') return json({ error: 'auth_unavailable' }, 503)
  try {
    const key = path === '/session/logout' ? sessionId : visitorIp(request)
    if (!key) return json({ error: 'auth_unavailable' }, 503)
    const { success } = await limiter.limit({ key })
    return success ? null : json({ error: 'slow_down' }, 429, { 'retry-after': '60' })
  } catch {
    return json({ error: 'auth_unavailable' }, 503)
  }
}

async function authCall(fetchImpl, url, init) {
  try { return await fetchImpl(url, init) } catch { return null }
}

async function authConfig(settings) {
  try { return await settings() } catch { return null }
}

async function tokenResult(response, sessionId, env, newSignIn = false) {
  const body = await response.json().catch(() => null)
  if (!body?.access_token || !body?.refresh_token) return json({ error: 'auth_unavailable' }, 503)
  const expires = Number(body.expires_at) || Math.floor(Date.now() / 1000) + Number(body.expires_in || 3600)
  const result = json({ access_token: body.access_token, expires_at: expires, session_id: sessionId }, 200, { 'set-cookie': setCookie(await seal(body.refresh_token, sessionId, env)) })
  if (newSignIn) result.headers.append('set-cookie', 'liann_comic_session=; Max-Age=0; Path=/comic/; HttpOnly; Secure; SameSite=Strict')
  return result
}

export async function session(request, env, fetchImpl, settings) {
  const path = new URL(request.url).pathname
  if (!['/session/verify', '/session/refresh', '/session/logout'].includes(path)) return json({ error: 'not_found' }, 404)
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, { allow: 'POST' })
  if (!sameOrigin(request)) return json({ error: 'forbidden' }, 403)
  if (path !== '/session/logout') {
    const rateResponse = await rateGate(request, env, path)
    if (rateResponse) return rateResponse
  }
  const auth = await authConfig(settings)
  if (!auth) return json({ error: 'auth_unavailable' }, 503)
  let upstreamHeaders
  try { upstreamHeaders = authHeaders(request, env, auth) } catch { return json({ error: 'auth_unavailable' }, 503) }

  if (path === '/session/verify') {
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) return json({ error: 'bad_request' }, 400)
    const raw = await request.text().catch(() => '')
    if (raw.length > 1024) return json({ error: 'bad_request' }, 400)
    let body
    try { body = JSON.parse(raw) } catch { return json({ error: 'bad_request' }, 400) }
    const email = String(body?.email || '').trim().toLowerCase(), code = String(body?.code || '')
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\d{6,10}$/.test(code)) return json({ error: 'bad_request' }, 400)
    const r = await authCall(fetchImpl, `${auth.supabaseUrl}/auth/v1/verify`, {
      method: 'POST', headers: { ...upstreamHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({ email, token: code, type: 'email' }),
    })
    if (!r) return json({ error: 'auth_unavailable' }, 503)
    if (r.status === 429) return json({ error: 'slow_down' }, 429)
    if (r.status === 400 || r.status === 401 || r.status === 403) return json({ error: 'bad_code' }, 403)
    if (!r.ok) return json({ error: 'auth_unavailable' }, 503)
    return tokenResult(r, crypto.randomUUID(), env, true)
  }

  const current = await unseal(request, env)
  if (!current) return path === '/session/logout'
    ? new Response(null, { status: 204, headers: { ...headers, 'set-cookie': clearCookie } })
    : json({ error: 'signed_out' }, 401, { 'set-cookie': clearCookie })
  const expected = request.headers.get('x-session-id')
  if (expected && expected !== current.sessionId) return json({ error: 'session_changed' }, 409)
  if (path === '/session/logout' && !expected) return json({ error: 'session_required' }, 400)
  if (path === '/session/logout') {
    const rateResponse = await rateGate(request, env, path, current.sessionId)
    if (rateResponse) return rateResponse
  }
  const r = await authCall(fetchImpl, `${auth.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST', headers: { ...upstreamHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({ refresh_token: current.token }),
  })
  if (!r) return json({ error: 'auth_unavailable' }, 503)
  if (r.status === 429) return json({ error: 'slow_down' }, 429)
  if (r.status === 400 || r.status === 401 || r.status === 403) return path === '/session/logout'
    ? new Response(null, { status: 204, headers: { ...headers, 'set-cookie': clearCookie } })
    : json({ error: 'signed_out' }, 401, { 'set-cookie': clearCookie })
  if (!r.ok) return json({ error: 'auth_unavailable' }, 503)
  if (path === '/session/refresh') return tokenResult(r, current.sessionId, env)

  const tokens = await r.json().catch(() => null)
  if (!tokens?.access_token) return json({ error: 'auth_unavailable' }, 503)
  const logout = await authCall(fetchImpl, `${auth.supabaseUrl}/auth/v1/logout?scope=local`, {
    method: 'POST', headers: { ...upstreamHeaders, authorization: `Bearer ${tokens.access_token}` },
  })
  if (!logout || !logout.ok) return json({ error: 'logout_unconfirmed' }, 503, {
    // Refresh already rotated the one-use token; keep the new cookie so sign-out can be retried.
    'set-cookie': tokens.refresh_token ? setCookie(await seal(tokens.refresh_token, current.sessionId, env)) : clearCookie,
  })
  return new Response(null, { status: 204, headers: { ...headers, 'set-cookie': clearCookie } })
}
