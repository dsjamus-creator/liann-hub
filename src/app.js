import { config, NAV, CODE_LENGTH } from './config.js'
import { createAccount } from './account.js'
import { loadDownloads } from './downloads.js'
import { createBook, webglOK } from './book3d.js'
import { loadComics, clampPage, spreadsOf, spreadIndexOf, firstPageOf, visiblePages, lensGeometry } from './comics.js'
import { DS, vLoading, vEmail, vCode, vWho, vHub } from './views.js'
import { mountViewer, stopViewer } from './figures.js'

const account = createAccount({ pinyinApi: config.pinyinApi, backend: config.backend })
const $ = sel => document.querySelector(sel)
const store = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback } catch { return fallback } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* storage blocked */ } },
}

const theme = store.get('liann-hub-theme', null)
const S = {
  view: 'loading', email: '', user: null, page: pageFromHash(), appf: 'All', slim: false, appear: false, notif: false,
  theme: theme && DS.some(d => d[0] === theme.ds) && /^(light|dark)$/.test(theme.t) ? theme : { ds: 'liann', t: 'dark' },
  recent: store.get('liann-hub-recent', []), downloads: null, comics: null, reader: null, progress: store.get('liann-hub-reader', {}), setlists: null, openList: null, query: '', busy: false, error: '', fix: '',
  household: undefined, learner: null, hhError: '', hhBusy: false,
}

function hashParts() { const [k, arg] = location.hash.slice(1).split('/'); try { return [k, arg ? decodeURIComponent(arg) : ''] } catch { return [k, ''] } }
function pageFromHash() { const [k] = hashParts(); return NAV.some(([n]) => n === k) ? k : 'home' }
// A reader link: #read/<episode id> opens that comic as soon as the hub and the episodes are ready.
function openFromHash() {
  const [k, arg] = hashParts()
  if (k === 'read' && arg && S.view === 'hub' && S.page === 'read' && S.comics && !S.reader) openReader(arg)
}
function applyTheme() { document.documentElement.dataset.ds = S.theme.ds; document.documentElement.dataset.t = S.theme.t; store.set('liann-hub-theme', S.theme) }
function toast(text) { const el = $('#toast'); el.textContent = text; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true }, 2200) }
function go(view, extra = {}) { Object.assign(S, { error: '', busy: false }, extra, { view }); render(); if (view === 'who' || view === 'hub') loadHousehold() }

// Couple and Family plans (One LiANN account C3). null = AlongSide has households switched off; nothing is shown.
async function loadHousehold() {
  try { S.household = await account.household() } catch (error) { if (error.code === 'signed_out') return signedOut(); S.household = null }
  if (S.household?.household?.plan === 'family' && !S.policies)
    S.policies = (await account.householdAction('GET', '/policies').catch(() => ({}))).policies || null
  if (S.learner && !S.household?.children?.some(c => c.id === S.learner.id)) { S.learner = null; if (S.view === 'hub') loadLibrary() }
  if (S.view === 'who' || S.view === 'hub') render()
}

const HH_ERRORS = { plan_required: 'Starting a household needs a Couple or Family plan.', already_in_household: 'This account is already in a household.',
  valid_email_required: 'Enter one email address.', cannot_invite_yourself: 'That is your own email.', adult_limit_reached: 'This plan has no room for another adult.',
  already_invited: 'That email already has an invitation.', owner_only: 'Only the plan holder can do that.', owner_cannot_leave: 'The plan holder cannot leave their own household.',
  name_required: 'Enter the child\u2019s first name.', valid_date_of_birth_required: 'Enter the child\u2019s date of birth.', child_must_be_under_13: 'Child profiles are for children under 13. Learners 13 and over sign in with their own LiANN account.',
  guardian_name_required: 'Enter your name as their parent or guardian.', guardian_agreement_required: 'Tick the box to agree for your child.', family_plan_required: 'Child profiles come with the Family plan.',
  child_limit_reached: 'The Family plan has room for four children.', household_required: 'Start or join a household first.' }
