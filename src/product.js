// A product page: app.lwliann.com/<id>. Public, no sign-in. One record per product in data/products.json
// (DEPLOYMENT-AND-STOREFRONT-PLAN 2026-10-24 §4): the page renders Open, a store badge or a Download from the
// same record, the visitor's own platform first. Files come from data/downloads.json and are offered only with
// a size and a SHA-256, as on the Downloads page. Looks and theme follow the hub (styles.css, liann-hub-theme).

import { config } from './config.js'
import { art, esc, ico, DS, LOCKUP } from './views.js'
import { loadDownloads, formatBytes } from './downloads.js'

export const STORES = {
  play: { get: 'Get it on Google Play', soon: 'Coming to Google Play' },
  appstore: { get: 'Download on the App Store', soon: 'Coming to the App Store' },
  microsoft: { get: 'Get from Microsoft Store', soon: 'Coming to the Microsoft Store' },
  chrome: { get: 'Add to Chrome', soon: 'Coming to the Chrome Web Store' },
  edge: { get: 'Add to Edge', soon: 'Coming to Edge Add-ons' },
}
export const STORE_NAMES = { play: 'Google Play', appstore: 'App Store', microsoft: 'Microsoft Store', chrome: 'Chrome Web Store', edge: 'Edge Add-ons' }
export const OS = { web: 'Web', android: 'Android', ios: 'iPhone and iPad', windows: 'Windows', mac: 'Mac', chrome: 'Chrome', edge: 'Edge' }

// The visitor's platform from the user agent: enough to put their row first, never to hide the others.
export function detectOS(ua = globalThis.navigator?.userAgent || '') {
  if (/android/i.test(ua)) return 'android'
  if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && (globalThis.navigator?.maxTouchPoints || 0) > 1)) return 'ios'
  if (/windows/i.test(ua)) return 'windows'
  if (/macintosh|mac os x/i.test(ua)) return 'mac'
  if (/cros/i.test(ua)) return 'chrome'
  return 'other'
}

// The visitor's own row first, then the web, then the rest in the record's order. Chrome and Edge rows count as
// desktop rows: a Windows or Mac visitor sees them before phone rows.
export function orderPlatforms(platforms, os) {
  const rank = p => p.os === os ? 0 : (os === 'windows' || os === 'mac') && (p.os === 'chrome' || p.os === 'edge') ? 1 : p.os === 'web' ? 2 : 3
  return platforms.map((p, i) => [rank(p), i, p]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(x => x[2])
}

// What one platform row offers, from the record plus the downloads manifest. Wording and shape follow the
// Apps cards (views.js statusOf/appCard): a primary Open or Download, a ghost store badge, and a dot status line.
export function platformModel(p, downloads) {
  const file = p.slot ? (downloads || []).find(d => d.slot === p.slot) : null
  const store = p.store && STORES[p.store]
  const buttons = []
  if (store) buttons.push(p.storeUrl ? { kind: 'store', label: store.get, href: p.storeUrl, primary: !p.url } : { kind: 'store', label: store.soon, disabled: true })
  if (p.slot) buttons.push(file?.available
    ? { kind: 'file', label: 'Download', href: file.href, primary: !p.url && !p.storeUrl, meta: `Version ${file.version || '—'} · ${formatBytes(file.bytes)}` }
    : { kind: 'file', label: 'Download', disabled: true })
  if (p.url) buttons.push({ kind: 'open', label: 'Open', href: p.url, primary: true })
  const sub = [store ? STORE_NAMES[p.store] : p.os === 'web' ? 'In your browser' : '', p.slot ? (p.os === 'chrome' || p.os === 'edge' ? 'preview build' : 'download') : ''].filter(Boolean).join(' · ')
  let status
  if (p.url || p.storeUrl) status = { cls: '', text: 'Ready' }
  else if (file?.available) status = { cls: '', text: `Version ${file.version || '—'} · Download` }
  else if (p.slot) status = { cls: 'up', text: 'Waiting for the latest file' }
  else status = { cls: '', text: 'Coming soon' }
  return { os: p.os, label: OS[p.os] || p.os, sub, status, note: p.note || '', buttons }
}

const button = b => {
  if (b.disabled) return `<button class="btn ghost" disabled>${esc(b.label)}</button>`
  const attrs = b.kind === 'file' ? 'download rel="noopener"' : 'target="_blank" rel="noopener"'
  return `<a class="btn${b.primary ? '' : ' ghost'}" href="${esc(b.href)}" ${attrs}>${esc(b.label)}</a>`
}

const row = (m, glyph) => `<div class="c prow" data-os="${esc(m.os)}"><div class="h"><div class="tile">${esc(glyph)}</div><div><div class="t">${esc(m.label)}</div><div class="s">${esc(m.sub)}</div></div></div>
  <div class="status ${m.status.cls}">${esc(m.status.text)}</div><div class="d">${esc(m.note || m.buttons.find(b => b.meta)?.meta || '')}</div>
  ${m.note && m.buttons.some(b => b.meta) ? `<div class="d">${esc(m.buttons.find(b => b.meta).meta)}</div>` : ''}<div class="acts">${m.buttons.map(button).join('')}</div></div>`

// Light and dark, as in the hub's Appearance settings: same storage key, so the choice follows the visitor
// between the hub and every product page.
export const THEME_SWITCH = `<div class="pmodes" role="group" aria-label="Theme">${['light', 'dark'].map(m => `<button type="button" class="chip" data-mode="${m}" aria-pressed="false">${m === 'light' ? 'Light' : 'Dark'}</button>`).join('')}</div>`

export function setThemeMode(mode, root = document.documentElement, storage = globalThis.localStorage) {
  if (!/^(light|dark)$/.test(mode)) return
  root.dataset.t = mode
  try {
    const saved = JSON.parse(storage.getItem('liann-hub-theme') || 'null')
    storage.setItem('liann-hub-theme', JSON.stringify({ ds: saved && DS.some(d => d[0] === saved.ds) ? saved.ds : root.dataset.ds || 'liann', t: mode }))
  } catch { /* storage blocked: the choice lasts for this page only */ }
}

function bindThemeSwitch(host, root = document.documentElement) {
  const buttons = [...host.querySelectorAll('.pmodes [data-mode]')]
  const sync = () => buttons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === root.dataset.t)))
  buttons.forEach(b => { b.onclick = () => { setThemeMode(b.dataset.mode, root); sync() } })
  sync()
}

