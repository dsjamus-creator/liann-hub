// Learning with LiANN hub Worker. The site itself is static assets; this code only runs for /comic/*, the comic pages.
//
//   POST /comic/sign   body { paths: ["/comic/ep-01/000.webp", ...] }   optional Authorization: Bearer <Supabase access token>
//        -> { expires, urls: { "<path>": "<path>?e=..&u=..&s=.." } }   Anyone can read (the comic links are public); a signed-in
//        LiANN user's links are tied to their account, everyone else's to a hash of their address. Links last 30 minutes.
//   GET  /comic/<episode>/<page>.webp?e=..&u=..&s=..                   One page image, read from the private R2 bucket (key reader/<episode>/<page>.webp).
//
// The page files are not public: they live in the liann-reader bucket, which has no public address (docs/COMIC-PROTECTION.md).
// Per-address counters live in this isolate's memory, so they are a brake on bulk copying, not an exact limit.

const SIGN_MS = 30 * 60 * 1000
const PAGE_PATH = /^\/comic\/([a-z0-9-]{1,40})\/([a-z0-9-]{1,40})\.webp$/
const SIGN_LIMIT = [120, 10 * 60 * 1000]  // sign requests per reader (account, or address) in 10 minutes
const PAGE_LIMIT = [1500, 10 * 60 * 1000] // page images per reader in 10 minutes (a classroom can share one address)
const MAX_PATHS = 120

const enc = new TextEncoder()
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extra } })

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
  try { r = await fetchImpl(`${a.supabaseUrl}/auth/v1/user`, { headers: { apikey: a.publishableKey, authorization: `Bearer ${m[1]}` } }) } catch { return undefined }
  if (r.status === 401 || r.status === 403) return null
  if (!r.ok) return undefined
  const u = await r.json().catch(() => null)
  return u?.id && u.email ? { id: String(u.id), email: String(u.email) } : null
}

async function sign(request, env, fetchImpl, now) {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, { allow: 'POST' })
  // A signed-in user is known by account; everyone else (the comic links are public) by a hash of their address.
  const user = await userOf(request, env, fetchImpl)
  const who = user ? user.id : `ip:${request.headers.get('cf-connecting-ip') || 'unknown'}`
  const uid = (await hmac(env.SIGNING_KEY, `reader|${who}`)).slice(0, 12)
  if (!allow(`sign:${uid}`, SIGN_LIMIT, now)) return json({ error: 'slow_down' }, 429, { 'retry-after': '60' })
  let body
  try { body = await request.json() } catch { return json({ error: 'bad_request' }, 400) }
  const paths = Array.isArray(body?.paths) ? body.paths : null
  if (!paths || !paths.length || paths.length > MAX_PATHS || !paths.every(p => typeof p === 'string' && PAGE_PATH.test(p))) return json({ error: 'bad_request' }, 400)
  const expires = Math.floor((now + SIGN_MS) / 1000), urls = {}
  for (const p of new Set(paths)) urls[p] = `${p}?e=${expires}&u=${uid}&s=${await hmac(env.SIGNING_KEY, `${p}|${expires}|${uid}`)}`
  return json({ expires, urls })
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
  if (s !== await hmac(env.SIGNING_KEY, `${url.pathname}|${e}|${u}`)) return deny(403)
  if (!allow(`page:${u}`, PAGE_LIMIT, now)) return new Response('Too many pages', { status: 429, headers: { 'retry-after': '60', 'cache-control': 'no-store' } })
  const object = await env.PAGES.get(`reader/${m[1]}/${m[2]}.webp`)
  if (!object) return deny(404)
  return new Response(request.method === 'HEAD' ? null : object.body, { headers: {
    'content-type': 'image/webp', 'content-length': String(object.size),
    'cache-control': 'private, max-age=1800', 'content-disposition': 'inline', 'x-robots-tag': 'noindex',
    'cross-origin-resource-policy': 'same-origin', 'x-content-type-options': 'nosniff',
  } })
}

export default {
  async fetch(request, env, ctx, { fetchImpl = fetch, now = Date.now() } = {}) {
    const url = new URL(request.url)
    if (url.pathname === '/comic/sign') return sign(request, env, fetchImpl, now)
    if (url.pathname.startsWith('/comic/')) return page(request, env, url, now)
    return env.ASSETS.fetch(request)
  },
}
