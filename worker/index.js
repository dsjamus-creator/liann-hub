// Learning with LiANN hub Worker. Static assets are served separately; this code handles /comic/* and /session/*.
import { session } from './session.js'
import { authHeaders } from './auth-forwarding.js'
//
//   POST /comic/sign   body { paths: ["/comic/ep-01/000.webp", ...] }   Authorization: Bearer <Supabase access token>
//        -> { expires, urls: { "<path>": "<path>?e=..&u=..&s=.." } } plus a short-lived, HttpOnly reader cookie.
//   GET  /comic/<episode>/<page>.webp?e=..&u=..&s=..                   One page image, read from the private R2 bucket (key reader/<episode>/<page>.webp).
//        The signed URL and account-bound reader cookie are both required; a copied URL alone is insufficient.
//
// The page files are not public: they live in the liann-reader bucket, which has no public address (docs/COMIC-PROTECTION.md).
// Per-account counters live in this isolate's memory, so they are a brake on bulk copying, not an exact limit.

const SIGN_MS = 30 * 60 * 1000
const PAGE_PATH = /^\/comic\/([a-z0-9-]{1,40})\/([a-z0-9-]{1,40})\.webp$/
const SIGN_LIMIT = [120, 10 * 60 * 1000]  // sign requests per account in 10 minutes
const PAGE_LIMIT = [1500, 10 * 60 * 1000] // page images per account in 10 minutes
const MAX_PATHS = 120
const READER_COOKIE = 'liann_comic_session'

const enc = new TextEncoder()
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extra } })
const sameTag = (a, b) => {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function hmac(key, text) {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return hex(await crypto.subtle.sign('HMAC', k, enc.encode(text))).slice(0, 40)
}

const hits = new Map()
export function allow(id, [limit, windowMs], now = Date.now()) {
  const list = (hits.get(id) || []).filter(t => now - t < windowMs)
  if (list.length >= limit) { hits.set(id, list); return false }
  list.push(now); hits.set(id, list)
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some(t => now - t < windowMs)) hits.delete(k)
  return true
}

let authCache = null
async function authSettings(env, fetchImpl) {
  if (authCache && authCache.until > Date.now()) return authCache.value
  const r = await fetchImpl(`${env.PINYIN_API}/v1/auth/config`, { headers: { accept: 'application/json' } })
  if (!r.ok) throw new Error('auth config unavailable')
  const a = (await r.json()).authentication
  if (!a?.enabled || !a.supabaseUrl || !a.publishableKey) throw new Error('auth config incomplete')
  authCache = { value: a, until: Date.now() + 10 * 60 * 1000 }
  return a
}

// The signed-in user behind a bearer token, or null. Supabase answers 200 with the user only for a live token.
export async function userOf(request, env, fetchImpl = fetch) {
  const m = /^Bearer\s+([\w-]+\.[\w-]+\.[\w-]+)$/.exec(request.headers.get('authorization') || '')
  if (!m) return null
  let a
  try { a = await authSettings(env, fetchImpl) } catch { return undefined }
  let r
  try { r = await fetchImpl(`${a.supabaseUrl}/auth/v1/user`, { headers: authHeaders(request, env, a, m[1]) }) } catch { return undefined }
  if (r.status === 401 || r.status === 403) return null
  if (!r.ok) return undefined
  const u = await r.json().catch(() => null)
  return u?.id && u.email ? { id: String(u.id), email: String(u.email) } : null
}

