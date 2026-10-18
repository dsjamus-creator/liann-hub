// Protected comic pages. A page whose address is /comic/<episode>/<page>.webp on the hub is not a public file: the hub asks its
// Worker for short-lived signed links (POST /comic/sign, signed-in users only) and uses those. Anything else, such as the
// covers on downloads.lwliann.com, is used as it is. See worker/index.js and docs/COMIC-PROTECTION.md.

const PROTECTED = /^\/comic\/[a-z0-9-]+\/[a-z0-9-]+\.webp$/
const REFRESH_BEFORE_MS = 10 * 60 * 1000

export class PagesError extends Error {
  constructor(message, code) { super(message); this.code = code }
}

export function comicPath(href, origin) {
  try { const u = new URL(href); return u.origin === origin && !u.search && PROTECTED.test(u.pathname) ? u.pathname : null } catch { return null }
}

export function createPageSigner({ getToken, fetchImpl = (...a) => fetch(...a), origin = globalThis.location?.origin, now = () => Date.now() }) {
  const links = new Map() // path -> { href, until }

  // The signed address of every page of an episode, in order (pages that are not protected stay as they are).
  // Fetches fresh links first when any is missing or close to expiring.
  async function pagesOf(ep) {
    const paths = ep.raw.map(h => comicPath(h, origin))
    const wanted = [...new Set(paths.filter(Boolean))]
    if (wanted.some(p => !links.has(p) || links.get(p).until - now() < REFRESH_BEFORE_MS)) {
      const token = await getToken().catch(() => null) // a visitor who is not signed in reads the comic too
      let response
      try { response = await fetchImpl(new URL('/comic/sign', origin).href, { method: 'POST', cache: 'no-store', referrerPolicy: 'no-referrer',
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ paths: wanted }) }) }
      catch { throw new PagesError('Could not reach the server. Check your connection and try again.', 'network') }
      if (response.status === 429) throw new PagesError('Too many pages opened at once. Wait a minute and try again.', 'slow_down')
      if (!response.ok) throw new PagesError('The comic is unavailable right now.', 'unavailable')
      const body = await response.json().catch(() => ({}))
      const until = Number(body.expires) * 1000
      if (!Number.isFinite(until) || !body.urls) throw new PagesError('The comic is unavailable right now.', 'unavailable')
      for (const p of wanted) {
        const link = body.urls[p]
        if (typeof link !== 'string' || !link.startsWith(`${p}?`)) throw new PagesError('The comic is unavailable right now.', 'unavailable')
        links.set(p, { href: new URL(link, origin).href, until })
      }
    }
    return paths.map((p, i) => (p ? links.get(p).href : ep.raw[i]))
  }

  return { pagesOf }
}

// A faint tiled mark laid over the whole reader: the signed-in address, or a viewing code for a visitor who is not signed in.
// It shows in a screenshot, so a leaked page carries the mark of whoever opened it.
export function watermarkStyle(email) {
  const text = String(email || 'LiANN').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]))
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><text x="160" y="90" transform="rotate(-24 160 90)" text-anchor="middle" font-family="sans-serif" font-size="15" font-weight="700" fill="#808080" fill-opacity="0.16">${text}</text></svg>`
  return `background-image:url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}
