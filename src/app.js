import { config, NAV, CODE_LENGTH } from './config.js'
import { createAccount } from './account.js'
import { loadDownloads } from './downloads.js'
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
  view: 'loading', email: '', user: null, page: pageFromHash(), appf: 'All', slim: false, appear: false,
  theme: theme && DS.some(d => d[0] === theme.ds) && /^(light|dark)$/.test(theme.t) ? theme : { ds: 'liann', t: 'dark' },
  recent: store.get('liann-hub-recent', []), downloads: null, setlists: null, openList: null, query: '', busy: false, error: '', fix: '',
}

function pageFromHash() { const k = location.hash.slice(1); return NAV.some(([n]) => n === k) ? k : 'home' }
function applyTheme() { document.documentElement.dataset.ds = S.theme.ds; document.documentElement.dataset.t = S.theme.t; store.set('liann-hub-theme', S.theme) }
function toast(text) { const el = $('#toast'); el.textContent = text; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true }, 2200) }
function go(view, extra = {}) { Object.assign(S, { error: '', busy: false }, extra, { view }); render() }

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
  loadLibrary()
}

async function loadLibrary() {
  S.setlists = { status: 'loading' }
  if (S.view === 'hub') render()
  try { S.setlists = { status: 'ok', items: await account.setlists() } }
  catch (error) {
    if (error.code === 'signed_out') return signedOut()
    S.setlists = { status: 'error', error: error.message }
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

function signedOut() { go('email', { user: null, setlists: null, openList: null }) }

function bind() {
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
  const pick = $('#pick'); if (pick) pick.onclick = () => enterHub(S.user)
  document.querySelectorAll('#signout').forEach(b => { b.onclick = async () => { await account.signOut(); toast('Signed out'); signedOut() } })

  document.querySelectorAll('[data-nav]').forEach(b => { b.onclick = () => {
    S.page = b.dataset.nav; S.openList = null; S.appf = b.dataset.f || 'All'; S.more = false
    history.replaceState(null, '', '#' + S.page); render(); const m = $('#main'); if (m) m.scrollTop = 0
  } })
  document.querySelectorAll('[data-appf]').forEach(b => { b.onclick = () => { S.appf = b.dataset.appf; render() } })
  document.querySelectorAll('[data-open]').forEach(a => { a.onclick = () => { S.recent = [a.dataset.open, ...S.recent.filter(x => x !== a.dataset.open)].slice(0, 3); store.set('liann-hub-recent', S.recent) } })
  document.querySelectorAll('[data-list]').forEach(b => { b.onclick = () => { S.page = 'library'; openList(b.dataset.list) } })
  const cl = $('#closelist'); if (cl) cl.onclick = () => { S.openList = null; render() }
  const rl = $('#retrylib'); if (rl) rl.onclick = loadLibrary
  for (const id of ['q', 'ts']) { const el = $('#' + id); if (el) el.oninput = () => { S.query = el.value; if (id === 'ts' && S.page !== 'home') S.page = 'home'; render() } }
  for (const id of ['ask', 'topsearch']) { const f = $('#' + id); if (f) f.onsubmit = e => { e.preventDefault(); S.page = 'home'; render() } }
  const sl = $('#slim'); if (sl) sl.onclick = () => { S.slim = !S.slim; render() }
  for (const id of ['apbtn', 'apbtn2']) { const b = $('#' + id); if (b) b.onclick = () => { S.appear = !S.appear; render() } }
  const apc = $('#apclose'); if (apc) apc.onclick = () => { S.appear = false; render() }
  document.querySelectorAll('.dsopt').forEach(b => { b.onclick = () => { S.theme = { ...S.theme, ds: b.dataset.ds }; applyTheme(); render() } })
  document.querySelectorAll('[data-mode]').forEach(b => { b.onclick = () => { S.theme = { ...S.theme, t: b.dataset.mode }; applyTheme(); render() } })
  const me = $('#me'); if (me) me.onclick = () => go('who')
  const more = $('#morebtn'); if (more) more.onclick = () => { S.more = !S.more; render() }
  const bell = $('#bell'); if (bell) bell.onclick = () => toast('No new notifications')
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

window.addEventListener('hashchange', () => { if (S.view === 'hub') { S.page = pageFromHash(); S.openList = null; render() } })

async function start() {
  applyTheme(); render()
  loadDownloads(config.downloadsManifest).then(d => { S.downloads = d }, e => { S.downloads = e }).finally(() => { if (S.view === 'hub') render() })
  if (!account.hasSession()) return go('email')
  try { const user = await account.user(); user ? enterHub(user) : go('email') }
  catch (error) { go('email', { error: error.message }) }
}
start()
