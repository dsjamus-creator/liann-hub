// Pure render functions: state in, HTML string out. Markup and art follow the approved mockup.
import { APPS, NAV, CODE_LENGTH, appUrl } from './config.js'
import { formatBytes } from './downloads.js'
import { clampPage, visiblePages } from './comics.js'

const I = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h5v-6h4v6h5V9.5"/>',
  apps: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="3.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  library: '<path d="M4 19.5V5a2 2 0 0 1 2-2h12v15H6a2 2 0 0 0-2 2v0a2 2 0 0 0 2 2h12"/><path d="M8 7h6"/>',
  read: '<path d="M2 5h7a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H2z"/><path d="M22 5h-7a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h8z"/>',
  kids: '<path d="M14.5 3.5l6 6L9 21H3v-6z"/><path d="M12.5 5.5l6 6"/>',
  downloads: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 19h16"/>',
  plan: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
  discover: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
  figures: '<path d="M12 3a3 3 0 1 1 0 6 3 3 0 0 1 0-6z"/><path d="M7 21v-4a5 5 0 0 1 10 0v4"/><path d="M5 21h14"/>',
  shop: '<path d="M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4.5M12 17.5h.01"/>',
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
  if (id === 'comic2') return img('comic-2.jpg', 'center 35%', '#ddd', 'Bella flying over the city, from Bella & LiANN')
  if (id === 'game') return '<div class="cart" style="background:radial-gradient(90% 120% at 50% 100%,#3A2A12,#120E09)"><div class="soon">游</div></div>'
  if (id.startsWith('kid:')) return kidArt(id.slice(4))
  if (id === 'kids') return img('colouring-1.jpg', 'center', '#FDEFCB', 'Colouring page: Bella landing the ship, half coloured in')
  if (id === 'trans') return '<div class="cart" style="background:radial-gradient(110% 120% at 20% 30%,#3A2C26,#15120F)"><span class="soon">练</span><span class="ytb" style="left:auto;right:10px;background:#E8AE46;color:#1C1608">Coming soon</span></div>'
  if (id === 'setlist') return '<div class="cart" style="background:linear-gradient(160deg,#5F7457,#3B4A35)"><span class="soon" style="color:#FDEFCB;-webkit-text-stroke:0;text-shadow:none;font-size:56px">表</span></div>'
  return ''
}

const TONEC = ['#E0634F', '#E8AE46', '#6BBE86', '#7FA8CC', '#B7AFA2']
function kidArt(k) {
  if (k === 'cb1') return '<div class="cart img" style="background-image:url(assets/colouring-1.jpg);background-position:center;background-color:#FDEFCB" role="img" aria-label="Colouring page: Bella landing the ship, half coloured in"></div>'
  if (k === 'cb4') return kidArt('cb1')
  if (k === 'cb2') return '<div class="cart" style="background:#FFFDF9"><svg viewBox="0 0 280 136" style="width:100%;height:100%" aria-hidden="true"><g font-family="Noto Sans SC,sans-serif" font-weight="700" font-size="84" text-anchor="middle" stroke="#3D3C34" stroke-width="2.4"><text x="60" y="104" fill="#E8AE46">山</text><text x="140" y="104" fill="none">水</text><text x="220" y="104" fill="#E0634F" fill-opacity=".9">火</text></g><g fill="#3D3C34" font-family="Nunito,sans-serif" font-weight="900" font-size="12" text-anchor="middle"><text x="60" y="126">shān</text><text x="140" y="126">shuǐ</text><text x="220" y="126">huǒ</text></g></svg></div>'
  if (k === 'cb3') {
    const W = [['妈', 1], ['麻', 2], ['马', 3], ['骂', 4], ['吗', 5], ['天', 1], ['茶', 2], ['好', 3], ['大', 4], ['的', 5]]
    return `<div class="cart" style="background:#FFFDF9"><svg viewBox="0 0 280 136" style="width:100%;height:100%" aria-hidden="true"><g font-family="Noto Sans SC,sans-serif" font-weight="700" font-size="26" text-anchor="middle">${W.map(([z, t], i) => `<rect x="${20 + (i % 5) * 50}" y="${12 + Math.floor(i / 5) * 52}" width="42" height="44" rx="8" fill="${i < 6 ? TONEC[t - 1] : '#FFFFFF'}" fill-opacity="${i < 6 ? 0.85 : 1}" stroke="#3D3C34" stroke-width="1.5"/><text x="${41 + (i % 5) * 50}" y="${44 + Math.floor(i / 5) * 52}" fill="#2B2B28">${z}</text>`).join('')}</g><g font-family="Nunito,sans-serif" font-weight="900" font-size="10">${TONEC.map((c, i) => `<circle cx="${40 + i * 50}" cy="126" r="5" fill="${c}"/><text x="${50 + i * 50}" y="130" fill="#3D3C34">${i < 4 ? 'tone ' + (i + 1) : 'neutral'}</text>`).join('')}</g></svg></div>`
  }
  if (k === 'sp1') return '<div class="cart" style="background:radial-gradient(120% 120% at 30% 30%,#4C6145,#26331F)"><div style="display:flex;align-items:center;gap:14px"><img src="assets/sticker-bella.png" alt="Bella sticker" style="width:104px;height:104px;transform:rotate(-6deg)"><span class="stk" style="width:62px;height:62px;font-size:22px;transform:rotate(8deg)">贝拉<small>Bèilā</small></span><span class="stk" style="width:54px;height:54px;font-size:13px;transform:rotate(-4deg);font-family:Nunito,sans-serif;font-weight:900;color:#C24837">YAP!</span></div></div>'
  if (k === 'sp2' || k === 'sp3') return kidArt('sp1')
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
  <h1>Sign in or create your LiANN account</h1>
  <div class="field"><label for="em">Email</label><input id="em" type="email" required placeholder="you@example.com" value="${esc(s.email)}" autocomplete="email"></div>
  <p id="fix" class="note" ${s.fix ? '' : 'hidden'}>${s.fix ? `Did you mean <button type="button" class="link" id="usefix" style="color:var(--accent);padding:0">${esc(s.fix)}</button>? Press the button again to keep what you typed.` : ''}</p>
  ${s.error ? `<p class="note err" role="alert">${esc(s.error)}</p>` : ''}
  <button class="btn" type="submit" ${s.busy ? 'disabled' : ''}>${s.busy ? 'Sending…' : 'Send me a code'}</button>
  <p class="note muted">No password. We email a ${CODE_LENGTH}-digit code each time you sign in. One LiANN account works here, in every game and in AlongSide. For ages 13 and over.</p></form></div>`
}

export function vCode(s) {
  return `<div class="gate fade">${decor()}<form class="card" id="f2" novalidate>
  ${LOCKUP}
  <h1>Enter the code we sent</h1>
  <p class="muted" style="margin:0">Sent to <b>${esc(s.email)}</b>. Check your spam folder if it hasn't arrived.</p>
  <div class="code">${Array.from({ length: CODE_LENGTH }, (_, i) => i).map(i => `<input id="c${i}" inputmode="numeric" autocomplete="${i ? 'off' : 'one-time-code'}" maxlength="1" aria-label="Digit ${i + 1}">`).join('')}</div>
  ${s.error ? `<p class="note err" role="alert">${esc(s.error)}</p>` : ''}
  <button class="btn" type="submit" ${s.busy ? 'disabled' : ''}>${s.busy ? 'Checking…' : 'Sign in'}</button>
  <div style="display:flex;justify-content:space-between"><button type="button" class="link" id="back">Use a different email</button><button type="button" class="link" id="resend">Resend code</button></div></form></div>`
}

export function vWho(s) {
  const p = profileOf(s.user)
  return `<div class="who fade">${decor()}<div class="whohead">${LOCKUP}</div><h1>Who's learning?</h1><div class="profiles">
  <button class="prof" id="pick"><div class="tile" style="font-size:inherit"><span>${esc(p.g)}</span></div><span style="display:grid;gap:2px">${esc(p.name)}<span style="font-size:.75em;font-weight:700">${esc(s.user.email)}</span></span></button>
  ${(s.household?.children || []).map(c => `<button class="prof" data-pickchild="${esc(c.id)}"><div class="tile" style="font-size:inherit"><span>${esc(c.name.slice(0, 1).toUpperCase())}</span></div><span style="display:grid;gap:2px">${esc(c.name)}<span style="font-size:.75em;font-weight:700">Child profile</span></span></button>`).join('')}
  ${s.household?.household?.plan === 'family' && s.household.children.length < s.household.household.limits.children
    ? '<button class="prof" id="addprofile"><div class="add">+</div>Add profile<span class="lock muted">A child under 13</span></button>'
    : '<div class="prof" aria-disabled="true" title="Family profiles arrive with Family plans"><div class="add">+</div>Add profile<span class="lock muted">With Family plans</span></div>'}</div>
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
  const act = app.st === 'ok' ? `${app.slot ? '<button class="btn ghost" data-nav="downloads">Install</button>' : ''}<a class="btn" href="${esc(url)}" target="_blank" rel="noopener" data-open="${app.id}">Open</a>`
    : app.st === 'soon' ? '<button class="btn ghost" disabled>Coming soon</button>'
      : `<button class="btn ghost" data-nav="downloads">Get</button>`
  return `<div class="c" data-app="${app.id}">${app.yt ? `<div style="position:relative">${art(app.id)}<span class="ytb">▶ YouTube app</span></div>` : art(app.id)}<div class="h"><div class="tile">${app.g}</div><div><div class="t">${esc(app.name)}</div><div class="s">${esc(app.kind)}</div></div></div>
  <div class="status ${st.cls}">${esc(st.text)}</div><div class="d">${esc(app.desc)}</div><div class="acts">${act}</div></div>`
}