async function sign(request, env, fetchImpl, now) {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, { allow: 'POST' })
  const user = await userOf(request, env, fetchImpl)
  if (user === undefined) return json({ error: 'auth_unavailable' }, 503)
  if (!user) return json({ error: 'sign_in_required' }, 401)
  const uid = (await hmac(env.SIGNING_KEY, `reader|${user.id}`)).slice(0, 12)
  if (!allow(`sign:${uid}`, SIGN_LIMIT, now)) return json({ error: 'slow_down' }, 429, { 'retry-after': '60' })
  let body
  try { body = await request.json() } catch { return json({ error: 'bad_request' }, 400) }
  const paths = Array.isArray(body?.paths) ? body.paths : null
  if (!paths || !paths.length || paths.length > MAX_PATHS || !paths.every(p => typeof p === 'string' && PAGE_PATH.test(p))) return json({ error: 'bad_request' }, 400)
  const expires = Math.floor((now + SIGN_MS) / 1000), urls = {}
  for (const p of new Set(paths)) urls[p] = `${p}?e=${expires}&u=${uid}&s=${await hmac(env.SIGNING_KEY, `${p}|${expires}|${uid}`)}`
  const sessionSig = await hmac(env.SIGNING_KEY, `comic-session|${uid}|${expires}`)
  return json({ expires, urls }, 200, {
    'set-cookie': `${READER_COOKIE}=${uid}.${expires}.${sessionSig}; Max-Age=1800; Path=/comic/; HttpOnly; Secure; SameSite=Strict`,
  })
}

async function hasReaderCookie(request, env, uid, now) {
  const value = (request.headers.get('cookie') || '').split(';').map(s => s.trim()).find(s => s.startsWith(`${READER_COOKIE}=`))?.slice(READER_COOKIE.length + 1)
  const match = /^([0-9a-f]{12})\.(\d{10})\.([0-9a-f]{40})$/.exec(value || '')
  if (!match || match[1] !== uid) return false
  const expires = Number(match[2])
  if (expires * 1000 < now || expires * 1000 > now + SIGN_MS + 60000) return false
  return sameTag(match[3], await hmac(env.SIGNING_KEY, `comic-session|${uid}|${expires}`))
}

function logout(request) {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, { allow: 'POST' })
  return new Response(null, { status: 204, headers: {
    'cache-control': 'no-store',
    'set-cookie': `${READER_COOKIE}=; Max-Age=0; Path=/comic/; HttpOnly; Secure; SameSite=Strict`,
  } })
}

async function page(request, env, url, now) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, HEAD' } })
  const m = PAGE_PATH.exec(url.pathname)
  const deny = status => new Response('Not found', { status, headers: { 'cache-control': 'no-store' } })
  if (!m) return deny(404)
  // A page is only ever an <img> or WebGL texture on this site: not a tab of its own, a frame, or another site's image.
  const dest = request.headers.get('sec-fetch-dest'), site = request.headers.get('sec-fetch-site')
  if (dest && dest !== 'image') return deny(403)
  if (site && site !== 'same-origin') return deny(403)
  const e = Number(url.searchParams.get('e')), u = url.searchParams.get('u') || '', s = url.searchParams.get('s') || ''
  if (!Number.isInteger(e) || e * 1000 < now || e * 1000 > now + SIGN_MS + 60000 || !/^[0-9a-f]{12}$/.test(u) || !/^[0-9a-f]{40}$/.test(s)) return deny(403)
  if (!sameTag(s, await hmac(env.SIGNING_KEY, `${url.pathname}|${e}|${u}`))) return deny(403)
  if (!await hasReaderCookie(request, env, u, now)) return deny(403)
  if (!allow(`page:${u}`, PAGE_LIMIT, now)) return new Response('Too many pages', { status: 429, headers: { 'retry-after': '60', 'cache-control': 'no-store' } })
  const object = await env.PAGES.get(`reader/${m[1]}/${m[2]}.webp`)
  if (!object) return deny(404)
  return new Response(request.method === 'HEAD' ? null : object.body, { headers: {
    'content-type': 'image/webp', 'content-length': String(object.size),
    'cache-control': 'private, no-store', 'content-disposition': 'inline', 'x-robots-tag': 'noindex',
    'cross-origin-resource-policy': 'same-origin', 'x-content-type-options': 'nosniff',
  } })
}

export default {
  async fetch(request, env, ctx, { fetchImpl = fetch, now = Date.now() } = {}) {
    const url = new URL(request.url)
    if (url.pathname.startsWith('/session/')) return session(request, env, fetchImpl, () => authSettings(env, fetchImpl))
    if (url.pathname === '/comic/sign') return sign(request, env, fetchImpl, now)
    if (url.pathname === '/comic/logout') return logout(request)
    if (url.pathname.startsWith('/comic/')) return page(request, env, url, now)
    return env.ASSETS.fetch(request)
  },
}
