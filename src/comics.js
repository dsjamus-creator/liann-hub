// Comic reader data. The reader shows one page image at a time from data/comics.json:
//   { "episodes": [ { "id": "ep1", "title": "Episode 1", "number": 1, "summary": "...", "cover": "<url>",
//                     "pages": [ "<url>" | { "src": "<url>", "alt": "describes the page" }, ... ] } ] }
// Page and cover URLs are https (or relative to the hub). An episode with no usable page is dropped.
import { safeFileUrl } from './downloads.js'

export function parseComics(json, base) {
  const list = Array.isArray(json) ? json : Array.isArray(json?.episodes) ? json.episodes : []
  return list.map(raw => {
    if (!raw || typeof raw.id !== 'string' || !raw.id.trim() || typeof raw.title !== 'string') return null
    const pages = [], alts = []
    for (const p of Array.isArray(raw.pages) ? raw.pages : []) {
      const href = safeFileUrl(typeof p === 'string' ? p : p?.src, base)
      if (!href) continue
      pages.push(href); alts.push(typeof p === 'object' && typeof p.alt === 'string' ? p.alt : '')
    }
    if (!pages.length) return null
    return {
      id: raw.id.trim(), title: raw.title,
      number: Number.isFinite(raw.number) ? raw.number : null,
      summary: typeof raw.summary === 'string' ? raw.summary : '',
      cover: safeFileUrl(raw.cover, base) || pages[0],
      pages, alts,
    }
  }).filter(Boolean).sort((a, b) => (a.number ?? Infinity) - (b.number ?? Infinity))
}

export const clampPage = (i, count) => Math.min(Math.max(Number.isInteger(i) ? i : 0, 0), Math.max(count - 1, 0))

// Two-page spreads: the cover sits alone on the right, then pages pair up (2-3, 4-5 ...); an odd last page sits alone on the left.
export function spreadsOf(count) {
  if (count < 1) return []
  const out = [[null, 0]]
  for (let i = 1; i < count; i += 2) out.push([i, i + 1 < count ? i + 1 : null])
  return out
}
export const spreadIndexOf = i => (i > 0 ? Math.ceil(i / 2) : 0)
export const firstPageOf = spread => spread[0] ?? spread[1]
// The page numbers on screen now, as [left, right] for a spread or [page] for a single page.
export const visiblePages = (i, count, spread) => (spread ? spreadsOf(count)[spreadIndexOf(i, count)] : [i])

// Magnifier lens: where the cursor falls on a page image shown with object-fit: contain, and how to paint the
// lens background so that point is magnified. box = the <img> element's rectangle (client px), natural = the image's
// own size, align = which edge the page is pushed against in its box ('left' | 'right' | 'center').
export function lensGeometry({ box, natural, align, x, y, zoom, size }) {
  if (!natural.w || !natural.h || !box.width || !box.height) return null
  const k = Math.min(box.width / natural.w, box.height / natural.h)
  const dw = natural.w * k, dh = natural.h * k
  const ox = align === 'left' ? 0 : align === 'right' ? box.width - dw : (box.width - dw) / 2
  const oy = (box.height - dh) / 2
  const px = x - box.left - ox, py = y - box.top - oy
  if (px < 0 || py < 0 || px > dw || py > dh) return null
  return { bgSize: [dw * zoom, dh * zoom], bgPos: [size / 2 - px * zoom, size / 2 - py * zoom] }
}

export async function loadComics(url, fetchImpl = fetch) {
  const base = new URL('./', globalThis.location?.href || 'https://app.lwliann.com/').href
  const response = await fetchImpl(new URL(url, base).href, { cache: 'no-cache' })
  if (!response.ok) throw new Error(`Episodes unavailable (HTTP ${response.status})`)
  return parseComics(await response.json(), base)
}