async function householdDo(method, path, body, done) {
  S.hhBusy = true; S.hhError = ''; render()
  try { await account.householdAction(method, path, body); if (done) toast(done) }
  catch (error) { if (error.code === 'signed_out') return signedOut(); S.hhError = HH_ERRORS[error.code] || HH_ERRORS[error.message] || error.message }
  S.hhBusy = false; await loadHousehold()
}

function render() {
  const view = { loading: vLoading, email: vEmail, code: vCode, who: vWho, hub: vHub }[S.view]
  const focused = document.activeElement?.id
  $('#root').innerHTML = view(S)
  bind()
  if (focused === 'q' || focused === 'ts') { const el = $('#' + focused); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length) } }
}

const TYPO = { 'gmil.com': 'gmail.com', 'gmal.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gnail.com': 'gmail.com', 'gmail.co': 'gmail.com', 'googlemail.co': 'googlemail.com', 'hotmial.com': 'hotmail.com', 'hotmai.com': 'hotmail.com', 'outlok.com': 'outlook.com', 'yaho.com': 'yahoo.com', 'icloud.co': 'icloud.com' }

async function sendCode(email) {
  S.busy = true; S.error = ''; render()
  try { await account.requestCode(email); go('code', { email }) }
  catch (error) { S.busy = false; S.error = error.status === 429 ? 'Too many codes requested. Wait a minute, then try again.' : error.message; render() }
}

async function enterHub(user) {
  S.user = user
  go('hub')
  openFromHash()
  loadLibrary()
}

async function loadLibrary() {
  S.setlists = { status: 'loading' }
  if (S.view === 'hub') render()
  try { S.setlists = { status: 'ok', items: await account.setlists(S.learner?.id) } }
  catch (error) {
    if (error.code === 'signed_out') return signedOut()
    S.setlists = error.code === 'not_a_student' ? { status: 'needs_profile', profile: error.profile } : { status: 'error', error: error.message }
  }
  if (S.view === 'hub') render()
}

async function openList(id) {
  const name = S.setlists?.items?.find(l => l.id === id)?.name
  S.openList = { id, name, status: 'loading' }; render()
  try { const r = await account.setlistWords(id); if (S.openList?.id === id) S.openList = { id, name: r.name || name, status: 'ok', words: r.words } }
  catch (error) { if (S.openList?.id === id) S.openList = { id, name, status: 'error', error: error.message } }
  render()
}

// The tab is opened during the click, so pop-up blockers allow it; the address follows once the pass arrives.
async function finishProfile() {
  const tab = window.open('', '_blank')
  S.setlists = { ...S.setlists, opening: true, error: null }; render()
  try {
    const link = await account.profileLink(S.setlists.profile)
    if (tab) { tab.opener = null; tab.location.href = link } else location.assign(link)
    S.setlists = { ...S.setlists, opening: false, opened: true }
  } catch (error) {
    if (tab) tab.close()
    if (error.code === 'signed_out') return signedOut()
    S.setlists = { ...S.setlists, opening: false, error: error.message }
  }
  render()
}

function signedOut() { go('email', { user: null, setlists: null, openList: null }) }