const GAMES = () => APPS.filter(a => a.kind.startsWith('Game'))
const TOOLS = () => APPS.filter(a => !a.kind.startsWith('Game'))

function matches(q, ...fields) { const n = q.trim().toLowerCase(); return !n || fields.some(f => String(f || '').toLowerCase().includes(n)) }

const SOURCES = { 'pinyin-tiles': 'Pinyin Tiles', 'pinyin-puzzle': 'Pinyin Puzzle', 'liann-mahjong-tones': 'Mahjong Tones', lyricsync: 'LyricSync', 'dual-subs': 'Dual Subs', dualsubs: 'Dual Subs', polyflow: 'PolyFlow', alongside: 'AlongSide', multiboard: 'MultiBoard', authorboard: 'AuthorBoard', transapp: 'TransApp' }
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
    <div class="row"><span class="muted" style="font-size:.82rem">Searches games, apps and your SetLists</span><button class="iconbtn" aria-label="Search" style="background:var(--accent);color:var(--accent-fg)">${ico('send', 20)}</button></div></form>
   <div class="chips">${[['library', 'Open my SetLists'], ['read', 'Read Bella & LiANN'], ['kids', 'Colour with Kids'], ['figures', 'See the figures']].map(([k, t]) => `<button class="chip" data-nav="${k}">${esc(t)}</button>`).join('')}</div></section>
  ${recent.length && !q ? `<section class="sec"><div class="sechead"><h2>Jump back in</h2></div><div class="grid">${recent.map(a => appCard(a, s)).join('')}</div></section>` : ''}
  ${lists.length ? `<section class="sec"><div class="sechead"><h2>Your SetLists</h2><button class="link" data-nav="library">View all</button></div><div class="grid">${lists.slice(0, 3).map(setlistCard).join('')}</div></section>` : ''}
  ${games.length ? `<section class="sec"><div class="sechead"><h2>Games</h2><button class="link" data-nav="apps" data-f="Games">View all</button></div><div class="grid">${games.map(a => appCard(a, s)).join('')}</div></section>` : ''}
  ${tools.length ? `<section class="sec"><div class="sechead"><h2>Apps</h2><button class="link" data-nav="apps" data-f="Apps">View all</button></div><div class="grid">${tools.map(a => appCard(a, s)).join('')}</div></section>` : ''}
  ${q && !games.length && !tools.length && !lists.length ? `<div class="empty">Nothing matches “${esc(q)}”.</div>` : ''}`
}

function pApps(s) {
  const f = s.appf || 'All'
  const sec = (t, list) => list.length ? `<section class="sec"><div class="sechead"><h2>${t}</h2></div><div class="grid">${list.map(a => appCard(a, s)).join('')}</div></section>` : ''
  return `<section class="sec"><div class="sechead"><h2>Games &amp; apps</h2></div>
  <div class="chips" style="justify-content:flex-start">${['All', 'Games', 'Apps'].map(c => `<button class="chip" data-appf="${c}" aria-pressed="${c === f}">${c}</button>`).join('')}</div></section>
  ${f !== 'Apps' ? sec('Games', GAMES()) : ''}${f !== 'Games' ? sec('Apps', TOOLS()) : ''}`
}

// One LiANN account, B2: the learner profile is asked for the first time the Library needs it, not at sign-in.
const profileCard = L => `<div class="c profilecard"><h3 style="margin:0 0 6px">Finish your learner profile</h3>
  <p style="margin:0 0 6px">Your Library is kept in AlongSide, and it needs a learner profile first. It takes a minute: your name, a username, your date of birth, a parent or guardian if you are under 18, and agreeing to the Terms and Privacy Promise.</p>
  <p class="muted" style="margin:0 0 12px">AlongSide opens in a new tab, already signed in with this account. Come back here when you have saved it.</p>
  ${L.error ? `<p class="err" role="alert" style="margin:0 0 10px">${esc(L.error)}</p>` : ''}
  <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn" id="finishprofile"${L.opening ? ' disabled' : ''}>${L.opening ? 'Opening AlongSide…' : 'Finish your learner profile'}</button>
  ${L.opened ? '<button class="btn ghost" id="retrylib">I have saved it: show my Library</button>' : ''}</div></div>`

function pLibrary(s) {
  const L = s.setlists || { status: 'loading' }
  if (s.openList) {
    const o = s.openList
    const rows = o.status === 'ok' ? (o.words.length ? `<table class="words"><thead><tr><th scope="col">Word</th><th scope="col">Pinyin</th><th scope="col">Meaning</th><th scope="col">From</th></tr></thead><tbody>${o.words.map(w => `<tr><td class="han">${esc(w.hz)}</td><td>${esc(w.py || w.dictionary_pinyin)}</td><td>${esc(w.gl || w.dictionary_gloss || w.dictionary_translation)}</td><td class="muted">${esc(sourceName(w.source_product))}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">No words in this SetList yet.</div>')
      : o.status === 'error' ? `<div class="empty err">${esc(o.error)}</div>` : '<div class="empty">Loading words…</div>'
    return `<section class="sec"><div class="sechead"><h2>${esc(o.name || 'SetList')}</h2><button class="link" id="closelist">Back to Library</button></div><div class="c">${rows}</div></section>`
  }
  const body = L.status === 'ok' ? (L.items.length ? `<div class="grid">${L.items.map(setlistCard).join('')}</div>` : '<div class="empty">No SetLists yet. Save words in Pinyin Tiles, Pinyin Puzzle or Mahjong Tones while signed in, and they appear here.</div>')
    : L.status === 'needs_profile' ? profileCard(L)
    : L.status === 'error' ? `<div class="empty"><p style="margin:0 0 10px">${esc(L.error)}</p><button class="btn ghost" id="retrylib">Try again</button></div>` : '<div class="empty">Loading your SetLists…</div>'
  const whose = s.learner ? `${esc(s.learner.name)}\u2019s SetLists from every game, kept in AlongSide` : 'Your SetLists from every game, kept in AlongSide'
  return `<section class="sec"><div class="sechead"><h2>Library</h2><span class="muted">${whose}</span></div>${body}</section>`
}

const PRODUCT_GLYPH = { 'dual-subs': '字', lyricsync: '歌', polyflow: '琴', 'mahjong-tones': '声', 'alongside-mobile': '伴', 'alongside-dashboard': '伴', 'pinyin-tiles': '拼', 'pinyin-puzzle': '谜', 'bella-liann': '漫', kids: '小', figures: '偶' }

const DOWNLOAD_ART = { 'dual-subs': 'dual', lyricsync: 'lyric', polyflow: 'poly', 'mahjong-tones': 'tones', 'alongside-mobile': 'dash', 'alongside-dashboard': 'dash', 'pinyin-tiles': 'tiles', 'pinyin-puzzle': 'puzzle', 'bella-liann': 'read', 'kids/colouring/flight': 'kid:cb1', kids: 'kid:sp1' }

// licenceNotes in the manifest are reviewer notes for whoever publishes the file; they are not shown to learners.
function downloadCard(d) {
  const meta = d.available ? `<div class="status">Version ${esc(d.version || '—')}${d.builtAt ? ` · built ${esc(d.builtAt.slice(0, 10))}` : ''}</div>
   <div class="d">${esc(formatBytes(d.bytes))}</div><div class="d mono" title="SHA-256">SHA-256 ${esc(d.sha256)}</div>`
    : '<div class="status" style="color:var(--muted)">Waiting for the latest file</div><div class="d" style="font-size:.78rem">Version, size and checksum appear here when the file arrives.</div>'
  const act = d.available ? `<a class="btn" href="${esc(d.href)}" download rel="noopener">Download</a>` : '<button class="btn ghost" disabled>Download</button>'
  const pic = art(DOWNLOAD_ART[d.slot] || DOWNLOAD_ART[d.product] || '')
  return `<div class="c" data-slot="${esc(d.slot)}">${d.product === 'dual-subs' || d.product === 'lyricsync' ? `<div style="position:relative">${pic}<span class="ytb">▶ YouTube app</span></div>` : pic}<div class="h"><div class="tile">${esc(PRODUCT_GLYPH[d.product] || d.name.trim()[0])}</div><div><div class="t">${esc(d.name)}</div><div class="s">${esc(d.platform)}</div></div></div>${meta}<div class="acts">${act}</div></div>`
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
  const eps = Array.isArray(s.comics) ? s.comics : []
  const lead = eps.length
    ? `<div class="grid">${eps.map(e => {
      const saved = s.progress?.[e.id], resume = Number.isInteger(saved) && saved > 0 && saved < e.pages.length - 1
      return `<div class="c" data-ep="${esc(e.id)}"><img class="cover"${s.noCors ? '' : ' crossorigin="anonymous"'} src="${esc(e.cover)}" alt="" loading="lazy"><div class="t">${esc(e.title)}</div><div class="s">${e.pages.length} page${e.pages.length === 1 ? '' : 's'}</div>${e.summary ? `<div class="d">${esc(e.summary)}</div>` : ''}<div class="acts"><button class="btn" data-readep="${esc(e.id)}">${resume ? `Continue from page ${saved + 1}` : 'Read'}</button></div></div>`
    }).join('')}</div>`
    : `<div class="feature"><div class="art" style="background:#ddd url(assets/comic-2.jpg) center/cover" role="img" aria-label="Bella flying over the city, from Bella & LiANN"></div>
  <div class="txt"><div class="eyebrow">Coming soon</div><h3>Bella &amp; LiANN</h3><p class="muted" style="margin:0">Read the comic with pinyin and English, and save words to your SetLists.</p></div></div>`
  return `<section class="sec"><div class="sechead"><h2>Bella &amp; LiANN</h2><span class="muted">${eps.length ? 'Read it here, or download the PDFs below' : 'Episodes appear here when they are published'}</span></div>
  ${lead}
  ${downloadsFor(s, d => d.product === 'bella-liann')}</section>`
}

// Full-screen comic reader: one page or a two-page spread, a page-turn animation, a hover magnifier, swipe / arrow
// keys / buttons / slider, and Zoom for detail. The flip is pure CSS: the new pages are drawn at once, and the old
// page turns over them (r.flip = { dir, from } holds the pages that were showing).
// Broad block arrow (points right; CSS mirrors it for Back). Back = white outline, red fill; Forward = white outline, green fill.
const ARROW = '<svg viewBox="0 0 64 48" aria-hidden="true"><path d="M3 15H34V4L61 24 34 44V33H3Z"/></svg>'

export function readerHTML(s) {
  const ep = (s.comics || []).find(e => e.id === s.reader?.id)
  if (!ep) return ''
  const r = s.reader, n = ep.pages.length, i = clampPage(r.i, n), zoom = !!r.zoom && !r.d3, d3 = !!r.d3, spread = (d3 || !!r.spread) && n > 1
  const img = j => (j == null ? '' : `<img${s.noCors ? '' : ' crossorigin="anonymous"'} src="${esc(ep.pages[j])}" alt="${esc(ep.alts[j] || `${ep.title}, page ${j + 1} of ${n}`)}" draggable="false">`)
  const face = (cls, j) => `<div class="face ${cls}">${img(j)}</div>`
  const now = visiblePages(i, n, spread), from = r.flip?.from, dir = r.flip?.dir
  let flip = ''
  if (from && dir && !zoom && !d3) {
    if (spread && from.length === 2) {
      flip = dir > 0
        ? `<div class="pg l old">${img(from[0])}</div><div class="flip fwd">${face('front', from[1])}${face('back', now[0])}</div>`
        : `<div class="pg r old">${img(from[1])}</div><div class="flip back">${face('front', from[0])}${face('back', now[1])}</div>`
    } else if (!spread) flip = `<div class="flip ${dir > 0 ? 'sfwd' : 'sback'}">${face('front', from[0])}</div>`
  }
  const label = spread ? now.filter(j => j != null).map(j => j + 1).join('–') : String(i + 1)
  return `<div class="reader${r.full ? ' full' : ''}" role="dialog" aria-modal="true" aria-label="${esc(ep.title)}">
  <div class="rbar"><button class="iconbtn" id="rclose" aria-label="Close reader">✕</button><div class="rtitle">${esc(ep.title)}</div>
   ${r.can3d && !s.noCors ? `<button class="btn ghost" id="r3d" aria-pressed="${d3}" title="A 3D book with bending pages and a draggable magnifying glass">${d3 ? 'Flat pages' : '3D book'}</button>` : ''}
   ${n > 1 && !d3 ? `<button class="btn ghost" id="rmode" aria-pressed="${spread}">${spread ? 'One page' : 'Two pages'}</button>` : ''}
   <button class="btn ghost" id="rlensbtn" aria-pressed="${r.lens !== false}" title="Hover over a page to magnify it">Magnifier</button>
   <button class="btn ghost" id="rfull" aria-pressed="${!!r.full}">${r.full ? 'Exit full page' : 'Full page'}</button>
   ${d3 ? '' : `<button class="btn ghost" id="rzoom" aria-pressed="${zoom}">${zoom ? 'Fit page' : 'Zoom'}</button>`}</div>
  ${r.full ? '<button class="btn ghost rexit" id="rexit">Exit full page</button>' : ''}
  <div class="rstage${zoom ? ' zoom' : ''}" id="rstage" tabindex="-1">
   ${d3 ? (r.d3state === 'loading' ? '<div class="r3dslot">Loading the 3D book…</div>' : '') : `<div class="rbook ${spread ? 'spread' : 'single'}">
    ${spread ? `<div class="pg l">${img(now[0])}</div><div class="pg r">${img(now[1])}</div>` : `<div class="pg one">${img(now[0])}</div>`}${flip}</div>`}
   <div class="lens" id="rlens" hidden></div></div>
  <div class="rfoot">
   <div class="rctl">
    <button class="rarrow back" id="rprev" aria-label="Previous page"${i === 0 ? ' disabled' : ''}>${ARROW}</button>
    <span class="rcount" aria-live="polite"><b>${label}</b> / ${n}</span>
    <button class="rarrow fwd" id="rnext" aria-label="Next page"${(spread ? visiblePages(i, n, true).includes(n - 1) : i === n - 1) ? ' disabled' : ''}>${ARROW}</button></div>
   <input type="range" id="rseek" min="1" max="${n}" value="${i + 1}" aria-label="Page"></div></div></div>`
}

// A download button for a manifest slot: live when the checked file is in the manifest, otherwise "Coming soon".
function slotButton(s, slot, label) {
  const d = Array.isArray(s.downloads) ? s.downloads.find(x => x.slot === slot) : null
  return d?.available ? `<a class="btn" href="${esc(d.href)}" download rel="noopener">${esc(label)}</a>` : '<button class="btn ghost" disabled>Coming soon</button>'
}

const KIDBOOKS = [['cb1', 'Bella &amp; LiANN colouring book: Flight', '12 pages from the comic', 'Colour Bella’s flight, then print it at home.', 'kids/colouring/flight'],
  ['cb2', 'Colour the characters', '24 A4 pages', 'Colour Bella and the characters from Issue 1.', 'kids/colouring/characters'],
  ['cb3', 'Colour by tone', '20 A4 pages', 'Read a word, then colour its tone.', 'kids/colouring/by-tone'],
  ['cb4', 'Issue 1 colouring pages', '22 A4 pages', 'Colour scenes from Bella & LiANN Issue 1.', 'kids/colouring/issue1']]
const KIDSTICK = [['sp1', 'Bella &amp; LiANN sticker pack', '4 A4 sheets', 'Print them on sticker paper.', 'kids/stickers/bella-print'],
  ['sp2', 'Specular sticker sheets', '2 A4 sheets', 'Colour character stickers to print.', 'kids/stickers/specular'],
  ['sp3', 'Kinetic Shield sticker pack', '2 A4 sheets', 'Black-and-white and colour character stickers.', 'kids/stickers/kinetic-shield']]

function kidCard(s, [k, t, sub, d, slot], label) {
  return `<div class="c"${slot ? ` data-slot="${slot}"` : ''}>${art('kid:' + k)}<div class="t">${t}</div><div class="s">${esc(sub)}</div><div class="d">${esc(d)}</div><div class="acts">${slot ? slotButton(s, slot, label) : '<button class="btn ghost" disabled>Coming soon</button>'}</div></div>`
}

function pKids(s) {
  return `<div class="kidhead"><img src="assets/sticker-bella.png" alt=""><div><h2 style="margin:0;font-size:1.5rem">Kids</h2><div class="muted">Colouring books and sticker packs to print at home with a grown-up.</div></div></div>
  <section class="sec"><div class="sechead"><h2>Colouring books</h2></div><div class="grid">${KIDBOOKS.map(x => kidCard(s, x, 'Download PDF')).join('')}</div></section>
  <section class="sec"><div class="sechead"><h2>Sticker packs</h2></div><div class="grid">${KIDSTICK.map(x => kidCard(s, x, 'Download PDF')).join('')}</div></section>
  <section class="sec"><div class="sechead"><h2>Individual sticker artwork</h2></div>${downloadsFor(s, d => d.product === 'kids' && d.platform === 'PNG')}</section>`
}

function pDiscover(s) {
  const f = s.dchip || 'Featured'
  const list = f === 'Games' ? GAMES() : f === 'Apps' ? TOOLS() : ['poly', 'lyric', 'trans'].map(id => APPS.find(a => a.id === id))
  return `<section class="sec"><h2 style="margin:0;font-size:clamp(1.5rem,3vw,2.1rem);font-weight:900">Discover</h2>
  <div class="chips" style="justify-content:flex-start">${['Featured', 'Games', 'Apps'].map(c => `<button class="chip" data-dchip="${c}" aria-pressed="${f === c}">${c}</button>`).join('')}</div>
  <div class="feature"><div class="art" style="background:#ddd url(assets/comic-2.jpg) center/cover" role="img" aria-label="Bella flying over the city, from Bella & LiANN"></div>
  <div class="txt"><div class="eyebrow">Read now</div><h3>Bella &amp; LiANN</h3><p class="muted" style="margin:0">Read the comic with pinyin and English, and save words to your SetLists.</p><div><button class="btn" data-nav="read">See episodes</button></div></div></div></section>
  <section class="sec"><div class="sechead"><h2>${f === 'Featured' ? 'Try something new' : f}</h2><button class="link" data-nav="apps">View all</button></div><div class="grid">${list.map(a => appCard(a, s)).join('')}</div></section>`
}

// The 3D viewer itself lives in figures.js; this is its frame.
export const CHARS = [
  { id: 'bella', n: 'Bella', hz: '贝拉', py: 'Bèilā', d: 'The fluffy white pilot dog', col: 0xF4F1EA, acc: 0x5B6B4A, real: 1 },
  { id: 'liann', n: 'LiANN', hz: '', py: '', d: 'Figure coming soon', col: 0xDE5A4F, acc: 0x8A9B7E },
  { id: 'c3', n: 'Character 3', hz: '', py: '', d: 'Revealed soon', col: 0x7FA8CC, acc: 0xE8AE46 },
  { id: 'c4', n: 'Character 4', hz: '', py: '', d: 'Revealed soon', col: 0xE8AE46, acc: 0x3A332B }]
const hex = n => '#' + n.toString(16).padStart(6, '0')

function pFigures(s) {
  const c = CHARS.find(x => x.id === s.fig) || CHARS[0], m = s.figmode || 'figure'
  return `<section class="sec"><div class="sechead"><h2>Figures</h2><button class="link" data-nav="shop">See them in the Shop</button></div>
  <div class="grid">${CHARS.map(x => `<button class="chartile" data-fig="${x.id}" aria-pressed="${x.id === c.id && m !== 'lineup'}"><span class="sw" style="background:${hex(x.col)};box-shadow:inset 0 -8px 0 ${hex(x.acc)}"></span><span><b>${x.n}</b>${x.hz ? ` <span class="han">${x.hz}</span>` : ''}<br><span class="muted" style="font-size:.82rem">${x.d}</span></span></button>`).join('')}</div>
  <div class="chips" style="justify-content:flex-start">${[['figure', 'Figure'], ['box', 'In its box'], ['lineup', 'All four boxed']].map(([k, t]) => `<button class="chip" data-figmode="${k}" aria-pressed="${m === k}">${t}</button>`).join('')}</div>
  <div class="fig3d" id="fig3d"><div class="load">Loading 3D…</div><span class="ph">${m === 'lineup' ? 'Early models' : c.real ? 'Early model' : 'Stand-in until the figure is ready'}</span><span class="hint">Drag to turn · scroll or pinch to zoom</span></div>
  <p class="muted" style="margin:0;font-size:.85rem">These are early models. The finished figures will look like the characters in the comic.</p></section>`
}

const SHOP = [
  { cat: 'Comics', n: 'Bella & LiANN · Episodes 1–4, printed', d: 'Full-colour print edition with pinyin and English', art: '<div style="display:flex;gap:14px;align-items:center"><div class="book" style="background-image:url(assets/comic-1.jpg);transform:rotate(-6deg)"></div><div class="book" style="background-image:url(assets/comic-2.jpg);transform:rotate(5deg)"></div></div>' },
  { cat: 'Comics', n: 'Bella & LiANN · Collected volume', d: 'Hardback, episodes 1–8', art: '<div class="book" style="width:110px;height:140px;background-image:url(assets/comic-2.jpg)"></div>' },
  { cat: 'Stickers', n: 'Bella sticker sheet', d: 'Printed vinyl stickers: Bella, 贝拉, YAP!', art: '<div style="display:flex;align-items:center;gap:10px"><img src="assets/sticker-bella.png" alt="" style="width:96px;transform:rotate(-6deg)"><span class="stk" style="width:56px;height:56px;font-size:20px">贝拉<small>Bèilā</small></span></div>' },
  { cat: 'Stickers', n: 'Food words sticker sheet', d: '饺子, 茶, 菜单, 面条 and more, with pinyin', art: `<div style="display:flex;gap:8px">${[['饺子', 'jiǎozi'], ['茶', 'chá'], ['菜单', 'càidān']].map(([z, p], i) => `<span class="stk" style="width:62px;height:62px;font-size:18px;transform:rotate(${[-6, 4, -2][i]}deg)">${z}<small>${p}</small></span>`).join('')}</div>` },
  { cat: 'Figures', n: 'Bella 3D figure', d: 'Collectible figure of Bella (贝拉)', art: '<div class="fig"><img src="assets/sticker-bella.png" alt="" style="width:110px;filter:drop-shadow(0 6px 8px rgba(0,0,0,.5))"><div class="pod"></div></div>' },
  { cat: 'Figures', n: 'LiANN 3D figure', d: 'Collectible figure of LiANN', art: '<div class="fig"><svg width="90" height="110" viewBox="0 0 90 110" aria-hidden="true"><circle cx="45" cy="28" r="20" fill="#3A332B" stroke="#E8AE46" stroke-width="2"/><path d="M12 108c2-34 14-52 33-52s31 18 33 52z" fill="#3A332B" stroke="#E8AE46" stroke-width="2"/><text x="45" y="35" text-anchor="middle" font-family="Georgia,serif" font-size="20" fill="#E8AE46">?</text></svg><div class="pod"></div></div>' }]

function pShop(s) {
  const f = s.shopf || 'All'
  return `<section class="sec"><div class="sechead"><h2>Shop</h2><span class="muted" style="font-size:.85rem">Physical items, delivered · prices to be set</span></div>
  <div class="chips" style="justify-content:flex-start">${['All', 'Comics', 'Stickers', 'Figures'].map(c => `<button class="chip" data-shopf="${c}" aria-pressed="${f === c}">${c}</button>`).join('')}</div>
  <div class="grid">${SHOP.filter(x => f === 'All' || x.cat === f).map(x => `<div class="c"><div class="cart" style="background:radial-gradient(110% 120% at 50% 20%,#3A2C26,#15120F)">${x.art}<span class="ytb" style="left:auto;right:10px;background:#E8AE46;color:#1C1608">Coming soon</span></div>
   <div class="t">${esc(x.n)}</div><div class="s">${x.cat}</div><div class="d">${esc(x.d)}</div><div style="font-weight:900;color:var(--accent)">Price to be set</div>
   <div class="acts"><button class="btn ghost" disabled>Coming soon</button></div></div>`).join('')}</div>
  <p class="muted" style="margin:0;font-size:.85rem">The shop isn’t open yet. Physical items will be paid on our secure web checkout, not through the app stores.</p></section>`
}

const PLANS = [
  { g: 'Learners', n: 'Free', who: 'Individual learners, 13+', price: 'Free', f: ['Pinyin games and Bella &amp; LiANN comics', 'AlongSide classroom', 'Your SetLists from every game'], cur: 1 },
  { g: 'Learners', n: 'Couple', who: 'Two adults', price: 'Price to be set', f: ['2 profiles, each with its own progress', 'Everything in Free', 'One bill'] },
  { g: 'Learners', n: 'Family', who: 'A couple with 1–4 children', price: 'Price to be set', f: ['3–6 profiles: two adults and up to four children', 'Everything in Couple', 'Optional PIN on each profile', 'One bill'] },
  { g: 'Tutors', n: 'Tutor', who: 'Private tutors', price: 'Monthly or yearly · price to be set', f: ['Everything in Free', 'Full import to MultiBoard', 'Author lessons in AuthorBoard'] },
  { g: 'Tutors', n: 'Tutor + introduced students', who: 'Tutors who take students we introduce', price: 'A percentage of the tuition fee (to be set)', f: ['Everything in Tutor', 'AlongSide messaging with students', 'Students pay tuition in AlongSide'] },
  { g: 'Organisations', n: 'School', who: 'One school: teachers and classes', price: 'Licence · price to be set', f: ['Licences for teachers and classes', 'School sign-in and class lists', 'Invoice billing'] },
  { g: 'Organisations', n: 'Institution', who: 'Universities, language schools, academies', price: 'Licence · price to be set', f: ['Licences across several sites', 'Single sign-on and course-platform links', 'Reports across sites'] },
  { g: 'Organisations', n: 'Education Department', who: 'Regional or national education authorities', price: 'Licence · price to be set', f: ['Licences for many schools at once', 'Central reports', 'Purchase-order buying'] }]

const planCard = x => `<div class="c" style="${x.cur ? 'border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)' : ''}"><div class="t" style="font-size:1.15rem">${x.n}</div><div class="s">${x.who}</div>
  <div style="font-weight:900;color:var(--accent)">${x.price}</div>
  <ul style="margin:0;padding-left:1.1rem;display:grid;gap:4px;color:var(--muted);font-size:.9rem">${x.f.map(i => `<li>${i}</li>`).join('')}</ul>
  <div class="acts">${x.cur ? '<span class="status">Current plan</span>' : '<button class="btn ghost" disabled>Coming soon</button>'}</div></div>`

// Couple and Family plans (One LiANN account C3). Shown only when AlongSide has households switched on.
function householdSection(s) {
  const H = s.household, h = H.household, busy = s.hhBusy ? ' disabled' : ''
  const err = s.hhError ? `<p class="err" role="alert" style="margin:0">${esc(s.hhError)}</p>` : ''
  const invitations = (H.invitations || []).map(i => `<div class="c"><div class="t">Invitation</div><div class="s">${esc(i.owner_email)} invited you to their ${esc(i.plan === 'family' ? 'Family' : 'Couple')} plan.</div>
    <div class="d">You keep your own LiANN account and SetLists.</div><div class="acts"><button class="btn" data-hhaccept="${esc(i.id)}"${busy}>Join</button></div></div>`).join('')
  if (!h) return `<section class="sec"><div class="sechead"><h2>Household</h2></div>${err}<div class="grid">${invitations}
    <div class="c"><div class="t">Couple or Family</div>${H.canCreate
      ? `<div class="s">Your ${H.canCreate === 'family' ? 'Family' : 'Couple'} plan is active.</div><div class="d">Start your household, then invite the other adult${H.canCreate === 'family' ? ' and add children under 13' : ''}.</div><div class="acts"><button class="btn" id="hhcreate"${busy}>Start household</button></div>`
      : '<div class="s">Not on a household plan</div><div class="d">With a Couple or Family plan, two adults learn on one bill, each with their own LiANN account. Family adds up to four children under 13.</div>'}</div></div></section>`
  const owner = h.role === 'owner', adults = H.members.length + (H.invites || []).length
  const members = H.members.map(m => `<li>${esc(m.email)} <span class="muted">· ${m.role === 'owner' ? 'plan holder' : 'adult'}${m.me ? ' (you)' : ''}</span></li>`).join('')
  const invites = (H.invites || []).map(i => `<li>${esc(i.email)} <span class="muted">· invited</span> <button class="link" data-hhrevoke="${esc(i.id)}">Withdraw</button></li>`).join('')
  const children = (H.children || []).map(c => `<li>${esc(c.name)} <span class="muted">· child profile</span> <button class="link" data-hharchive="${esc(c.id)}">Remove</button></li>`).join('')
  const inviteForm = owner && adults < h.limits.adults ? `<form id="hhinvite" class="c" novalidate><div class="t">Invite the other adult</div>
    <div class="d">They sign in with their own LiANN account and accept on this page. Nothing is emailed.</div>
    <div class="field"><label for="hhemail">Their email</label><input id="hhemail" type="email" autocomplete="off" placeholder="name@example.com" required></div>
    <div class="acts"><button class="btn" type="submit"${busy}>Invite</button></div></form>` : ''
  const childForm = h.plan === 'family' && (H.children || []).length < h.limits.children ? `<form id="hhchild" class="c" novalidate><div class="t">Add a child under 13</div>
    <div class="d">Children under 13 have no sign-in of their own: they learn on a parent's device and choose their name on "Who's learning?". You are their parent or guardian on record.</div>
    <div class="field"><label for="hhcname">Child's first name</label><input id="hhcname" maxlength="40" required></div>
    <div class="field"><label for="hhcdob">Date of birth</label><input id="hhcdob" type="date" required></div>
    <div class="field"><label for="hhgname">Your name (parent or guardian)</label><input id="hhgname" maxlength="160" autocomplete="name" required></div>
    ${(s.policies || []).map(p => `<details class="policy"><summary>${esc(p.title)} (version ${esc(p.version)})</summary><div style="max-height:220px;overflow:auto;white-space:pre-wrap;font-size:.85rem;padding:8px 0">${esc(p.body_text || 'The full text is not available here yet.')}</div>${p.source_url ? `<a href="${esc(p.source_url)}" target="_blank" rel="noopener noreferrer">Open the full document</a>` : ''}</details>`).join('')}
    <label style="display:flex;gap:8px;align-items:flex-start;font-size:.9rem"><input id="hhagree" type="checkbox"> <span>I am this child's parent or guardian, and I have read and agree to the Terms and Privacy Promise above on their behalf.</span></label>
    <div class="acts"><button class="btn" type="submit"${busy}>Add child</button></div></form>` : ''
  return `<section class="sec"><div class="sechead"><h2>Household</h2><span class="muted">${h.plan === 'family' ? 'Family' : 'Couple'} plan</span></div>${err}<div class="grid">${invitations}
    <div class="c"><div class="t">People</div><ul style="margin:0;padding-left:1.1rem;display:grid;gap:6px">${members}${invites}${children}</ul>
    ${owner ? H.members.filter(m => m.role === 'adult' && m.accountId).map(m => `<div class="acts"><button class="btn ghost" data-hhremove="${esc(m.accountId)}">Remove ${esc(m.email)}</button></div>`).join('') : '<div class="acts"><button class="btn ghost" id="hhleave">Leave household</button></div>'}</div>
    ${inviteForm}${childForm}</div></section>`
}

function pPlan(s) {
  const th = s.theme, pf = s.planf || 'Learners'
  return `<section class="sec"><div class="sechead"><h2>Plan</h2></div><div class="grid">
  ${s.household?.household
    ? `<div class="c"><div class="t">${s.household.household.plan === 'family' ? 'Family' : 'Couple'} plan</div><div class="s">${s.household.household.role === 'owner' ? 'Plan holder' : 'Member of a household'}</div><div class="d">Every adult keeps their own LiANN account and SetLists.${s.household.household.plan === 'family' ? ' Children under 13 learn on their own profile.' : ''}</div></div>`
    : '<div class="c"><div class="t">Free</div><div class="s">Learner · no charge</div><div class="d">Pinyin games, Bella &amp; LiANN and your SetLists from every game.</div></div>'}
  <div class="c"><div class="t">LiANN account</div><div class="s">${esc(s.user.email)}</div><div class="d">You sign in with a code sent to this email. The same account works in every game and in AlongSide.</div><div class="acts"><button class="btn ghost" id="signout">Sign out</button></div></div>
  ${s.household ? '' : '<div class="c"><div class="t">Profiles</div><div class="s">1 profile</div><div class="d">Separate profiles for each learner arrive with Couple and Family plans.</div></div>'}
  <div class="c"><div class="t">Appearance</div><div class="s">${esc(DS.find(d => d[0] === th.ds)[1])} · ${th.t === 'dark' ? 'Dark' : 'Light'}</div><div class="d">LiANN, Amberline, Steelline, Cadence or Ivoryline, in light or dark.</div><div class="acts"><button class="btn ghost" id="apbtn2">Change</button></div></div></div></section>
  ${s.household ? householdSection(s) : ''}
  <section class="sec"><div class="sechead"><h2>Plans</h2><span class="muted" style="font-size:.85rem">Prices to be set</span></div>
  <div class="chips" style="justify-content:flex-start">${['Learners', 'Tutors', 'Organisations'].map(c => `<button class="chip" data-planf="${c}" aria-pressed="${pf === c}">${c}</button>`).join('')}</div>
  <div class="grid">${PLANS.filter(x => x.g === pf).map(planCard).join('')}</div>
  <p class="muted" style="margin:0;font-size:.85rem">Learners use the hub free, or choose a Couple or Family plan. Tutors subscribe monthly or yearly. Schools, institutions and education departments buy licences.</p></section>`
}

// Notification menu: pending household invitations are the only live items today; everything else is "all caught up".
export function notificationsOf(s) {
  return (s.household?.invitations || []).map(i => ({ id: i.id, text: `${i.owner_email} invited you to their ${i.plan === 'family' ? 'Family' : 'Couple'} plan.`, page: 'plan', cta: 'View' }))
}

export function notifsHTML(s) {
  const list = notificationsOf(s)
  const body = list.length
    ? `<ul class="notifs">${list.map(n => `<li><span>${esc(n.text)}</span><button class="btn ghost" data-nav="${n.page}">${esc(n.cta)}</button></li>`).join('')}</ul>`
    : '<p class="muted" style="margin:0">You are all caught up.</p>'
  return `<div class="appear" id="notifpanel" role="dialog" aria-label="Notifications"><h3>Notifications<button class="iconbtn" id="notifclose" aria-label="Close">✕</button></h3>${body}
 <p class="note muted" style="margin:0">Plan invitations and new Bella &amp; LiANN episodes appear here.</p></div>`
}

export function appearHTML(th) {
  return `<div class="appear" role="dialog" aria-label="Appearance"><h3>Appearance<button class="iconbtn" id="apclose" aria-label="Close">✕</button></h3>
 <div class="ds">${DS.map(([k, n, d, c]) => `<button class="dsopt" data-ds="${k}" aria-pressed="${th.ds === k}"><span class="sw">${c.map(x => `<i style="background:${x}"></i>`).join('')}</span><span><b>${n}</b><small>${d}</small></span></button>`).join('')}</div>
 <div class="modes">${['light', 'dark'].map(m => `<button class="chip" data-mode="${m}" aria-pressed="${th.t === m}">${m === 'light' ? 'Light' : 'Dark'}</button>`).join('')}</div>
 <p class="note muted" style="margin:0">Same design systems as Pinyin Games. Saved on this device.</p></div>`
}

// Phone tab bar: four pages, then More for the rest of the menu.
const TAB_PAGES = ['home', 'apps', 'library', 'downloads']

export const PAGES = { home: pHome, apps: pApps, library: pLibrary, read: pRead, figures: pFigures, discover: pDiscover, kids: pKids, shop: pShop, downloads: pDownloads, plan: pPlan }

export function vHub(s) {
  const p = profileOf(s.user), page = PAGES[s.page] ? s.page : 'home'
  return `<div class="app ${s.slim ? 'slim' : ''}">
  <header class="top"><button class="iconbtn menu" id="slim" aria-label="${s.slim ? 'Expand' : 'Collapse'} menu">${ico('menu')}</button>${LOCKUP}
   <form class="search" id="topsearch" role="search">${ico('search', 18)}<input id="ts" value="${esc(s.query || '')}" placeholder="Search Learning with LiANN" aria-label="Search"></form>
   <button class="iconbtn" id="apbtn" aria-label="Appearance">${ico('palette')}</button><button class="iconbtn help" aria-label="Help and account" data-nav="plan">${ico('help')}</button><button class="iconbtn${notificationsOf(s).length ? ' has-new' : ''}" id="bell" aria-label="Notifications" aria-expanded="${!!s.notif}">${ico('bell')}</button>
   <button class="tile avatar" id="me" aria-label="Profile (${esc(p.name)})">${esc(p.g)}</button></header>
  <nav class="rail" aria-label="Main">${NAV.map(rItem(page)).join('')}</nav>
  <main id="main"><div class="wrap fade">${PAGES[page](s)}</div></main>
  <nav class="tabs" aria-label="Main">${NAV.filter(([k]) => TAB_PAGES.includes(k)).map(rItem(page)).join('')}<button class="ritem" id="morebtn" aria-expanded="${!!s.more}" ${TAB_PAGES.includes(page) ? '' : 'aria-current="page"'}><span class="ic">${ico('menu')}</span><span class="lbl">More</span></button></nav>
  ${s.more ? `<nav class="moresheet" aria-label="More">${NAV.filter(([k]) => !TAB_PAGES.includes(k)).map(rItem(page)).join('')}</nav>` : ''}</div>${s.appear ? appearHTML(s.theme) : ''}${s.notif ? notifsHTML(s) : ''}${s.reader ? readerHTML(s) : ''}`
}