export function productHTML(product, downloads, os, others = []) {
  const rows = orderPlatforms(product.platforms, os).map(p => platformModel(p, downloads))
  const links = (product.links || []).map(([t, h]) => `<li><a href="${esc(h)}" target="_blank" rel="noopener">${esc(t)}</a></li>`).join('')
  return `<div class="product fade">
  <header class="ptop"><a class="plock" href="/" aria-label="Learning with LiANN hub">${LOCKUP}</a>
    <nav class="plinks"><a href="/#apps">All apps</a><a href="/#downloads">Downloads</a>${THEME_SWITCH}</nav></header>
  <main class="pmain">
    <section class="hero"><div class="pic">${art(product.app)}</div>
      <div class="txt"><div class="eyebrow">${esc(product.kind)}</div><h1>${esc(product.name)}</h1><p class="lead">${esc(product.oneLine)}</p><p class="muted">${esc(product.audience)}</p></div></section>
    <section class="sec"><div class="sechead"><h2>Get it</h2><span class="muted" style="font-size:.85rem">${rows[0] && rows[0].os === os ? `Your device first: ${esc(rows[0].label)}` : 'Every platform'}</span></div>
      <div class="grid prows">${rows.map(m => row(m, product.glyph)).join('')}</div>
      <p class="muted" style="margin:0;font-size:.85rem">Every file is listed from a signed-off manifest with its version and size. Store listings open here as they go live.</p></section>
    <section class="sec"><div class="sechead"><h2>What it does</h2></div><ul class="points">${(product.points || []).map(t => `<li>${esc(t)}</li>`).join('')}</ul></section>
    <section class="sec"><div class="sechead"><h2>Guides and help</h2></div><ul class="plist">${links}${product.privacyUrl ? `<li><a href="${esc(product.privacyUrl)}" target="_blank" rel="noopener">Privacy notice</a></li>` : ''}${product.support ? `<li><a href="mailto:${esc(product.support)}">${esc(product.support)}</a></li>` : ''}</ul></section>
    ${others.length ? `<section class="sec"><div class="sechead"><h2>Also from Learning with LiANN</h2></div><div class="chips">${others.map(o => `<a class="chip" href="/${esc(o.id)}"><span class="han">${esc(o.glyph)}</span> ${esc(o.name)}</a>`).join('')}</div></section>` : ''}
  </main>
  <footer class="pfoot muted"><span class="wm" style="font-size:1rem"><span class="pre">Learning with</span><span class="nm">LiANN</span></span> · Multilingual education through Entertainment · a YOLO TECH Ltd product · <a href="/">app.lwliann.com</a></footer>
</div>`
}

export async function loadProducts(url = 'data/products.json', fetchImpl = fetch) {
  const r = await fetchImpl(url, { cache: 'no-cache' })
  if (!r.ok) throw new Error(`Products unavailable (HTTP ${r.status})`)
  const list = (await r.json()).products
  return Array.isArray(list) ? list.filter(p => p && typeof p.id === 'string' && Array.isArray(p.platforms)) : []
}

function applyStoredTheme() {
  try {
    const t = JSON.parse(localStorage.getItem('liann-hub-theme') || 'null')
    if (t && DS.some(d => d[0] === t.ds) && /^(light|dark)$/.test(t.t)) { document.documentElement.dataset.ds = t.ds; document.documentElement.dataset.t = t.t }
  } catch { /* storage blocked: keep the page's own theme */ }
}

// Products that stay documented apart (DEPLOYMENT-AND-STOREFRONT-PLAN §4.5): Dual Subs and PolyFlow never list
// each other under "Also from". Dual Subs and AlongSide may.
export const APART = [['dual-subs', 'polyflow']]
export function alsoFrom(products, slug) {
  return products.filter(p => p.id !== slug && !APART.some(pair => pair.includes(slug) && pair.includes(p.id)))
}

export async function mount(root = document.getElementById('root'), slug = document.documentElement.dataset.product) {
  applyStoredTheme()
  const [products, downloads] = await Promise.all([loadProducts(), loadDownloads(config.downloadsManifest).catch(() => [])])
  const product = products.find(p => p.id === slug)
  if (!product) { root.innerHTML = `<div class="gate"><div class="card"><h1>That app isn't here</h1><p class="muted" style="margin:0"><a href="/#apps">See every app</a></p></div></div>`; return }
  document.title = `${product.name} · Learning with LiANN`
  root.innerHTML = productHTML(product, downloads, detectOS(), alsoFrom(products, slug))
  bindThemeSwitch(root)
}

if (typeof document !== 'undefined' && document.documentElement.dataset.product) mount().catch(e => { document.getElementById('root').innerHTML = `<div class="gate"><div class="card"><p class="err">${esc(e.message)}</p></div></div>` })

export { ico }