// Comic reader. Progress (last page seen per episode), the one/two-page choice and the magnifier switch stay on this device.
const LENS_ZOOM = 2.5, LENS_SIZE = 190
const prefs = store.get('liann-hub-reader-prefs', {})
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches
let book = null, bookFor = ''
function dropBook() { if (book) { book.destroy(); book = null; bookFor = '' } }
// 3D book: the WebGL scene lives outside the re-rendered markup and is moved into each new stage by bindReader.
async function startBook() {
  const r = S.reader, ep = readerEp(); if (!r || !ep || !r.d3) return
  if (book && bookFor === ep.id) { r.d3state = 'ready'; return }
  dropBook(); r.d3state = 'loading'
  const id = ep.id
  try {
    const b = await createBook({ pages: ep.pages, alts: ep.alts, onFail: () => { if (S.reader?.d3) { S.reader.d3 = false; dropBook(); toast('3D book is not available for these pages'); S.reader.spread = wantSpread(S.reader, ep.pages.length); render() } } })
    if (!S.reader || !S.reader.d3 || S.reader.id !== id) { b.destroy(); return }
    book = b; bookFor = id; b.goTo(spreadIndexOf(S.reader.i, ep.pages.length), false)
    S.reader.d3state = 'ready'; render()
  } catch { if (S.reader?.id === id) { S.reader.d3 = false; S.reader.spread = wantSpread(S.reader, ep.pages.length); prefs.d3 = false; store.set('liann-hub-reader-prefs', prefs); toast('3D book is not available here'); render() } }
}
function readerEp() { return S.comics?.find(e => e.id === S.reader?.id) }
// Two pages side by side on a wide landscape screen (unless the reader chose otherwise); one page elsewhere.
function wantSpread(r, n) {
  if (n < 2) return false
  if (r.mode === 'spread') return true
  if (r.mode === 'single') return false
  return innerWidth >= 900 && innerWidth > innerHeight * 1.15
}
function openReader(id) {
  const ep = S.comics?.find(e => e.id === id); if (!ep) return
  const saved = S.progress[id]
  S.reader = { id, i: Number.isInteger(saved) && saved < ep.pages.length - 1 ? clampPage(saved, ep.pages.length) : 0, zoom: false, mode: prefs.mode || 'auto', lens: prefs.lens !== false, flip: null, can3d: webglOK() && ep.pages.length > 1 }
  S.reader.spread = wantSpread(S.reader, ep.pages.length)
  if (bookFor !== id) dropBook()
  S.reader.d3 = !!(prefs.d3 && S.reader.can3d && !S.noCors); if (S.reader.d3) { S.reader.spread = true; S.reader.d3state = book && bookFor === id ? 'ready' : 'loading' }
  S.more = false; S.notif = false; S.appear = false; history.replaceState(null, '', `#read/${encodeURIComponent(id)}`); render()
  if (S.reader.d3) startBook()
}
function closeReader() { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); S.reader = null; dropBook(); if (hashParts()[1]) history.replaceState(null, '', '#read'); render() }
// Go to page `to`; dir (+1 / -1) plays the page-turn when it is a single step.
function showPage(to, dir) {
  const ep = readerEp(); if (!ep) return
  const r = S.reader, n = ep.pages.length, from = visiblePages(r.i, n, r.spread)
  r.i = clampPage(to, n)
  r.flip = dir && !r.zoom && !r.d3 && !reduceMotion() ? { dir, from } : null
  if (r.d3 && book) book.goTo(spreadIndexOf(r.i, n))
  S.progress = { ...S.progress, [ep.id]: r.i }; store.set('liann-hub-reader', S.progress)
  render()
}
// Turn one page (single view) or one spread (two-page view).
function stepReader(d) {
  const ep = readerEp(); if (!ep) return
  const r = S.reader, n = ep.pages.length
  if (!r.spread) { if (r.i + d >= 0 && r.i + d < n) showPage(r.i + d, d); return }
  const sp = spreadsOf(n), k = spreadIndexOf(r.i, n) + d
  if (k >= 0 && k < sp.length) showPage(firstPageOf(sp[k]), d)
}
// Full page: the browser's Fullscreen API on the whole document (the reader is a fixed overlay inside it, so re-rendering
// never drops fullscreen). Where that is missing (iPhone Safari) the top bar is hidden instead. Esc or the button leaves it.
function setFull(on) {
  S.reader.full = on
  if (on && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {})
  if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {})
  render()
}
document.addEventListener('fullscreenchange', () => { if (S.reader && S.reader.full && !document.fullscreenElement && document.documentElement.requestFullscreen) { S.reader.full = false; render() } })
function savePrefs() { prefs.mode = S.reader.mode; prefs.lens = S.reader.lens; prefs.d3 = !!S.reader.d3; store.set('liann-hub-reader-prefs', prefs) }
// Hover magnifier: a circle that follows the mouse and shows the page under it enlarged.
function moveLens(e) {
  const lens = $('#rlens'); if (!lens) return
  if (!S.reader.lens || S.reader.zoom || e.pointerType !== 'mouse' || $('.flip')) { lens.hidden = true; return }
  const pg = document.elementsFromPoint(e.clientX, e.clientY).find(el => el.matches?.('.pg:not(.old)'))
  const img = pg?.querySelector('img')
  const g = img && img.naturalWidth && lensGeometry({ box: img.getBoundingClientRect(), natural: { w: img.naturalWidth, h: img.naturalHeight }, align: pg.classList.contains('l') ? 'right' : pg.classList.contains('r') ? 'left' : 'center', x: e.clientX, y: e.clientY, zoom: LENS_ZOOM, size: LENS_SIZE })
  if (!g) { lens.hidden = true; return }
  Object.assign(lens.style, { width: LENS_SIZE + 'px', height: LENS_SIZE + 'px', left: e.clientX - LENS_SIZE / 2 + 'px', top: e.clientY - LENS_SIZE / 2 + 'px',
    backgroundImage: `url("${img.src}")`, backgroundSize: `${g.bgSize[0]}px ${g.bgSize[1]}px`, backgroundPosition: `${g.bgPos[0]}px ${g.bgPos[1]}px` })
  lens.hidden = false
}
function bindReader() {
  const ep = readerEp(); if (!ep) return
  $('#rclose').onclick = closeReader
  $('#rprev').onclick = () => stepReader(-1)
  $('#rnext').onclick = () => stepReader(1)
  const zoomBtn = $('#rzoom'); if (zoomBtn) zoomBtn.onclick = () => { S.reader.zoom = !S.reader.zoom; S.reader.flip = null; render() }
  $('#rfull').onclick = () => setFull(!S.reader.full)
  const rexit = $('#rexit'); if (rexit) rexit.onclick = () => setFull(false)
  $('#rlensbtn').onclick = () => { S.reader.lens = !S.reader.lens; savePrefs(); render() }
  const b3 = $('#r3d'); if (b3) b3.onclick = () => {
    const r = S.reader; r.d3 = !r.d3; prefs.d3 = r.d3; savePrefs(); r.flip = null; r.zoom = false
    if (r.d3) { r.spread = true; r.d3state = book && bookFor === r.id ? 'ready' : 'loading'; render(); startBook() } else { r.spread = wantSpread(r, ep.pages.length); render() }
  }
  const mode = $('#rmode'); if (mode) mode.onclick = () => { S.reader.mode = S.reader.spread ? 'single' : 'spread'; S.reader.spread = wantSpread(S.reader, ep.pages.length); S.reader.flip = null; savePrefs(); render() }
  $('#rseek').onchange = e => showPage(Number(e.target.value) - 1, 0)
  const stage = $('#rstage'); let x0 = null, y0 = 0
  if (S.reader.d3 && S.reader.d3state === 'ready' && book) { stage.append(book.el); book.setLens(S.reader.lens !== false); book.resize() }
  stage.ontouchstart = e => { if (e.touches.length === 1 && !S.reader.zoom) { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY } else x0 = null }
  stage.ontouchend = e => {
    if (x0 === null) return
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0; x0 = null
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) stepReader(dx < 0 ? 1 : -1)
  }
  stage.onpointermove = moveLens
  stage.onpointerleave = () => { $('#rlens').hidden = true }
  const flip = $('.flip')
  if (flip) {
    const done = () => { if (!flip.isConnected) return; if (S.reader) S.reader.flip = null; document.querySelectorAll('.flip,.pg.old').forEach(x => x.remove()) }
    flip.addEventListener('animationend', done, { once: true }); setTimeout(done, 1200)
  }
  const near = [...visiblePages(S.reader.i, ep.pages.length, S.reader.spread), S.reader.i - 1, S.reader.i + 2, S.reader.i + 3].filter(j => j != null && j >= 0 && j < ep.pages.length)
  for (const j of near) { const im = new Image(); im.crossOrigin = 'anonymous'; im.src = ep.pages[j] } // CORS mode, so the browser's cached copy can also feed the 3D book's textures
  stage.focus({ preventScroll: true })
}
// Pages are requested in CORS mode so the 3D book can use them as textures. If the image host does not allow that, fall back to
// plain image requests: the flat reader keeps working and the 3D option is hidden.
document.addEventListener('error', e => {
  const im = e.target
  if (!(im instanceof HTMLImageElement) || !im.hasAttribute('crossorigin') || S.noCors) return
  S.noCors = true; dropBook(); if (S.reader) { S.reader.d3 = false; S.reader.spread = wantSpread(S.reader, readerEp()?.pages.length || 0) }
  render()
}, true)
document.addEventListener('keydown', e => {
  if (!S.reader) return
  if (e.key === 'Escape') { if (S.reader.full && !document.fullscreenElement) setFull(false); else if (!document.fullscreenElement) closeReader() }
  else if (e.key === 'f' || e.key === 'F') setFull(!S.reader.full)
  else if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); stepReader(1) }
  else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); stepReader(-1) }
})
window.addEventListener('resize', () => {
  const ep = readerEp(); if (!ep || S.reader.mode !== 'auto') return
  const want = wantSpread(S.reader, ep.pages.length); if (want !== S.reader.spread) { S.reader.spread = want; S.reader.flip = null; render() }
})

