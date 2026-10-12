// Pure render functions: state in, HTML string out. Markup and art follow the approved mockup.
import { APPS, NAV, appUrl } from './config.js'
import { formatBytes } from './downloads.js'

const I = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h5v-6h4v6h5V9.5"/>',
  apps: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="3.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  library: '<path d="M4 19.5V5a2 2 0 0 1 2-2h12v15H6a2 2 0 0 0-2 2v0a2 2 0 0 0 2 2h12"/><path d="M8 7h6"/>',
  read: '<path d="M2 5h7a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H2z"/><path d="M22 5h-7a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h8z"/>',
  kids: '<path d="M14.5 3.5l6 6L9 21H3v-6z"/><path d="M12.5 5.5l6 6"/>',
  downloads: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 19h16"/>',
  plan: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  send: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.8 1.8-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.7 1.7-1.7H16a5 5 0 0 0 5-5c0-4-4-7.2-9-7.2z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/>',
}
export const ico = (n, s = 22) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n]}</svg>`

export function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])) }

export const DS = [['liann', 'LiANN', 'Canonical sage, coral and porcelain', ['#FBF6EE', '#8A9B7E', '#C24837']],
  ['amberline', 'Amberline', 'Warm parchment and amber', ['#FBF9F5', '#B07C2D', '#2E8B7B']],
  ['steelline', 'Steelline', 'Platinum and steel blue', ['#EDF0F4', '#6E7E90', '#4A7196']],
  ['cadence', 'Cadence', 'Stage darks, paper and brass', ['#FAF5EC', '#A86A1F', '#E0A141']],
  ['ivoryline', 'Ivoryline', 'Warm ivory and wood', ['#EFE2C8', '#947641', '#8F5C20']]]

const LOCKUP = '<div class="lockup" aria-label="Learning with LiANN"><span class="wm"><span class="pre">Learning with</span><span class="nm">LiANN</span></span><span class="strap">Multilingual education through Entertainment</span></div>'

const SHAPES = {
  note: '<svg viewBox="0 0 60 100" class="CLS" style="STY"><ellipse cx="22" cy="82" rx="17" ry="12.5" transform="rotate(-22 22 82)" fill="currentColor"/><rect x="33" y="8" width="6" height="74" rx="3" fill="currentColor"/><path d="M36 8 C40 30 64 36 54 64 C53 48 46 41 36 38 Z" fill="currentColor"/></svg>',
  pair: '<svg viewBox="0 0 100 100" class="CLS" style="STY"><ellipse cx="20" cy="84" rx="16" ry="12" transform="rotate(-20 20 84)" fill="currentColor"/><ellipse cx="78" cy="74" rx="16" ry="12" transform="rotate(-20 78 74)" fill="currentColor"/><rect x="30" y="22" width="6" height="62" fill="currentColor"/><rect x="88" y="10" width="6" height="64" fill="currentColor"/><path d="M30 22 L94 8 L94 22 L30 36 Z M30 42 L94 28 L94 40 L30 54 Z" fill="currentColor"/></svg>',
  talk: '<svg viewBox="0 0 100 92" class="CLS" style="STY"><path d="M50 8C76 8 94 22 94 40S76 70 54 70H44L30 86L33 67C17 62 6 52 6 40C6 22 24 8 50 8Z" fill="none" stroke="currentColor" stroke-width="5" stroke-linejoin="round"/><circle cx="34" cy="40" r="5.5" fill="currentColor"/><circle cx="50" cy="40" r="5.5" fill="currentColor"/><circle cx="66" cy="40" r="5.5" fill="currentColor"/></svg>',
  empty: '<svg viewBox="0 0 100 92" class="CLS" style="STY"><path d="M50 8C76 8 94 22 94 40S76 70 54 70H44L30 86L33 67C17 62 6 52 6 40C6 22 24 8 50 8Z" fill="none" stroke="currentColor" stroke-width="5" stroke-linejoin="round"/></svg>',
}
const DECOR = [['empty', 3, 4, 150, .18, -8, 0, 1], ['note', 14, 58, 64, .55, 6, 1.2, 0], ['talk', 6, 72, 110, .32, 4, .6, 0], ['pair', 78, 66, 120, .45, 0, 2, 0],
  ['note', 86, 10, 44, .22, -4, .3, 1], ['talk', 70, 8, 96, .38, 6, 1.6, 0], ['note', 58, 82, 40, .2, 10, 2.4, 1], ['pair', 30, 6, 58, .14, -10, 1, 1], ['empty', 88, 40, 70, .16, 10, .9, 1]]
const decor = () => `<div class="decor" aria-hidden="true">${DECOR.map(([k, x, y, w, o, r, d, wide]) => SHAPES[k].replace('CLS', 'fl' + (wide ? ' wide' : '')).replace('STY', `left:${x}%;top:${y}%;width:${w}px;opacity:${o};rotate:${r}deg;animation-delay:-${d}s`)).join('')}</div>`

export function art(id) {
  const img = (src, pos, bg, label, extra = '') => `<div class="cart img" style="background-image:url(assets/${src});background-position:${pos};background-color:${bg};${extra}" role="img" aria-label="${label}"></div>`
  if (id === 'tones') {
    const P = [[4, 50, 'w', '月亮', 'yueliang'], [50, 50, 'm', 'moon'], [96, 50, 'w', '声调', 'shengdiao'], [142, 50, 'm', 'tone'], [188, 50, 'w', '一半', 'yiban'], [27, 12, 'w lit', '一般', 'yiban'], [73, 12, 'm lit', 'ordinary'], [119, 12, 'm', 'half']]
    return `<div class="cart" style="background:radial-gradient(120% 120% at 30% 20%,#4C6145,#26331F)"><div class="stack">${P.map(([x, y, c, t, py]) => `<span class="mb ${c}" style="left:${x}px;top:${y}px">${c.startsWith('w') ? `<span class="z">${t}</span><span class="p">${py}</span>` : `<span class="e">${t}</span>`}</span>`).join('')}</div><div class="tonepick">${[1, 2, 3, 4, 5].map(n => `<b class="${n === 4 ? 'on' : ''}">${n}</b>`).join('')}</div></div>`
  }
  if (id === 'tiles') return img('tiles-1.jpg', 'center', '#5A6852', 'A Pinyin Tiles example board with horizontal and vertical words', 'background-size:contain;background-repeat:no-repeat')
  if (id === 'puzzle') return img('puzzle-1.jpg', 'center', '#2E412C', 'A Pinyin Puzzle board with across and down clue lists', 'background-size:contain;background-repeat:no-repeat')
  if (id === 'dash') return img('alongside-1.jpg', 'left top', '#1B1C18', 'AlongSide whiteboard with the import menu and saved words panel')
  if (id === 'poly') return img('polyflow-1.jpg', 'center bottom', '#24211C', 'PolyFlow advancing a lyric line with pinyin and English over a piano keyboard')
  if (id === 'lyric') return img('lyricsync-1.jpg', 'center', '#D8D2C6', 'LyricSync panels: on-screen subtitles capture and burned-in lyrics OCR')
  if (id === 'dual') return img('dualsubs-1.jpg', 'center 40%', '#1E1B17', 'Dual Subs on a music video: Chinese, pinyin and English lines')
  if (id === 'read') return img('comic-1.jpg', 'center 35%', '#ddd', 'Bella in the cockpit, from Bella & LiANN')
  if (id === 'kids') return img('colouring-1.jpg', 'center', '#FDEFCB', 'Colouring page: Bella landing the ship, half coloured in')
  if (id === 'trans') return '<div class="cart" style="background:radial-gradient(110% 120% at 20% 30%,#3A2C26,#15120F)"><span class="soon">练</span><span class="ytb" style="left:auto;right:10px;background:#E8AE46;color:#1C1608">Coming soon</span></div>'
  if (id === 'setlist') return '<div class="cart" style="background:linear-gradient(160deg,#5F7457,#3B4A35)"><span class="soon" style="color:#FDEFCB;-webkit-text-stroke:0;text-shadow:none;font-size:56px">表</span></div>'
  return ''
}

export const profileOf = user => {
  const local = String(user?.email || '').split('@')[0].replace(/[._+-]+/g, ' ').trim()
  const name = local ? local.replace(/\b\w/g, c => c.toUpperCase()) : 'You'
  return { name, g: name[0].toUpperCase() }
}

function greeting(hour) { return hour < 12 ? ['Good morning', '早上好'] : hour < 18 ? ['Good afternoon', '下午好'] : ['Good evening', '晚上好'] }

export function vLoading() { return `<div class="gate fade">${decor()}<div class="card">${LOCKUP}<p class="muted" style="margin:0">Loading…</p></div></div>` }

export function vEmail(s) {
  return `<div class="gate fade">${decor()}<form class="card" id="f1" novalidate>
  ${LOCKUP}
  <h1>Sign in or create your account</h1>
  <div class="field"><label for="em">Email</label><input id="em" type="email" required placeholder="you@example.com" value="${esc(s.email)}" autocomplete="email"></div>
  <p id="fix" class="note" ${s.fix ? '' : 'hidden'}>${s.fix ? `Did you mean <button type="button" class="link" id="usefix" style="color:var(--accent);padding:0">${esc(s.fix)}</button>? Press the button again to keep what you typed.` : ''}</p>
  ${s.error ? `<p class="note err" role="alert">${esc(s.error)}</p>` : ''}
  <button class="btn" type="submit" ${s.busy ? 'disabled' : ''}>${s.busy ? 'Sending…' : 'Send me a code'}</button>
  <p class="note muted">No password. We email a 6-digit code each time you sign in. For ages 13 and over.</p></form></div>`
}

export function vCode(s) {
  return `<div class="gate fade">${decor()}<form class="card" id="f2" novalidate>
  ${LOCKUP}
  <h1>Enter the code we sent</h1>
  <p class="muted" style="margin:0">Sent to <b>${esc(s.email)}</b>. Check your spam folder if it hasn't arrived.</p>
  <div class="code">${[0, 1, 2, 3, 4, 5].map(i => `<input id="c${i}" inputmode="numeric" autocomplete="${i ? 'off' : 'one-time-code'}" maxlength="1" aria-label="Digit ${i + 1}">`).join('')}</div>
  ${s.error ? `<p class="note err" role="alert">${esc(s.error)}</p>` : ''}
  <button class="btn" type="submit" ${s.busy ? 'disabled' : ''}>${s.busy ? 'Checking…' : 'Sign in'}</button>
  <div style="display:flex;justify-content:space-between"><button type="button" class="link" id="back">Use a different email</button><button type="button" class="link" id="resend">Resend code</button></div></form></div>`
}

export function vWho(s) {
  const p = profileOf(s.user)
  return `<div class="who fade">${decor()}<div class="whohead">${LOCKUP}</div><h1>Who's learning?</h1><div class="profiles">
  <button class="prof" id="pick"><div class="tile" style="font-size:inherit"><span>${esc(p.g)}</span></div><span style="display:grid;gap:2px">${esc(p.name)}<span style="font-size:.75em;font-weight:700">${esc(s.user.email)}</span></span></button>
  <div class="prof" aria-disabled="true" title="Family profiles arrive with Family plans"><div class="add">+</div>Add profile<span class="lock muted">With Family plans</span></div></div>
  <div><button class="btn ghost" id="signout">Sign out</button></div></div>`
}

const rItem = page => ([k, l]) => `<button class="ritem" data-nav="${k}" ${page === k ? 'aria-current="page"' : ''} title="${l}"><span class="ic">${ico(k)}</span><span class="lbl">${l}</span></button>`

export function statusOf(app, downloads) {
  if (app.st === 'ok') return { cls: '', text: 'Ready' }
  if (app.st === 'soon') return { cls: '', text: 'Coming soon' }
  const entry = (downloads || []).find(d => d.slot === app.slot)
  if (entry?.available) return { cls: '', text: `Version ${entry.version || '—'} · ${app.st === 'desk' ? 'Desktop only' : 'Download'}` }
  return { cls: 'up', text: app.id === 'tones' ? 'Unity build on its way' : 'Waiting for the latest file' }
}

export function appCard(app, s) {
  const st = statusOf(app, s.downloads)
  const url = appUrl(app)
  const act = app.st === 'ok' ? `<a class="btn" href="${esc(url)}" target="_blank" rel="noopener" data-open="${app.id}">Open</a>`
    : app.st === 'soon' ? '<button class="btn ghost" disabled>Coming soon</button>'
      : `<button class="btn ghost" data-nav="downloads">Get</button>`
  return `<div class="c" data-app="${app.id}">${app.yt ? `<div style="position:relative">${art(app.id)}<span class="ytb">▶ YouTube app</span></div>` : art(app.id)}<div class="h"><div class="tile">${app.g}</div><div><div class="t">${esc(app.name)}</div><div class="s">${esc(app.kind)}</div></div></div>
  <div class="status ${st.cls}">${esc(st.text)}</div><div class="d">${esc(app.desc)}</div><div class="acts">${act}</div></div>`
}

const GAMES = () => APPS.filter(a => a.kind.startsWith('Game'))
const TOOLS = () => APPS.filter(a => !a.kind.startsWith('Game'))

function matches(q, ...fields) { const n = q.trim().toLowerCase(); return !n || fields.some(f => String(f || '').toLowerCase().includes(n)) }

const SOURCES = { 'pinyin-tiles': 'Pinyin Tiles', 'pinyin-puzzle': 'Pinyin Puzzle', 'liann-mahjong-tones': 'Mahjong Tones' }
export const sourceName = id => SOURCES[id] || id || ''

function setlistCard(l) {
  const words = Number(l.words) || 0
  const from = l.source_name || sourceName(l.source_product)
  return `<div class="c">${art('setlist')}<div class="h"><div class="tile">${esc((l.name || '表').trim()[0] || '表')}</div><div><div class="t">${esc(l.name || 'SetList')}</div><div class="s">${words} word${words === 1 ? '' : 's'}${from ? ` · ${esc(from)}` : ''}</div></div></div><div class="acts"><button class="btn ghost" data-list="${esc(l.id)}">Open</button></div></div>`
}

function pHome(s) {
  const p = profileOf(s.user), [en, zh] = greeting(s.hour ?? new Date().getHours())
  const q = s.query || ''
  const recent = (s.recent || []).map(id => APPS.find(a => a.id === id)).filter(Boolean).slice(0, 3)
  const lists = s.setlists?.status === 'ok' ? s.setlists.items.filter(l => matches(q, l.name, l.source_name)) : []
  const games = GAMES().filter(a => matches(q, a.name, a.desc, a.kind)), tools = TOOLS().filter(a => matches(q, a.name, a.desc, a.kind))
  return `<section class="hello"><h1>${en}, ${esc(p.name)}. <span class="han">${zh}</span></h1>
   <form class="ask" id="ask" role="search"><input id="q" value="${esc(q)}" placeholder="What do you want to practise? Try “tones” or a SetList name" aria-label="Search games, apps and your SetLists">
    <div class="row"><span class="muted" style="font-size:.82rem">Searches games, apps and your SetLists</span><button class="iconbtn" aria-label="Search" style="background:var(--accent);color:var(--accent-fg)">${ico('send', 20)}</button></div></form></section>
  ${recent.length && !q ? `<section class="sec"><div class="sechead"><h2>Jump back in</h2></div><div class="grid">${recent.map(a => appCard(a, s)).join('')}</div></section>` : ''}
  ${lists.length ? `<section class="sec"><div class="sechead"><h2>Your SetLists</h2><button class="link" data-nav="library">View all</button></div><div class="grid">${lists.slice(0, 3).map(setlistCard).join('')}</div></section>` : ''}
  ${games.length ? `<section class="sec"><div class="sechead"><h2>Games</h2><button class="link" data-nav="apps" data-f="Games">View all</button></div><div class="grid">${games.map(a => appCard(a, s)).join('')}</div></section>` : ''}
  ${tools.length ? `<section class="sec"><div class="sechead"><h2>Apps</h2><button class="link" data-nav="apps" data-f="Apps">View all</button></div><div class="grid">${tools.map(a => appCard(a, s)).join('')}</div></section>` : ''}
  ${q ? '' : `<section class="sec"><div class="sechead"><h2>Read and colour</h2></div><div class="grid">
   <div class="c">${art('read')}<div class="t">Bella &amp; LiANN</div><div class="d">The comic, with pinyin and English.</div><div class="acts"><button class="btn ghost" data-nav="read">Read</button></div></div>
   <div class="c">${art('kids')}<div class="t">Kids</div><div class="d">Colouring books and stickers to print at home.</div><div class="acts"><button class="btn ghost" data-nav="kids">Open</button></div></div></div></section>`}
  ${q && !games.length && !tools.length && !lists.length ? `<div class="empty">Nothing matches “${esc(q)}”.</div>` : ''}`
}

function pApps(s) {
  const f = s.appf || 'All'
  const sec = (t, list) => list.length ? `<section class="sec"><div class="sechead"><h2>${t}</h2></div><div class="grid">${list.map(a => appCard(a, s)).join('')}</div></section>` : ''
  return `<section class="sec"><div class="sechead"><h2>Games &amp; apps</h2></div>
  <div class="chips" style="justify-content:flex-start">${['All', 'Games', 'Apps'].map(c => `<button class="chip" data-appf="${c}" aria-pressed="${c === f}">${c}</button>`).join('')}</div></section>
  ${f !== 'Apps' ? sec('Games', GAMES()) : ''}${f !== 'Games' ? sec('Apps', TOOLS()) : ''}`
}

function pLibrary(s) {
  const L = s.setlists || { status: 'loading' }
  if (s.openList) {
    const o = s.openList
    const rows = o.status === 'ok' ? (o.words.length ? `<table class="words"><thead><tr><th scope="col">Word</th><th scope="col">Pinyin</th><th scope="col">Meaning</th><th scope="col">From</th></tr></thead><tbody>${o.words.map(w => `<tr><td class="han">${esc(w.hz)}</td><td>${esc(w.py || w.dictionary_pinyin)}</td><td>${esc(w.gl || w.dictionary_gloss || w.dictionary_translation)}</td><td class="muted">${esc(sourceName(w.source_product))}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">No words in this SetList yet.</div>')
      : o.status === 'error' ? `<div class="empty err">${esc(o.error)}</div>` : '<div class="empty">Loading words…</div>'
    return `<section class="sec"><div class="sechead"><h2>${esc(o.name || 'SetList')}</h2><button class="link" id="closelist">Back to Library</button></div><div class="c">${rows}</div></section>`
  }
  const body = L.status === 'ok' ? (L.items.length ? `<div class="grid">${L.items.map(setlistCard).join('')}</div>` : '<div class="empty">No SetLists yet. Save words in Pinyin Tiles, Pinyin Puzzle or Mahjong Tones while signed in, and they appear here.</div>')
    : L.status === 'error' ? `<div class="empty"><p style="margin:0 0 10px">${esc(L.error)}</p><button class="btn ghost" id="retrylib">Try again</button></div>` : '<div class="empty">Loading your SetLists…</div>'
  return `<section class="sec"><div class="sechead"><h2>Library</h2><span class="muted">Your SetLists from every game, kept in AlongSide</span></div>${body}</section>`
}

const PRODUCT_GLYPH = { 'dual-subs': '字', lyricsync: '歌', polyflow: '琴', 'mahjong-tones': '声', 'alongside-mobile': '伴', 'pinyin-tiles': '拼', 'pinyin-puzzle': '谜', 'bella-liann': '漫', kids: '小', figures: '偶' }

// licenceNotes in the manifest are reviewer notes for whoever publishes the file; they are not shown to learners.
function downloadCard(d) {
  const meta = d.available ? `<div class="status">Version ${esc(d.version || '—')}${d.builtAt ? ` · built ${esc(d.builtAt.slice(0, 10))}` : ''}</div>
   <div class="d">${esc(formatBytes(d.bytes))}</div><div class="d mono" title="SHA-256">SHA-256 ${esc(d.sha256)}</div>`
    : '<div class="status" style="color:var(--muted)">Waiting for the latest file</div><div class="d" style="font-size:.78rem">Version, size and checksum appear here when the file arrives.</div>'
  const act = d.available ? `<a class="btn" href="${esc(d.href)}" download rel="noopener">Download</a>` : '<button class="btn ghost" disabled>Download</button>'
  return `<div class="c" data-slot="${esc(d.slot)}"><div class="h"><div class="tile">${esc(PRODUCT_GLYPH[d.product] || d.name.trim()[0])}</div><div><div class="t">${esc(d.name)}</div><div class="s">${esc(d.platform)}</div></div></div>${meta}<div class="acts">${act}</div></div>`
}

function downloadsFor(s, filter) {
  if (s.downloads instanceof Error) return `<div class="empty">${esc(s.downloads.message)}</div>`
  if (!s.downloads) return '<div class="empty">Loading downloads…</div>'
  const list = s.downloads.filter(filter)
  return list.length ? `<div class="grid">${list.map(downloadCard).join('')}</div>` : '<div class="empty">Nothing here yet.</div>'
}

function pDownloads(s) {
  return `<section class="sec"><div class="sechead"><h2>Downloads</h2><span class="muted" style="font-size:.85rem">Latest files, checked and signed off</span></div>
  ${downloadsFor(s, d => d.product !== 'figures')}
  <p class="muted" style="margin:0;font-size:.85rem">Each file is listed from a manifest with its version, source and SHA-256 checksum, so you can check what you downloaded.</p></section>`
}

function pRead(s) {
  return `<section class="sec"><div class="sechead"><h2>Bella &amp; LiANN</h2><span class="muted">Episodes appear here when they are published</span></div>
  <div class="feature"><div class="art" style="background:#ddd url(assets/comic-2.jpg) center/cover" role="img" aria-label="Bella flying over the city, from Bella & LiANN"></div>
  <div class="txt"><div class="eyebrow">Coming soon</div><h3>Bella &amp; LiANN</h3><p class="muted" style="margin:0">Read the comic with pinyin and English, and save words to your SetLists.</p></div></div>
  ${downloadsFor(s, d => d.product === 'bella-liann')}</section>`
}

function pKids(s) {
  return `<section class="sec"><div class="sechead"><h2>Kids</h2><span class="muted">Colouring books and sticker artwork to print at home</span></div>
  <div class="grid"><div class="c">${art('kids')}<div class="t">Bella &amp; LiANN colouring book: Flight</div><div class="d">Pages from the comic to colour in.</div></div></div>
  ${downloadsFor(s, d => d.product === 'kids')}</section>`
}

function pPlan(s) {
  const th = s.theme
  return `<section class="sec"><div class="sechead"><h2>Settings</h2></div><div class="grid">
  <div class="c"><div class="t">Account</div><div class="s">${esc(s.user.email)}</div><div class="d">You sign in with a code sent to this email.</div><div class="acts"><button class="btn ghost" id="signout">Sign out</button></div></div>
  <div class="c"><div class="t">Appearance</div><div class="s">${esc(DS.find(d => d[0] === th.ds)[1])} · ${th.t === 'dark' ? 'Dark' : 'Light'}</div><div class="d">LiANN, Amberline, Steelline, Cadence or Ivoryline, in light or dark.</div><div class="acts"><button class="btn ghost" id="apbtn2">Change</button></div></div>
  <div class="c"><div class="t">Plans and profiles</div><div class="s">Coming soon</div><div class="d">Family, Couple and Tutor plans, and separate profiles for each learner.</div></div></div></section>`
}

export function appearHTML(th) {
  return `<div class="appear" role="dialog" aria-label="Appearance"><h3>Appearance<button class="iconbtn" id="apclose" aria-label="Close">✕</button></h3>
 <div class="ds">${DS.map(([k, n, d, c]) => `<button class="dsopt" data-ds="${k}" aria-pressed="${th.ds === k}"><span class="sw">${c.map(x => `<i style="background:${x}"></i>`).join('')}</span><span><b>${n}</b><small>${d}</small></span></button>`).join('')}</div>
 <div class="modes">${['light', 'dark'].map(m => `<button class="chip" data-mode="${m}" aria-pressed="${th.t === m}">${m === 'light' ? 'Light' : 'Dark'}</button>`).join('')}</div>
 <p class="note muted" style="margin:0">Same design systems as Pinyin Tiles. Saved on this device.</p></div>`
}

// Phone tab bar: Read and Kids are reached from Home there.
const TAB_PAGES = ['home', 'apps', 'library', 'downloads', 'plan']

export const PAGES = { home: pHome, apps: pApps, library: pLibrary, read: pRead, kids: pKids, downloads: pDownloads, plan: pPlan }

export function vHub(s) {
  const p = profileOf(s.user), page = PAGES[s.page] ? s.page : 'home'
  return `<div class="app ${s.slim ? 'slim' : ''}">
  <header class="top"><button class="iconbtn menu" id="slim" aria-label="${s.slim ? 'Expand' : 'Collapse'} menu">${ico('menu')}</button>${LOCKUP}
   <form class="search" id="topsearch" role="search">${ico('search', 18)}<input id="ts" value="${esc(s.query || '')}" placeholder="Search Learning with LiANN" aria-label="Search"></form>
   <button class="iconbtn" id="apbtn" aria-label="Appearance">${ico('palette')}</button>
   <button class="tile avatar" id="me" aria-label="Profile (${esc(p.name)})">${esc(p.g)}</button></header>
  <nav class="rail" aria-label="Main">${NAV.map(rItem(page)).join('')}</nav>
  <main id="main"><div class="wrap fade">${PAGES[page](s)}</div></main>
  <nav class="tabs" aria-label="Main">${NAV.filter(([k]) => TAB_PAGES.includes(k)).map(rItem(page)).join('')}</nav></div>${s.appear ? appearHTML(s.theme) : ''}`
}
