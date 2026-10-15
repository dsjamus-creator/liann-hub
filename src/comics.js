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

export async function loadComics(url, fetchImpl = fetch) {
  const base = new URL('./', globalThis.location?.href || 'https://app.lwliann.com/').href
  const response = await fetchImpl(new URL(url, base).href, { cache: 'no-cache' })
  if (!response.ok) throw new Error(`Episodes unavailable (HTTP ${response.status})`)
  return parseComics(await response.json(), base)
}