function bind() {
  document.querySelectorAll('[data-readep]').forEach(b => { b.onclick = () => openReader(b.dataset.readep) })
  bindReader()
  const f1 = $('#f1')
  if (f1) {
    const em = $('#em'); em.focus()
    em.oninput = () => { S.email = em.value; if (S.fix) { S.fix = ''; $('#fix').hidden = true } }
    f1.onsubmit = e => {
      e.preventDefault()
      const v = em.value.trim()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { S.error = 'Enter a valid email address.'; S.email = v; render(); return }
      const [u, d] = v.split('@')
      if (TYPO[d.toLowerCase()] && !S.fix) { S.fix = `${u}@${TYPO[d.toLowerCase()]}`; S.email = v; render(); return }
      S.fix = ''; S.email = v; sendCode(v)
    }
    const usefix = $('#usefix'); if (usefix) usefix.onclick = () => { S.email = S.fix; S.fix = ''; render() }
  }
  const f2 = $('#f2')
  if (f2) {
    const ins = [...f2.querySelectorAll('.code input')]; ins[0].focus()
    const code = () => ins.map(x => x.value).join('')
    const submit = async () => {
      if (S.busy) return
      S.busy = true; S.error = ''; f2.querySelector('[type=submit]').disabled = true
      try { const user = await account.verifyCode(S.email, code()); if (!user) throw new Error('Sign-in did not complete. Try again.'); go('who', { user }) }
      catch (error) { S.busy = false; S.error = error.message; render() }
    }
    ins.forEach((el, i) => {
      el.oninput = () => { el.value = el.value.replace(/\D/g, '').slice(-1); if (el.value && ins[i + 1]) ins[i + 1].focus(); if (ins.every(x => x.value)) submit() }
      el.onkeydown = e => { if (e.key === 'Backspace' && !el.value && ins[i - 1]) ins[i - 1].focus() }
      el.onpaste = e => { const d = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, CODE_LENGTH); if (d.length >= 6) { e.preventDefault(); ins.forEach((x, j) => { x.value = d[j] || '' }); submit() } }
    })
    f2.onsubmit = e => { e.preventDefault(); if (code().length < 6) { S.error = `Enter the ${CODE_LENGTH}-digit code from the email.`; render(); return } submit() }
    $('#back').onclick = () => go('email')
    $('#resend').onclick = async () => { try { await account.requestCode(S.email); toast('New code sent') } catch (error) { S.error = error.message; render() } }
  }
  const pick = $('#pick'); if (pick) pick.onclick = () => { S.learner = null; enterHub(S.user) }
  document.querySelectorAll('[data-pickchild]').forEach(b => { b.onclick = () => {
    const c = S.household?.children?.find(x => x.id === b.dataset.pickchild); if (!c) return
    S.learner = { id: c.id, name: c.name }; S.page = 'library'; history.replaceState(null, '', '#library'); enterHub(S.user)
  } })
  const addp = $('#addprofile'); if (addp) addp.onclick = () => { S.page = 'plan'; history.replaceState(null, '', '#plan'); enterHub(S.user) }
  const hhc = $('#hhcreate'); if (hhc) hhc.onclick = () => householdDo('POST', '', undefined, 'Household started')
  document.querySelectorAll('[data-hhaccept]').forEach(b => { b.onclick = () => householdDo('POST', `/invites/${b.dataset.hhaccept}/accept`, undefined, 'You joined the household') })
  document.querySelectorAll('[data-hhrevoke]').forEach(b => { b.onclick = () => householdDo('DELETE', `/invites/${b.dataset.hhrevoke}`, undefined, 'Invitation withdrawn') })
  document.querySelectorAll('[data-hhremove]').forEach(b => { b.onclick = () => { if (confirm('Remove this adult from your household?')) householdDo('DELETE', `/members/${b.dataset.hhremove}`, undefined, 'Removed') } })
  const hhl = $('#hhleave'); if (hhl) hhl.onclick = () => { if (confirm('Leave this household? Your own account and SetLists stay yours.')) householdDo('DELETE', '/members/me', undefined, 'You left the household') }
  document.querySelectorAll('[data-hharchive]').forEach(b => { b.onclick = () => { if (confirm('Remove this child profile from your household? Their SetLists are kept.')) householdDo('DELETE', `/children/${b.dataset.hharchive}`, undefined, 'Child profile removed') } })
  const hhi = $('#hhinvite'); if (hhi) hhi.onsubmit = e => { e.preventDefault(); householdDo('POST', '/invites', { email: $('#hhemail').value.trim() }, 'Invitation sent') }
  const hhk = $('#hhchild'); if (hhk) hhk.onsubmit = e => { e.preventDefault()
    const ok = $('#hhagree').checked
    householdDo('POST', '/children', { name: $('#hhcname').value, dateOfBirth: $('#hhcdob').value, guardianName: $('#hhgname').value,
      agreements: { terms: ok, privacy: ok } }, 'Child profile added') }
  document.querySelectorAll('#signout').forEach(b => { b.onclick = async () => { await account.signOut(); toast('Signed out'); signedOut() } })

  document.querySelectorAll('[data-nav]').forEach(b => { b.onclick = () => {
    S.page = b.dataset.nav; S.openList = null; S.appf = b.dataset.f || 'All'; S.more = false; S.notif = false
    history.replaceState(null, '', '#' + S.page); render(); const m = $('#main'); if (m) m.scrollTop = 0
  } })
  document.querySelectorAll('[data-appf]').forEach(b => { b.onclick = () => { S.appf = b.dataset.appf; render() } })
  document.querySelectorAll('[data-open]').forEach(a => { a.onclick = () => { S.recent = [a.dataset.open, ...S.recent.filter(x => x !== a.dataset.open)].slice(0, 3); store.set('liann-hub-recent', S.recent) } })
  document.querySelectorAll('[data-list]').forEach(b => { b.onclick = () => { S.page = 'library'; openList(b.dataset.list) } })
  const cl = $('#closelist'); if (cl) cl.onclick = () => { S.openList = null; render() }
  const rl = $('#retrylib'); if (rl) rl.onclick = loadLibrary
  const fp = $('#finishprofile'); if (fp) fp.onclick = finishProfile
  for (const id of ['q', 'ts']) { const el = $('#' + id); if (el) el.oninput = () => { S.query = el.value; if (id === 'ts' && S.page !== 'home') S.page = 'home'; render() } }
  for (const id of ['ask', 'topsearch']) { const f = $('#' + id); if (f) f.onsubmit = e => { e.preventDefault(); S.page = 'home'; render() } }
  const sl = $('#slim'); if (sl) sl.onclick = () => { S.slim = !S.slim; render() }
  for (const id of ['apbtn', 'apbtn2']) { const b = $('#' + id); if (b) b.onclick = () => { S.appear = !S.appear; if (S.appear) S.notif = false; render() } }
  const apc = $('#apclose'); if (apc) apc.onclick = () => { S.appear = false; render() }
  document.querySelectorAll('.dsopt').forEach(b => { b.onclick = () => { S.theme = { ...S.theme, ds: b.dataset.ds }; applyTheme(); render() } })
  document.querySelectorAll('[data-mode]').forEach(b => { b.onclick = () => { S.theme = { ...S.theme, t: b.dataset.mode }; applyTheme(); render() } })
  const me = $('#me'); if (me) me.onclick = () => go('who')
  const more = $('#morebtn'); if (more) more.onclick = () => { S.more = !S.more; render() }
  const bell = $('#bell'); if (bell) bell.onclick = () => { S.notif = !S.notif; if (S.notif) S.appear = false; render() }
  const nc = $('#notifclose'); if (nc) nc.onclick = () => { S.notif = false; render() }
  for (const [attr, key] of [['dchip', 'dchip'], ['shopf', 'shopf'], ['planf', 'planf'], ['figmode', 'figmode']]) {
    document.querySelectorAll(`[data-${attr}]`).forEach(b => { b.onclick = () => { S[key] = b.dataset[attr]; render() } })
  }
  document.querySelectorAll('[data-fig]').forEach(b => { b.onclick = () => { S.fig = b.dataset.fig; if (S.figmode === 'lineup') S.figmode = 'figure'; render() } })
  if (S.view === 'hub' && S.page === 'figures') mountViewer(S); else stopViewer()
  showTour()
}

