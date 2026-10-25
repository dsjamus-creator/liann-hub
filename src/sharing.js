// Plans, sharing and teaching screens (owner decisions, 24 Oct 2026: individuals never pay; payment is for sharing).
// Pure render functions, state in and HTML out, like views.js. Nothing here can buy anything: every price stays
// "Price to be set". Every name, address and message from the server is escaped.
import { esc } from './esc.js'

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
const num = v => Number(v) || 0
const httpsUrl = u => (/^https:\/\/[^\s"'<>]+$/.test(String(u || '')) ? String(u) : '')
export const TERMS_URL = 'https://lwliann.com/terms', PRIVACY_URL = 'https://lwliann.com/privacy'

// A refusal that needs a plan: the message, and a way to the plans page. The hub never follows the address in the reply.
export const planNotice = text => `<p class="err" role="alert" style="margin:0">${esc(text)} <button type="button" class="link" data-nav="plan">See plans</button></p>`

const PLAN_NAME = { couple: 'Couple plan', family: 'Family plan' }
export const heldPlans = a => (a ? [a.plans.household && PLAN_NAME[a.plans.household], a.plans.teacher && 'Teacher plan', a.plans.organisation && 'PolyFlow Performance plan'].filter(Boolean) : [])

// The "your plan" card. a: the account summary. null: this AlongSide does not answer yet (Free, as before). undefined: still
// loading, and false: the check failed. Neither of those says Free, because a plan holder is not on the Free plan.
export function planSummary(a) {
  const free = { t: 'Free', s: 'Learner · no charge', d: 'Pinyin games, Bella &amp; LiANN and your SetLists from every game.' }
  if (a === undefined) return { t: 'Your plan', s: 'Checking\u2026', d: 'We are checking which plan this account holds.' }
  if (a === false) return { t: 'Your plan', s: 'Could not be checked', d: 'Your plan could not be loaded just now.' }
  if (!a) return free
  if (a.accountType === 'founder' || a.accountType === 'staff')
    return { t: a.accountType === 'founder' ? 'Founder' : 'Staff', s: 'Every plan is open to this account', d: 'No plan is needed to share SetLists, run a household, teach a class or start an organisation.' }
  const held = heldPlans(a)
  if (held.length) return { t: held.join(' · '), s: 'Plan active', d: 'Plans are for sharing. Everything you do in your own account stays free.' }
  if (a.accountType === 'tutor') return { t: 'LiANN tutor', s: 'Tutor account', d: 'Everything an individual does in their own account is free.' }
  if (a.accountType === 'paying') return { t: 'Paid plan', s: 'Active', d: 'Plans are for sharing. Everything you do in your own account stays free.' }
  return free
}

// Which plan card is marked "Current plan". Until the account has answered, none is; when AlongSide cannot answer, Free is.
export function isCurrentPlan(key, a) {
  if (a === undefined || a === false) return false
  if (key === 'free') return !a || (!a.plans.household && !a.plans.teacher && !a.plans.organisation && !['founder', 'staff', 'tutor', 'paying'].includes(a.accountType))
  if (key === 'couple' || key === 'family') return a?.plans.household === key
  if (key === 'teacher') return Boolean(a?.plans.teacher)
  if (key === 'organisation') return Boolean(a?.plans.organisation)
  return false
}

// ---- Library: share a SetList with someone, accept one, withdraw one, join a class ----

// "Shared with you": lists other people sent. Accepting adds the person's own copy.
export function sharedStrip(s) {
  const list = s.shares?.incoming || []
  if (!list.length && !s.shareError) return ''
  return `<section class="sec" id="sharedwithyou"><div class="sechead"><h2>Shared with you</h2></div>
  ${s.shareError ? `<p class="err" role="alert" style="margin:0">${esc(s.shareError)}</p>` : ''}
  <div class="grid">${list.map(x => `<div class="c" data-share="${esc(x.id)}"><div class="t">${esc(x.name)}</div><div class="s">${plural(num(x.words), 'word')} · from ${esc(x.from)}</div>
   <div class="d">Accepting adds your own copy to your Library. The list you were sent stays theirs.</div>
   <div class="acts"><button class="btn" data-acceptshare="${esc(x.id)}"${s.shareBusy ? ' disabled' : ''}>Accept</button></div></div>`).join('')}</div></section>`
}

export function shareForm(s) {
  const f = s.share
  if (!f) return ''
  return `<section class="sec"><form class="c" id="sharef" novalidate><div class="t">Share “${esc(f.name)}” with someone</div>
  <div class="d">They receive their own copy. Your list stays yours.</div>
  <div class="field"><label for="shareemail">Their email</label><input id="shareemail" type="email" autocomplete="off" placeholder="name@example.com" value="${esc(f.email || '')}" required></div>
  ${f.plan ? planNotice(f.error) : f.error ? `<p class="err" role="alert" style="margin:0">${esc(f.error)}</p>` : ''}
  <div class="acts"><button class="btn" type="submit"${f.busy ? ' disabled' : ''}>${f.busy ? 'Sharing…' : 'Share'}</button><button class="btn ghost" type="button" id="sharecancel">Cancel</button></div></form></section>`
}

const STATE = { pending: 'Waiting', accepted: 'Accepted', revoked: 'Withdrawn', expired: 'Expired' }
export function sentList(s) {
  const out = s.shares?.outgoing || []
  if (!out.length) return ''
  return `<section class="sec"><div class="sechead"><h2>Shared by you</h2></div><div class="c"><ul class="sentlist">${out.map(x => `<li><b>${esc(x.name)}</b>
   <span class="muted">· to ${esc(x.email)} · ${plural(num(x.words), 'word')} · ${STATE[x.state] || esc(x.state)}</span>${x.state === 'pending' ? ` <button class="link" data-revokeshare="${esc(x.id)}">Withdraw</button>` : ''}</li>`).join('')}</ul></div></section>`
}

export function joinCard(s) {
  const j = s.join || {}
  return `<section class="sec"><div class="sechead"><h2>Join a class</h2></div><form class="c" id="joinf" novalidate>
  <div class="d">Your teacher gives you a class code. Use the email your teacher listed for you, then enter the code here.</div>
  <div class="field"><label for="classcode">Class code</label><input id="classcode" maxlength="12" autocomplete="off" autocapitalize="characters" placeholder="ABCD-EFGH" value="${esc(j.code || '')}"></div>
  ${j.error ? `<p class="err" role="alert" style="margin:0">${esc(j.error)}</p>` : ''}${j.done ? `<p role="status" style="margin:0">${esc(j.done)}</p>` : ''}
  <div class="acts"><button class="btn" type="submit"${j.busy ? ' disabled' : ''}>${j.busy ? 'Joining…' : 'Join'}</button></div></form></section>`
}

// ---- Plan page: the teacher's classes ----

function policyBlocks(pol) {
  if (!Array.isArray(pol) || !pol.length) return `<p class="muted" style="margin:0">The full text is on the website: <a href="${TERMS_URL}" target="_blank" rel="noopener noreferrer">Terms</a> and <a href="${PRIVACY_URL}" target="_blank" rel="noopener noreferrer">Privacy Promise</a>.</p>`
  return pol.map(p => `<details class="policy"><summary>${esc(p.title)} (version ${esc(p.version)})</summary><div style="max-height:220px;overflow:auto;white-space:pre-wrap;font-size:.85rem;padding:8px 0">${esc(p.body_text || 'The full text is not available here yet.')}</div>${httpsUrl(p.source_url) ? `<a href="${esc(httpsUrl(p.source_url))}" target="_blank" rel="noopener noreferrer">Open the full document</a>` : ''}</details>`).join('')
}

function onboardForm(s) {
  const t = s.tform || {}
  return `<section class="sec" id="teacher"><div class="sechead"><h2>Teacher</h2><span class="muted">Teacher plan</span></div>
  <form class="c" id="tonboard" novalidate><div class="t">Start teaching with a class</div>
  <div class="d">You list your own students, or give a class a code. Each student joins with the email you list for them, so a code is no use to anyone else. Lessons, bookings and payouts are for LiANN tutors, not for teachers.</div>
  <div class="field"><label for="tname">Your name</label><input id="tname" maxlength="160" autocomplete="name" required value="${esc(t.name || '')}"></div>
  ${policyBlocks(s.tpolicies)}
  <label style="display:flex;gap:8px;align-items:flex-start;font-size:.9rem"><input id="tagree" type="checkbox"${t.agreed ? ' checked' : ''}> <span>I have read and agree to the Terms and Privacy Promise.</span></label>
  ${s.tError ? `<p class="err" role="alert" style="margin:0">${esc(s.tError)}</p>` : ''}
  <div class="acts"><button class="btn" type="submit"${s.tBusy ? ' disabled' : ''}>${s.tBusy ? 'Saving…' : 'Start teaching'}</button></div></form></section>`
}

function classList(s) {
  const list = s.teacher.classes || []
  return `<section class="sec" id="teacher"><div class="sechead"><h2>Your classes</h2><span class="muted">Teacher</span></div>
  ${s.tError ? `<p class="err" role="alert" style="margin:0">${esc(s.tError)}</p>` : ''}
  <div class="grid">${list.map(c => `<div class="c" data-class="${esc(c.id)}"><div class="t">${esc(c.name)}</div><div class="s">${plural(num(c.joined), 'student')} joined · ${num(c.pending)} waiting</div>
   <div class="classcode" aria-label="Class code">${esc(c.code)}</div><div class="acts"><button class="btn" data-openclass="${esc(c.id)}">Open</button></div></div>`).join('')}
   <form class="c" id="newclass" novalidate><div class="t">New class</div><div class="d">A class has its own code to hand out.</div>
    <div class="field"><label for="cname">Class name</label><input id="cname" maxlength="120" required></div>
    <div class="acts"><button class="btn" type="submit"${s.tBusy ? ' disabled' : ''}>Create class</button></div></form></div></section>`
}

const seatRow = (r, i) => `<div class="seatrow"><input data-row="${i}" data-f="name" maxlength="120" placeholder="Student’s name" aria-label="Student ${i + 1} name" value="${esc(r.name)}">
  <select data-row="${i}" data-f="minor" aria-label="Student ${i + 1} is an adult or a child"><option value="0"${r.minor ? '' : ' selected'}>Adult</option><option value="1"${r.minor ? ' selected' : ''}>Child under 18</option></select>
  <input data-row="${i}" data-f="email" type="email" inputmode="email" autocomplete="off" placeholder="${r.minor ? 'Parent or guardian’s email' : 'Their email'}" aria-label="Student ${i + 1} email" value="${esc(r.email)}"></div>`

function classDetail(s) {
  const k = s.cls
  const back = '<button class="link" id="closeclass">Back to classes</button>'
  if (k.status === 'loading') return `<section class="sec" id="teacher"><div class="sechead"><h2>Class</h2>${back}</div><div class="empty">Loading the class…</div></section>`
  if (k.status === 'error') return `<section class="sec" id="teacher"><div class="sechead"><h2>Class</h2>${back}</div><div class="empty err">${esc(k.error)}</div></section>`
  const c = k.cls, seats = k.seats || [], busy = k.busy ? ' disabled' : ''
  return `<section class="sec" id="teacher"><div class="sechead"><h2>${esc(c.name)}</h2>${back}</div>
  <div class="c"><div class="d">Class code</div><div class="classcode big" id="theclasscode">${esc(c.code)}</div>
   <div class="acts"><button class="btn" id="copycode">Copy code</button></div>
   <p class="d" style="margin:0">Students sign in with the email you listed (for a child, the parent or guardian’s email) and enter this code.</p></div>
  ${k.error ? `<p class="err" role="alert" style="margin:0">${esc(k.error)}</p>` : ''}
  <div class="c"><div class="t">Students</div>${seats.length ? `<ul class="sentlist">${seats.map(x => `<li><b>${esc(x.name)}</b> <span class="muted">· ${x.isMinor ? 'child, via ' : ''}${esc(x.to)} · ${x.status === 'accepted' ? 'Joined' : 'Waiting'}</span>${x.status === 'pending' ? ` <button class="link" data-seatwithdraw="${esc(x.id)}">Withdraw</button>` : ''}</li>`).join('')}</ul>` : '<p class="muted" style="margin:0">No students listed yet.</p>'}</div>
  <form id="addseats" class="c" novalidate><div class="t">Add students</div><div class="d">Nothing is emailed. Give your students the class code. A child is listed with a parent or guardian’s email, not their own.</div>
   ${k.rows.map(seatRow).join('')}
   <div class="acts"><button type="button" class="btn ghost" id="seatmore"${k.rows.length >= 20 ? ' disabled' : ''}>Add another row</button><button class="btn" type="submit"${busy}>Add students</button></div></form>
  <div><button class="btn ghost" id="archiveclass"${busy}>Archive this class</button></div></section>`
}

// The Teacher section of the Plan page. Shown only to an account that may teach (a Teacher plan, or founder or staff). A LiANN tutor
// keeps the AlongSide dashboard, and AlongSide not answering yet shows nothing.
export function teacherSection(s) {
  if (!s.acct?.capabilities?.teachStudents || s.teacher === null || s.teacher?.liannTutor) return ''
  if (!s.teacher) return '<section class="sec" id="teacher"><div class="sechead"><h2>Teacher</h2></div><div class="empty">Loading…</div></section>'
  if (!s.teacher.teacher?.onboarded) return onboardForm(s)
  return s.cls ? classDetail(s) : classList(s)
}
