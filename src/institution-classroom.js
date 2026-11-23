import { config } from './config.js'
import { createAccount } from './account.js'

const account = createAccount({ pinyinApi: config.pinyinApi, backend: config.backend })
const root = document.querySelector('#institution-classroom')
const classId = new URL(location.href).searchParams.get('classId') || ''
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const s = { className: 'Class', role: '', session: null, activity: null, status: '', socket: null, presence: 0, responses: [], saved: [], busy: false, revealed: false, remaining: '', tick: null }
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]))
const date = value => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : ''
const nowClock = () => {
  if (!s.activity?.endAt) return
  const seconds = Math.max(0, Math.ceil((s.activity.endAt - Date.now()) / 1000))
  s.remaining = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
  const el = document.querySelector('[data-timer]')
  if (el) el.textContent = s.remaining
  if (!seconds) {
    const note = document.querySelector('[data-timer-note]')
    if (note) note.textContent = 'Time is up. Your teacher controls what happens next.'
  }
}
function responseCards(rows) {
  return rows.length ? rows.map(r => `<article class="ic-response"><strong>${esc(r.participant)}</strong><p lang="zh-Hans">${esc(r.hanzi)}</p><p>${esc(r.pinyin)}</p><p>${esc(r.english)}</p></article>`).join('') : '<div class="ic-empty">Responses will appear here when your teacher reveals them.</div>'
}
function page() {
  const session = s.session
  const teacher = s.role === 'teacher'
  const forms = !session && teacher ? `
    <section class="ic-card">
      <h2>Prepare today’s class</h2>
      <p class="ic-muted">Set the textbook reference and session length. Pupils in this class roster will be able to join.</p>
      <form id="start-session">
        <div class="ic-field"><label for="session-title">Lesson title</label><input id="session-title" maxlength="160" value="Class lesson"></div>
        <div class="ic-grid">
          <div class="ic-field"><label for="book-title">Textbook</label><input id="book-title" maxlength="200" placeholder="New Practical Chinese Reader"></div>
          <div class="ic-field"><label for="book-edition">Edition</label><input id="book-edition" maxlength="120" placeholder="Edition or level"></div>
          <div class="ic-field"><label for="unit-ref">Unit / lesson</label><input id="unit-ref" maxlength="200" placeholder="Unit 3 · At the restaurant"></div>
          <div class="ic-field"><label for="page-ref">Page reference</label><input id="page-ref" maxlength="120" placeholder="Pages 42–43"></div>
        </div>
        <div class="ic-field"><label for="session-minutes">Classroom session length</label><select id="session-minutes"><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60" selected>60 minutes</option><option value="90">90 minutes</option><option value="120">120 minutes</option><option value="180">180 minutes</option></select></div>
        <div class="ic-actions"><button class="btn primary" type="submit" ${s.busy ? 'disabled' : ''}>Launch class session</button></div>
      </form>
    </section>` : !session && !teacher ? `
    <section class="ic-card"><h2>Waiting for your teacher</h2><p class="ic-muted">This class has no active classroom session yet. Keep this page open or refresh when your teacher launches one.</p><button class="btn ghost" id="refresh-class">Check again</button></section>` : ''
  const sessionUI = session ? `
    <section class="ic-card">
      <div class="ic-meta"><span class="ic-chip">${teacher ? 'Teacher controls' : 'Pupil view'}</span><span class="ic-chip" data-presence>${s.presence} connected</span></div>
      <h2>${esc(session.title || 'Class lesson')}</h2>
      <p class="ic-muted">${[session.textbook_title,session.textbook_edition,session.unit_reference,session.page_reference].filter(Boolean).map(esc).join(' · ') || 'No textbook reference added'}<br>Session ends ${esc(date(session.ends_at))}</p>
      <div class="ic-actions"><button class="btn primary" id="connect-room" ${s.socket?.readyState === WebSocket.OPEN ? 'disabled' : ''}>${s.socket?.readyState === WebSocket.OPEN ? 'Connected to classroom' : teacher ? 'Open classroom controls' : 'Join classroom'}</button>${teacher ? `<button class="btn ghost" id="end-session">End class session</button>` : ''}</div>
      <div class="ic-status" role="status">${esc(s.status || 'Connect to see the live activity.')}</div>
    </section>
    ${s.socket?.readyState === WebSocket.OPEN ? `
    <section class="ic-card ic-activity">
      ${s.activity ? `
        <div class="ic-meta"><span class="ic-chip">Timed activity</span><span class="ic-timer" data-timer>${esc(s.remaining || '')}</span></div>
        <div class="prompt">${esc(s.activity.prompt)}</div><p class="ic-muted" data-timer-note>${s.revealed ? 'Discuss the class responses together.' : 'Responses stay private to the teacher until reveal.'}</p>
        ${!teacher && !s.revealed ? `<form id="response-form"><div class="ic-field"><label for="answer-hanzi">中文 · Chinese</label><input id="answer-hanzi" maxlength="500" required autocomplete="off"></div><div class="ic-field"><label for="answer-pinyin">Hanyu Pinyin</label><input id="answer-pinyin" maxlength="500" required autocomplete="off"></div><div class="ic-field"><label for="answer-english">English</label><input id="answer-english" maxlength="500" required autocomplete="off"></div><button class="btn primary" type="submit">Send response</button></form>` : ''}
        ${teacher ? `<div class="ic-responses">${responseCards(s.responses)}</div><div class="ic-actions">${!s.revealed ? '<button class="btn primary" id="reveal-responses">Reveal responses</button>' : '<button class="btn primary" id="save-work">Save group work to lesson</button>'}</div>` : s.revealed ? `<div class="ic-responses">${responseCards(s.responses)}</div>` : ''}
      ` : teacher ? `<form id="start-activity"><h2>Launch a timed activity</h2><div class="ic-field"><label for="activity-prompt">Prompt for the class</label><textarea id="activity-prompt" maxlength="1000" required placeholder="Write a sentence using the phrase from today’s lesson."></textarea></div><div class="ic-field"><label for="activity-seconds">Response time</label><select id="activity-seconds"><option value="60">1 minute</option><option value="120" selected>2 minutes</option><option value="180">3 minutes</option><option value="300">5 minutes</option><option value="600">10 minutes</option></select></div><button class="btn primary" type="submit">Start timed activity</button></form>` : '<div class="ic-empty">Your teacher will launch the next activity.</div>'}
    </section>
    <section class="ic-card"><h2>Saved to this class lesson</h2>${s.saved.length ? s.saved.map(w => `<div class="ic-saved"><strong>${esc(w.artifact?.activity?.prompt || 'Class activity')}</strong><p class="ic-muted">${esc(date(w.created_at))} · ${Number(w.artifact?.activity?.responses?.length) || 0} pupil responses</p></div>`).join('') : '<p class="ic-muted">Revealed work appears here after the teacher chooses “Save group work to lesson”.</p>'}</section>` : ''
  return `<div class="ic-card"><p class="ic-muted">Learning with LiANN · AlongSide classroom</p><h1>${esc(s.className)}</h1><p class="ic-muted">Teacher-led textbook discussion for this institution class.</p></div><div class="ic-status" ${s.status ? 'role="alert"' : ''}>${esc(s.status || '')}</div>${forms}${sessionUI}`
}
function render() { root.innerHTML = page(); bind() }
async function load() {
  if (!account.schoolSession()) { s.status = 'Sign in to the school account in LiANN Hub first, then open this class again.'; render(); return }
  if (!UUID.test(classId)) { s.status = 'This class link is invalid. Return to the Hub and open a class from your roster.'; render(); return }
  try {
    const data = await account.institutionClassroomActive(classId)
    s.className = data.className || 'Class'
    s.role = data.role
    s.session = data.session
    s.status = ''
    if (s.session) await loadSaved()
  } catch (error) { s.status = error.message }
  render()
}
async function loadSaved() {
  try { s.saved = await account.institutionClassroomSavedWork(classId, s.session.id) }
  catch { s.saved = [] }
}
async function connectRoom() {
  if (!s.session || s.socket?.readyState === WebSocket.OPEN) return
  s.status = 'Connecting securely to the class…'; render()
  try {
    const { pass } = await account.institutionClassroomSocketPass(classId, s.session.id)
    const url = new URL(config.backend)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    url.pathname = '/classroom/institution-ws'
    url.search = ''
    url.searchParams.set('pass', pass)
    const ws = new WebSocket(url.href)
    s.socket = ws
    ws.onopen = () => { s.status = 'Connected. Teacher controls are active.'; render() }
    ws.onmessage = event => {
      let msg; try { msg = JSON.parse(event.data) } catch { return }
      if (msg.t === 'group-role') s.role = msg.role
      if (msg.t === 'group-presence') { s.presence = Number(msg.count) || 0; const el=document.querySelector('[data-presence]'); if(el)el.textContent=`${s.presence} connected` }
      if (msg.t === 'group-activity-start') { s.activity={ id:msg.activityId,prompt:msg.prompt,endAt:msg.endAt }; s.responses=Array.isArray(msg.responses)?msg.responses:[]; s.revealed=msg.t==='group-activity-reveal'; clearInterval(s.tick); s.tick=setInterval(nowClock,250); s.status='The teacher has started an activity.'; render(); nowClock() }
      if (msg.t === 'group-activity-response' && s.role === 'teacher' && msg.activityId === s.activity?.id) { const ix=s.responses.findIndex(r=>r.participant===msg.response.participant); if(ix<0)s.responses.push(msg.response); else s.responses[ix]=msg.response; render() }
      if (msg.t === 'group-activity-reveal' && msg.activityId === s.activity?.id) { s.revealed=true; s.responses=Array.isArray(msg.responses)?msg.responses:s.responses; s.status='Responses are revealed for class discussion.'; render(); nowClock() }
      if (msg.t === 'group-activity-close') { s.activity=null; s.responses=[]; s.revealed=false; s.status='The teacher closed the activity.'; render() }
      if (msg.t === 'group-session-ended') { s.session=null; s.activity=null; s.status='The teacher ended this classroom session.'; render() }
    }
    ws.onerror = () => { s.status = 'Classroom connection failed. Check your connection and try again.'; render() }
    ws.onclose = event => { clearInterval(s.tick); if(event.code===4403)s.status='Your active class membership changed. Return to your school administrator.'; else if(event.code!==4003)s.status='You are disconnected. Reconnect to rejoin the class.'; render() }
  } catch (error) { s.status = error.message; render() }
}
function bind() {
  const start = document.querySelector('#start-session')
  if (start) start.onsubmit = async event => {
    event.preventDefault(); s.busy=true; s.status='Launching the class session…'; render()
    try {
      await account.startInstitutionClassroom(classId, {
        title:document.querySelector('#session-title').value,
        textbookTitle:document.querySelector('#book-title').value,
        textbookEdition:document.querySelector('#book-edition').value,
        unitReference:document.querySelector('#unit-ref').value,
        pageReference:document.querySelector('#page-ref').value,
        minutes:Number(document.querySelector('#session-minutes').value),
      })
      s.busy=false; await load()
    } catch(error) { s.busy=false; s.status=error.message; render() }
  }
  const refresh=document.querySelector('#refresh-class'); if(refresh)refresh.onclick=load
  const connect=document.querySelector('#connect-room'); if(connect)connect.onclick=connectRoom
  const end=document.querySelector('#end-session'); if(end)end.onclick=async()=>{if(!s.session)return;try{await account.endInstitutionClassroom(classId,s.session.id);s.session=null;s.activity=null;s.status='Class session ended.';render()}catch(e){s.status=e.message;render()}}
  const startActivity=document.querySelector('#start-activity')
  if(startActivity)startActivity.onsubmit=event=>{
    event.preventDefault();if(s.socket?.readyState!==WebSocket.OPEN)return
    const prompt=document.querySelector('#activity-prompt').value.trim()
    const seconds=Number(document.querySelector('#activity-seconds').value)
    if(!prompt)return
    const activityId=crypto.randomUUID()
    s.activity={id:activityId,prompt,endAt:Date.now()+seconds*1000};s.responses=[];s.revealed=false
    s.socket.send(JSON.stringify({t:'group-activity-start',activityId,prompt,seconds}))
    s.status='Activity is live. Pupils can submit their three-line responses.';render();nowClock();clearInterval(s.tick);s.tick=setInterval(nowClock,250)
  }
  const response=document.querySelector('#response-form')
  if(response)response.onsubmit=event=>{
    event.preventDefault();if(s.socket?.readyState!==WebSocket.OPEN||!s.activity)return
    const answer={hanzi:document.querySelector('#answer-hanzi').value.trim(),pinyin:document.querySelector('#answer-pinyin').value.trim(),english:document.querySelector('#answer-english').value.trim()}
    s.socket.send(JSON.stringify({t:'group-activity-response',activityId:s.activity.id,response:answer}))
    s.status='Response sent. You can update it until time is up or the teacher reveals the class.';render()
  }
  const reveal=document.querySelector('#reveal-responses')
  if(reveal)reveal.onclick=()=>{
    if(!s.activity||s.socket?.readyState!==WebSocket.OPEN)return
    s.socket.send(JSON.stringify({t:'group-activity-reveal',activityId:s.activity.id}))
    s.revealed=true;s.status='Responses are revealed for class discussion.';render()
  }
  const save=document.querySelector('#save-work')
  if(save)save.onclick=async()=>{
    if(!s.activity||!s.revealed)return
    save.disabled=true
    try{await account.saveInstitutionClassroomWork(classId,s.session.id,s.activity.id);s.status='Group work saved to this class lesson.';await loadSaved()}
    catch(error){s.status=error.message}
    render()
  }
}
window.addEventListener('pagehide',()=>{clearInterval(s.tick);try{s.socket?.close()}catch{}})
render()
void load()
