/*
 * Learning with LiANN support widget, version 1 (24 October 2026).
 *
 * One support form and a live chat in a single element. First-party: no third-party script, no cookie, nothing the
 * hub's Content-Security-Policy has to allow beyond its existing connect-src for the AlongSide backend. The canonical copy
 * is lwl-backend public/support/support-widget.js; the hub (src/support-widget.js) and the website (assets/support-widget.js)
 * ship identical copies, checked by byte comparison. Backend contract: docs/SUPPORT.md in lwl-backend.
 *
 *   import { mountSupport } from './support-widget.js'
 *   mountSupport(document.getElementById('support'), { backend: 'https://lwl-backend-mhgo.onrender.com', source: 'hub-support' })
 *
 * Everything is built with textContent, never innerHTML, so nothing a visitor or an agent types can inject markup.
 */
export const TOPICS = [['account', 'Account and sign-in'], ['plans', 'Plans and sharing'], ['setlists', 'SetLists'], ['game', 'A game'],
  ['polyflow', 'PolyFlow'], ['dualsubs', 'Dual Subs'], ['lyricsync', 'LyricSync'], ['alongside', 'AlongSide'],
  ['safeguarding', 'A safeguarding concern'], ['other', 'Something else']]
export const PRODUCTS = [['hub', 'The hub'], ['website', 'The website'], ['pinyin-tiles', 'Pinyin Tiles'], ['pinyin-puzzle', 'Pinyin Puzzle'],
  ['mahjong-tones', 'Mahjong Tones'], ['alongside', 'AlongSide'], ['polyflow', 'PolyFlow'], ['lyricsync', 'LyricSync'],
  ['dual-subs', 'Dual Subs'], ['other', 'Something else']]
const SAFEGUARDING = 'If a child or anyone else is in immediate danger, please call 999 now.'
const KEY = 'lwl-support-chat'

const CSS = `
.lwls{font:inherit;color:inherit;max-width:42rem}
.lwls *{box-sizing:border-box}
.lwls h2,.lwls h3{margin:0 0 .4rem;font-size:1.15rem}
.lwls p{margin:.3rem 0}
.lwls .lwls-note{opacity:.8;font-size:.9rem}
.lwls .lwls-row{display:grid;gap:.75rem;margin:.75rem 0}
@media(min-width:36rem){.lwls .lwls-row.two{grid-template-columns:1fr 1fr}}
.lwls label{display:grid;gap:.25rem;font-weight:600;font-size:.92rem}
.lwls label small{font-weight:400;opacity:.75}
.lwls input,.lwls select,.lwls textarea{font:inherit;color:inherit;background:transparent;border:1px solid color-mix(in srgb,currentColor 35%,transparent);border-radius:.5rem;padding:.55rem .65rem;width:100%}
.lwls textarea{min-height:7rem;resize:vertical}
.lwls input:focus-visible,.lwls select:focus-visible,.lwls textarea:focus-visible,.lwls button:focus-visible{outline:2px solid var(--accent,#C68F38);outline-offset:2px}
.lwls .lwls-acts{display:flex;flex-wrap:wrap;gap:.6rem;margin-top:.75rem}
.lwls button{font:inherit;font-weight:700;border-radius:.6rem;padding:.6rem 1rem;border:1px solid transparent;cursor:pointer;background:var(--accent,#C68F38);color:var(--on-accent,var(--accent-fg,#1C1608))}
.lwls button.ghost{background:transparent;color:inherit;border-color:color-mix(in srgb,currentColor 40%,transparent)}
.lwls button[disabled]{opacity:.55;cursor:default}
.lwls .lwls-err{color:var(--danger,#C62828);font-weight:600}
.lwls .lwls-pill{display:inline-block;border-radius:999px;padding:.1rem .6rem;font-size:.82rem;font-weight:700;border:1px solid color-mix(in srgb,currentColor 35%,transparent)}
.lwls .lwls-pill.on::before{content:'';display:inline-block;width:.55rem;height:.55rem;border-radius:50%;background:#2E7D32;margin-right:.4rem}
.lwls .lwls-log{display:grid;gap:.5rem;max-height:22rem;overflow:auto;padding:.5rem;border:1px solid color-mix(in srgb,currentColor 25%,transparent);border-radius:.6rem;margin:.6rem 0}
.lwls .lwls-msg{max-width:85%;padding:.45rem .7rem;border-radius:.8rem;white-space:pre-wrap;overflow-wrap:anywhere;background:color-mix(in srgb,currentColor 10%,transparent)}
.lwls .lwls-msg.you{justify-self:end;background:color-mix(in srgb,var(--accent,#C68F38) 25%,transparent)}
.lwls .lwls-msg.system{justify-self:center;max-width:100%;font-size:.88rem;opacity:.85;background:transparent;border:1px dashed color-mix(in srgb,currentColor 30%,transparent)}
.lwls .lwls-compose{display:flex;gap:.5rem}
.lwls .lwls-compose input{flex:1}
.lwls .lwls-hp{position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden}
.lwls .lwls-card{border:1px solid color-mix(in srgb,currentColor 25%,transparent);border-radius:.8rem;padding:1rem}
`

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue
    if (k === 'class') el.className = v
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v)
    else el.setAttribute(k, v === true ? '' : v)
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)))
  return el
}
const options = (list, value) => list.map(([v, label]) => h('option', { value: v, selected: v === value }, label))