// First-visit tour of the menu, as in the approved design. Shown once per device.
const TOUR = [['[data-nav="home"]', 'Home', 'Pick up where you left off, or type what you want to practise.'],
  ['[data-nav="apps"]', 'Apps', 'Every game and tool. Open them or get them here.'],
  ['[data-nav="read"]', 'Read', 'New Bella & LiANN episodes appear here.'],
  ['#me', 'Profiles', 'Your profile and sign-out.']]
function showTour() {
  document.querySelectorAll('.tour,.ring').forEach(e => e.remove())
  if (S.view !== 'hub' || S.page !== 'home' || store.get('liann-hub-tour-done', false)) return
  const step = S.tour || 0
  if (step >= TOUR.length) { store.set('liann-hub-tour-done', true); return }
  const [sel, h, t] = TOUR[step]
  const target = [...document.querySelectorAll(sel)].find(e => e.offsetParent); if (!target) return
  const r = target.getBoundingClientRect(), ring = document.createElement('div'), box = document.createElement('div')
  ring.className = 'ring'; Object.assign(ring.style, { left: r.left - 4 + 'px', top: r.top - 4 + 'px', width: r.width + 8 + 'px', height: r.height + 8 + 'px' })
  box.className = 'tour'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Tour')
  box.innerHTML = `<h4>${h}<span>${step + 1} of ${TOUR.length}</span></h4><div>${t}</div><div class="acts"><button class="skip" id="tskip">Skip tour</button><button class="btn" id="tnext">${step === TOUR.length - 1 ? 'Done' : 'Next'}</button></div>`
  document.body.append(ring, box)
  const bw = box.offsetWidth, bh = box.offsetHeight
  let x = r.right + 14, y = r.top
  if (x + bw > innerWidth - 16) { x = Math.max(16, r.right - bw); y = r.bottom + 14 }
  if (y + bh > innerHeight - 16) y = Math.max(16, r.top - bh - 14)
  Object.assign(box.style, { left: x + 'px', top: y + 'px' })
  $('#tnext').onclick = () => { S.tour = step + 1; showTour() }
  $('#tskip').onclick = () => { store.set('liann-hub-tour-done', true); showTour() }
}

window.addEventListener('hashchange', () => { if (S.view === 'hub') { S.page = pageFromHash(); S.openList = null; render(); openFromHash() } })

async function start() {
  applyTheme(); render()
  loadComics(config.comicsManifest).then(c => { S.comics = c }, () => { S.comics = [] }).finally(() => { if (S.view === 'hub') { render(); openFromHash() } })
  loadDownloads(config.downloadsManifest).then(d => { S.downloads = d }, e => { S.downloads = e }).finally(() => { if (S.view === 'hub') render() })
  if (!account.hasSession()) return go('email')
  try { const user = await account.user(); user ? enterHub(user) : go('email') }
  catch (error) { go('email', { error: error.message }) }
}
start()
