// Reads the registry's downloads manifest (downloads/manifest.json). An entry is offered for download only
// when it names a file, its size and its SHA-256; anything else shows as "waiting for the latest file".

const SHA256 = /^[0-9a-f]{64}$/

export function safeFileUrl(file, base) {
  if (typeof file !== 'string' || !file.trim()) return null
  let url
  try { url = new URL(file, base) } catch { return null }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1'))) return null
  if (file.split(/[\\/]/).includes('..')) return null
  return url.href
}

export function normaliseEntry(raw, base) {
  if (!raw || typeof raw !== 'object' || typeof raw.hubSlot !== 'string' || typeof raw.name !== 'string') return null
  const href = safeFileUrl(raw.file, base)
  const bytes = Number.isSafeInteger(raw.bytes) && raw.bytes > 0 ? raw.bytes : null
  const sha256 = typeof raw.sha256 === 'string' && SHA256.test(raw.sha256.toLowerCase()) ? raw.sha256.toLowerCase() : null
  return {
    slot: raw.hubSlot,
    product: String(raw.product || ''),
    name: raw.name,
    version: raw.version ? String(raw.version) : null,
    platform: raw.platform ? String(raw.platform) : '',
    builtAt: raw.builtAt ? String(raw.builtAt) : null,
    sourceRepo: raw.sourceRepo ? String(raw.sourceRepo) : null,
    sourceCommit: raw.sourceCommit ? String(raw.sourceCommit) : null,
    licenceNotes: raw.licenceNotes ? String(raw.licenceNotes) : null,
    href, bytes, sha256,
    available: Boolean(href && bytes && sha256),
  }
}

export function parseManifest(json, base) {
  const list = Array.isArray(json) ? json : Array.isArray(json?.items) ? json.items : []
  return list.map(item => normaliseEntry(item, base)).filter(Boolean)
}

export function formatBytes(n) {
  if (!n) return ''
  const units = ['bytes', 'KB', 'MB', 'GB']
  let i = 0, v = n
  while (v >= 1000 && i < units.length - 1) { v /= 1000; i++ }
  return `${i ? v.toFixed(v < 10 ? 1 : 0) : v} ${units[i]}`
}

export async function loadDownloads(url, fetchImpl = fetch) {
  const base = new URL(url, globalThis.location?.href || 'https://app.lwliann.com/').href
  const response = await fetchImpl(base, { cache: 'no-cache' })
  if (!response.ok) throw new Error(`Downloads list unavailable (HTTP ${response.status})`)
  return parseManifest(await response.json(), base)
}