export function mountSupport(root, { backend, source = 'support', product = 'other', email = '', name = '', pollMs = 3000, storage } = {}) {
  if (!root || !backend) throw new Error('mountSupport needs an element and a backend URL')
  const base = String(backend).replace(/\/$/, '')
  let store = storage
  try { store ??= globalThis.sessionStorage } catch { store = null }
  const remember = (v) => { try { v ? store?.setItem(KEY, JSON.stringify(v)) : store?.removeItem(KEY) } catch { /* private mode */ } }
  const recall = () => { try { return JSON.parse(store?.getItem(KEY) || 'null') } catch { return null } }
  if (!document.querySelector('style[data-lwl-support]')) document.head.append(h('style', { 'data-lwl-support': '' }, CSS))

  async function api(method, path, body, token) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15000)
    try {
      const res = await fetch(base + path, { method, signal: controller.signal, cache: 'no-store',
        headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { 'x-chat-token': token } : {}) },
        body: body ? JSON.stringify(body) : undefined })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw Object.assign(new Error(data.error || 'request_failed'), { status: res.status, code: data.error || 'request_failed' })
      return data
    } catch (e) {
      if (e.code) throw e
      throw Object.assign(new Error('network'), { status: 0, code: 'network' })
    } finally { clearTimeout(timer) }
  }
  const say = {
    valid_email_required: 'Enter one email address.', message_required: 'Write a few words about what you need.',
    message_too_long: 'That message is too long. Please shorten it.', too_many_enquiries: 'You have written to us several times already. Please wait an hour, or reply to our last email.',
    too_many_chats: 'You have started several chats already. Please wait an hour, or leave a message instead.', slow_down: 'Please wait a moment before sending more.',
    chat_too_long: 'This chat has got long. Please leave your email and we will pick it up.', network: 'We could not reach support. Please check your connection and try again.',
    support_unavailable: 'Support is unavailable for a moment. Please try again shortly.',
  }
  const sayError = (e) => say[e.code] || 'Something went wrong. Please try again.'

  let timer = null, stopped = false
  const stopPolling = () => { stopped = true; clearTimeout(timer) }

  // ── Compose: the form, with chat offered while someone is online ───────────────────────────────────────────
  async function showCompose(draft = {}, notice = '') {
    stopPolling()
    root.replaceChildren()
    const wrap = h('div', { class: 'lwls' })
    root.append(wrap)
    let online = false
    try { online = (await api('GET', '/support/chat/status')).staffOnline === true } catch { online = false }
    const f = { email: draft.email ?? email, name: draft.name ?? name, topic: draft.topic ?? 'other', product: draft.product ?? product, message: draft.message ?? '' }
    const err = h('p', { class: 'lwls-err', role: 'alert' }, notice)
    const guard = h('p', { class: 'lwls-note', hidden: f.topic !== 'safeguarding' }, SAFEGUARDING)
    const topic = h('select', { id: 'lwls-topic', name: 'topic' }, options(TOPICS, f.topic))
    topic.addEventListener('change', () => { guard.hidden = topic.value !== 'safeguarding' })
    const fields = {
      name: h('input', { id: 'lwls-name', name: 'name', autocomplete: 'name', maxlength: 200, value: f.name }),
      email: h('input', { id: 'lwls-email', name: 'email', type: 'email', autocomplete: 'email', maxlength: 254, value: f.email }),
      topic, product: h('select', { id: 'lwls-product', name: 'product' }, options(PRODUCTS, f.product)),
      message: h('textarea', { id: 'lwls-message', name: 'message', maxlength: 4000, required: true }, f.message),
      website: h('input', { name: 'website', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true' }),
    }
    const values = () => Object.fromEntries(Object.entries(fields).map(([k, el]) => [k, el.value.trim()]))
    const busy = (b, on) => { b.disabled = on; wrap.querySelectorAll('button').forEach(x => { x.disabled = on }) }
    const send = h('button', { type: 'button' }, 'Send message')
    const chat = h('button', { type: 'button', class: online ? '' : 'ghost', hidden: !online }, 'Start live chat')
    send.addEventListener('click', async () => {
      const v = values(); err.textContent = ''
      if (!v.email) { err.textContent = say.valid_email_required; fields.email.focus(); return }
      busy(send, true)
      try {
        const out = await api('POST', '/support/enquiries', { ...v, source })
        showSent(out.reference)
      } catch (e) { err.textContent = sayError(e); busy(send, false) }
    })
    chat.addEventListener('click', async () => {
      const v = values(); err.textContent = ''
      busy(chat, true)
      try {
        const out = await api('POST', '/support/chat', { ...v, source })
        remember({ id: out.chatId, token: out.token, after: 0 })
        showChat({ id: out.chatId, token: out.token, after: 0 })
      } catch (e) {
        if (e.code === 'no_staff_online') { showCompose(v, 'No one is online to chat right now. Send us a message instead and we will reply by email.'); return }
        err.textContent = sayError(e); busy(chat, false)
      }
    })
    wrap.append(
      h('div', { class: 'lwls-card' },
        h('h2', {}, 'Contact support'),
        h('p', {}, h('span', { class: 'lwls-pill' + (online ? ' on' : '') }, online ? 'Live chat is available' : 'Chat is offline: leave a message')),
        h('p', { class: 'lwls-note' }, 'Support is for adults. If you are under 18, please ask a parent or guardian to write to us. We reply by email, usually within one working day.'),
        h('div', { class: 'lwls-row two' },
          h('label', { for: 'lwls-name' }, 'Your name ', h('small', {}, '(optional)'), fields.name),
          h('label', { for: 'lwls-email' }, 'Email ', h('small', {}, online ? '(needed for a message, optional for chat)' : '(so we can reply)'), fields.email)),
        h('div', { class: 'lwls-row two' },
          h('label', { for: 'lwls-topic' }, 'What is it about?', fields.topic),
          h('label', { for: 'lwls-product' }, 'Which app?', fields.product)),
        guard,
        h('div', { class: 'lwls-row' }, h('label', { for: 'lwls-message' }, 'Your message', fields.message)),
        h('div', { class: 'lwls-hp' }, h('label', {}, 'Leave this empty', fields.website)),
        err,
        h('div', { class: 'lwls-acts' }, chat, send)),
    )
  }

  function showSent(reference) {
    stopPolling(); remember(null); root.replaceChildren()
    root.append(h('div', { class: 'lwls' }, h('div', { class: 'lwls-card', role: 'status' },
      h('h2', {}, 'Thank you'),
      h('p', {}, 'We have your message. Your reference is ', h('strong', {}, reference), '.'),
      h('p', { class: 'lwls-note' }, 'We reply by email, usually within one working day. Quote the reference if you write to us again.'),
      h('div', { class: 'lwls-acts' }, h('button', { type: 'button', class: 'ghost', onclick: () => showCompose() }, 'Send another message')))))
  }

  // ── Chat ─────────────────────────────────────────────────────────────────────────────────────────────────
  function showChat(session) {
    root.replaceChildren(); stopped = false
    const status = h('span', { class: 'lwls-pill on' }, 'Waiting for someone to join')
    const log = h('div', { class: 'lwls-log', role: 'log', 'aria-live': 'polite', 'aria-label': 'Chat with LiANN support' })
    const input = h('input', { id: 'lwls-say', name: 'say', maxlength: 1000, autocomplete: 'off', 'aria-label': 'Your message' })
    const sendBtn = h('button', { type: 'submit' }, 'Send')
    const err = h('p', { class: 'lwls-err', role: 'alert' })
    const offer = h('div', { class: 'lwls-card', hidden: true })
    const endBtn = h('button', { type: 'button', class: 'ghost' }, 'End chat')
    const form = h('form', { class: 'lwls-compose' }, input, sendBtn)
    const wrap = h('div', { class: 'lwls' }, h('div', { class: 'lwls-card' },
      h('h2', {}, 'Chat with support'), h('p', {}, status), log, form, err,
      h('div', { class: 'lwls-acts' }, endBtn), offer))
    root.append(wrap)

    const seen = new Set()
    const draw = (m) => {
      if (seen.has(m.id)) return
      seen.add(m.id)
      log.append(h('div', { class: 'lwls-msg ' + m.from, 'data-from': m.from }, m.body))
      log.scrollTop = log.scrollHeight
    }
    let closed = false
    const closeUi = () => { closed = true; input.disabled = true; sendBtn.disabled = true; endBtn.textContent = 'Start a new chat'; endBtn.onclick = () => { remember(null); showCompose() } }
    const showOffer = () => {
      if (!offer.hidden) return
      offer.hidden = false
      const em = h('input', { id: 'lwls-leave-email', type: 'email', autocomplete: 'email', maxlength: 254, value: email })
      const go = h('button', { type: 'button' }, 'Email me instead')
      const oerr = h('p', { class: 'lwls-err', role: 'alert' })
      go.addEventListener('click', async () => {
        oerr.textContent = ''
        if (!em.value.trim()) { oerr.textContent = say.valid_email_required; em.focus(); return }
        go.disabled = true
        try { const out = await api('POST', `/support/chat/${session.id}/leave-details`, { email: em.value.trim() }, session.token); showSent(out.reference) }
        catch (e) { oerr.textContent = sayError(e); go.disabled = false }
      })
      offer.append(h('h3', {}, 'Rather leave your email?'), h('p', { class: 'lwls-note' }, 'If no one can join right now, we will email you the reply and keep this conversation.'),
        h('label', { for: 'lwls-leave-email' }, 'Email', em), oerr, h('div', { class: 'lwls-acts' }, go))
    }

    const poll = async () => {
      if (stopped) return
      try {
        if (!document.hidden) {
          const out = await api('GET', `/support/chat/${session.id}?after=${session.after}`, undefined, session.token)
          for (const m of out.messages) { draw(m); session.after = Math.max(session.after, m.id) }
          remember(session)
          status.textContent = out.status === 'closed' ? 'Chat ended' : out.status === 'active' ? 'Chatting with LiANN support' : 'Waiting for someone to join'
          status.classList.toggle('on', out.status !== 'closed')
          if (out.status === 'closed') closeUi()
          if (out.offerDetails && !out.reference) showOffer()
          if (out.reference) { showSent(out.reference); return }
          if (out.status === 'closed' && !out.offerDetails) { stopPolling(); return }
        }
        err.textContent = ''
      } catch (e) {
        if (e.code === 'chat_not_found') { remember(null); showCompose({}, 'That chat has ended. You can start a new one.'); return }
        err.textContent = sayError(e)
      }
      if (!stopped && !closed) timer = setTimeout(poll, pollMs)
    }

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault()
      const body = input.value.trim()
      if (!body || closed) return
      sendBtn.disabled = true; err.textContent = ''
      try {
        const out = await api('POST', `/support/chat/${session.id}/messages`, { body }, session.token)
        input.value = ''; draw(out.message); session.after = Math.max(session.after, out.message.id); remember(session)
      } catch (e) { err.textContent = sayError(e) }
      sendBtn.disabled = false; input.focus()
    })
    endBtn.addEventListener('click', async () => {
      if (closed) return
      try { await api('POST', `/support/chat/${session.id}/close`, {}, session.token) } catch { /* the chat idles out */ }
      closeUi(); status.textContent = 'Chat ended'; status.classList.remove('on')
    })
    poll()
  }

  const saved = recall()
  // A reload starts the transcript from the top: the server returns the whole conversation, so nothing is lost on screen.
  if (saved?.id && saved?.token) showChat({ id: saved.id, token: saved.token, after: 0 })
  else showCompose()
  return { destroy() { stopPolling(); root.replaceChildren() } }
}
