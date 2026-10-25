// Plans, sharing and teaching (owner decisions, 24 Oct 2026: individuals never pay; payment gates sharing).
import test from 'node:test'
import assert from 'node:assert/strict'
import { createAccount } from '../src/account.js'
import { esc } from '../src/esc.js'
import { esc as viewEsc, vHub } from '../src/views.js'
import { isCurrentPlan, planSummary, planNotice, sharedStrip, sentList, shareForm, joinCard, teacherSection, heldPlans } from '../src/sharing.js'

const ID = '11111111-2222-4333-8444-555555555555'
const ACCT = (over = {}) => ({ email: 'a@b.test', registered: true, accountType: 'registered',
  plans: { household: null, teacher: false, organisation: false, staff: false, ...(over.plans || {}) },
  capabilities: { shareSetlists: false, teachStudents: false, runHousehold: false, runOrganisation: false, ...(over.capabilities || {}) }, ...(over.top || {}) })

// A fetch that signs in, then answers the AlongSide routes in `routes` and records every call.
function harness(routes) {
  const calls = [], store = new Map()
  const storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) }
  const reply = (status, body) => ({ ok: status < 400, status, json: async () => body })
  const fetchImpl = async (url, opts = {}) => {
    const key = `${opts.method || 'GET'} ${url}`
    calls.push({ key, headers: opts.headers || {}, body: opts.body ? JSON.parse(opts.body) : undefined })
    if (key === 'GET https://api.test/v1/auth/config') return reply(200, { authentication: { enabled: true, supabaseUrl: 'https://sb.test', publishableKey: 'pk' } })
    if (key === 'GET https://sb.test/auth/v1/user') return reply(200, { email: 'a@b.test', email_confirmed_at: '2026-10-12' })
    if (key === 'POST https://sb.test/auth/v1/verify') return reply(200, { access_token: 'at1', refresh_token: 'rt1', expires_in: 3600, user: { email: 'a@b.test' } })
    const r = routes[key]; return r ? reply(...(typeof r === 'function' ? r(opts) : r)) : reply(404, {})
  }
  const acct = createAccount({ pinyinApi: 'https://api.test', backend: 'https://be.test', fetchImpl, storage })
  return { acct, calls, signIn: () => acct.verifyCode('a@b.test', '123456') }
}

test('the account summary is sanitised, and an AlongSide without the route gives null', async () => {
  const h = harness({ 'GET https://be.test/learning/account': [200, { email: 'a@b.test', registered: true, accountType: 'paying',
    plans: { household: 'platinum', teacher: 'yes', organisation: true }, capabilities: { shareSetlists: 1, teachStudents: true } }] })
  await h.signIn()
  const a = await h.acct.summary()
  assert.equal(a.plans.household, null, 'an unknown household plan is not shown')
  assert.equal(a.plans.teacher, false, 'only true counts'); assert.equal(a.plans.organisation, true)
  assert.equal(a.capabilities.shareSetlists, false); assert.equal(a.capabilities.teachStudents, true)
  assert.equal(h.calls.at(-1).headers.Authorization, 'Bearer at1')
  const none = harness({}); await none.signIn()
  assert.equal(await none.acct.summary(), null, 'a 404 means AlongSide does not have the route yet')
  assert.equal(await none.acct.teacherMe(), null); assert.equal(await none.acct.teacherPolicies(), null)
})

test('sharing calls use the right paths and methods, and refuse ids that are not ids', async () => {
  const h = harness({
    'GET https://be.test/learning/setlists/shares': [200, { incoming: [{ id: ID }], outgoing: 'nope' }],
    [`POST https://be.test/learning/setlists/${ID}/shares`]: [201, { ok: true }],
    [`POST https://be.test/learning/setlists/shares/${ID}/accept`]: [403, { error: 'learner_profile_required', profile: { url: 'https://be.test/student#profile' } }],
    [`POST https://be.test/learning/setlists/shares/${ID}/revoke`]: [200, { ok: true, revoked: true }],
    'POST https://be.test/learning/class-code': [200, { ok: true, className: 'Y7', teacher: 'Ms T' }],
  })
  await h.signIn()
  assert.deepEqual(await h.acct.shares(), { incoming: [{ id: ID }], outgoing: [] }, 'a malformed list becomes empty')
  await h.acct.shareSetlist(ID, 'friend@example.com')
  assert.deepEqual(h.calls.at(-1).body, { email: 'friend@example.com' })
  await assert.rejects(h.acct.acceptShare(ID), e => e.code === 'learner_profile_required' && e.body.profile.url.endsWith('/student#profile'))
  assert.equal((await h.acct.revokeShare(ID)).revoked, true)
  assert.equal((await h.acct.joinClass('ABCD-EFGH')).className, 'Y7'); assert.deepEqual(h.calls.at(-1).body, { code: 'ABCD-EFGH' })
  for (const bad of ['../admin', `${ID}/../x`, '', 'x']) {
    await assert.rejects(h.acct.shareSetlist(bad, 'a@b.test'), /Unknown SetList/); await assert.rejects(h.acct.acceptShare(bad), /Unknown share/)
    await assert.rejects(h.acct.classDetail(bad), /Unknown class/); await assert.rejects(h.acct.archiveClass(bad), /Unknown class/)
    await assert.rejects(h.acct.withdrawSeat(ID, bad), /Unknown seat/)
  }
})

test('teacher calls: onboarding records both agreements, classes and seats go under /learning/teacher', async () => {
  const h = harness({
    'POST https://be.test/learning/teacher/onboard': [200, { ok: true }],
    'POST https://be.test/learning/teacher/classes': [201, { class: { id: ID } }],
    [`POST https://be.test/learning/teacher/classes/${ID}/students`]: [201, { added: 1, skipped: 0 }],
    [`DELETE https://be.test/learning/teacher/classes/${ID}/students/${ID}`]: [200, { ok: true }],
    [`DELETE https://be.test/learning/teacher/classes/${ID}`]: [200, { ok: true, archived: true }],
    'GET https://be.test/learning/teacher/classes': [200, { classes: [{ id: ID }] }],
  })
  await h.signIn()
  await h.acct.teacherOnboard('Ms Teach'); assert.deepEqual(h.calls.at(-1).body, { fullName: 'Ms Teach', agreements: { terms: true, privacy: true } })
  await h.acct.createClass('Y7'); await h.acct.addSeats(ID, [{ name: 'A', isMinor: false, studentEmail: 'a@b.test' }])
  assert.deepEqual(h.calls.at(-1).body.students[0], { name: 'A', isMinor: false, studentEmail: 'a@b.test' })
  assert.equal((await h.acct.withdrawSeat(ID, ID)).ok, true); assert.equal((await h.acct.archiveClass(ID)).archived, true)
  assert.deepEqual(await h.acct.classes(), [{ id: ID }])
  assert.ok(h.calls.every(c => !c.key.includes('/tutor/') && !c.key.includes('/teacher/') || c.key.includes('/learning/teacher/') || c.key.includes('sb.test')), 'only the bearer routes under /learning are used')
})

test('which plan card is current: none while loading, Free without a plan or when AlongSide cannot say, the held plan otherwise', () => {
  assert.equal(isCurrentPlan('free', undefined), false, 'nothing is marked while the account is loading')
  assert.equal(isCurrentPlan('free', false), false, 'nor when the check failed')
  assert.equal(isCurrentPlan('free', null), true); assert.equal(isCurrentPlan('family', null), false)
  assert.equal(isCurrentPlan('free', ACCT()), true)
  const fam = ACCT({ plans: { household: 'family' } })
  assert.deepEqual(['free', 'couple', 'family', 'teacher', 'organisation'].map(k => isCurrentPlan(k, fam)), [false, false, true, false, false])
  const both = ACCT({ plans: { teacher: true, organisation: true } })
  assert.deepEqual(['free', 'teacher', 'organisation'].map(k => isCurrentPlan(k, both)), [false, true, true])
  for (const type of ['founder', 'staff', 'tutor', 'paying']) assert.equal(isCurrentPlan('free', ACCT({ top: { accountType: type } })), false, `${type} is not on the Free plan`)
  assert.deepEqual(heldPlans(both), ['Teacher plan', 'PolyFlow Performance plan'])
  assert.equal(planSummary(ACCT({ top: { accountType: 'founder' } })).t, 'Founder'); assert.equal(planSummary(ACCT({ top: { accountType: 'staff' } })).t, 'Staff')
  assert.equal(planSummary(fam).t, 'Family plan'); assert.equal(planSummary(null).t, 'Free')
  assert.doesNotMatch(JSON.stringify([planSummary(undefined), planSummary(false)]), /Free/, 'an unchecked account is never called Free')
  assert.match(vHub({ user: { email: 'a@b.test' }, theme: { ds: 'liann', t: 'dark' }, page: 'plan', acct: false }), /Could not be checked[\s\S]*id="retryplan"/)
})

test('the Plan page: honest about sharing, no price but "Price to be set", and nothing can be bought', () => {
  const base = { user: { email: 'a@b.test' }, theme: { ds: 'liann', t: 'dark' }, page: 'plan' }
  for (const planf of ['Learners', 'Tutors', 'Organisations']) {
    const html = vHub({ ...base, planf, acct: ACCT() })
    assert.match(html, /Everything an individual does in their own account is free\. Plans are for sharing: a household, a class, an organisation\./)
    assert.doesNotMatch(html, /[£$€]\s?\d/, 'no invented price')
    assert.doesNotMatch(html, /<button class="btn"[^>]*>(Buy|Subscribe|Choose|Upgrade)/i)
    assert.doesNotMatch(html.replace(/Purchase-order buying/g, ''), /\b(buy|subscribe)\b/i, `${planf}: no wording that sells`)
  }
  assert.match(vHub({ ...base, planf: 'Tutors', acct: ACCT() }), /Teachers who are not LiANN tutors[\s\S]*Price to be set/)
  assert.match(vHub({ ...base, planf: 'Organisations', acct: ACCT() }), /PolyFlow Performance[\s\S]*Price to be set/)
  const fam = vHub({ ...base, acct: ACCT({ plans: { household: 'family' } }) })
  assert.equal((fam.match(/Current plan/g) || []).length, 1)
  assert.doesNotMatch(vHub({ ...base, acct: ACCT() }), /id="teacher"/, 'no Teacher section without the capability')
})

test('the Library shows Share, Join a class and shared lists only for the signed-in adult, and only where AlongSide answers', () => {
  const lists = { status: 'ok', items: [{ id: ID, name: 'Tone pairs', words: 2 }] }
  const base = { user: { email: 'a@b.test' }, theme: { ds: 'liann', t: 'dark' }, page: 'library', setlists: lists }
  const free = vHub({ ...base, acct: ACCT() })
  assert.match(free, new RegExp(`data-sharelist="${ID}"[^>]*>Share · needs a plan<`)); assert.match(free, /id="joinf"/)
  const paid = vHub({ ...base, acct: ACCT({ capabilities: { shareSetlists: true } }) })
  assert.match(paid, new RegExp(`data-sharelist="${ID}"[^>]*>Share<`))
  for (const html of [vHub({ ...base, acct: null }), vHub({ ...base, acct: undefined }), vHub({ ...base, acct: ACCT(), learner: { id: ID, name: 'Mei' } })])
    assert.doesNotMatch(html, /data-sharelist|id="joinf"|sharedwithyou/, 'not shown to a child profile or without the probe')
})

test('sharing screens escape everything the server sends, and say "copy", never "link" or "live"', () => {
  const evil = '<img src=x onerror=alert(1)>'
  const s = { shares: { incoming: [{ id: ID, name: evil, words: 1, from: evil }], outgoing: [{ id: ID, name: evil, email: evil, words: 2, state: evil }, { id: ID, name: 'N', email: 'e@x.test', words: 2, state: 'pending' }] },
    share: { id: ID, name: evil, email: evil, error: evil }, join: { code: evil, error: evil, done: evil }, shareError: evil }
  for (const html of [sharedStrip(s), sentList(s), shareForm(s), joinCard(s)]) { assert.ok(!html.includes('<img'), 'escaped'); assert.match(html, /&lt;img/) }
  assert.match(sharedStrip(s), /1 word · from/); assert.match(sentList(s), /2 words/)
  const all = [sharedStrip(s), shareForm({ share: { id: ID, name: 'N' } }), sentList(s), joinCard({})].join(' ').replace(/<[^>]+>/g, ' ')
  assert.match(all, /their own copy/i); assert.doesNotMatch(all, /\blink(s|ed)?\b|\blive\b/i)
  assert.match(planNotice('Needs a plan.'), /data-nav="plan"[^>]*>See plans</)
  assert.ok(!planNotice('x').includes('href='), 'the plans button never carries an address from the server')
})

test('the Teacher section: hidden without the capability, for a LiANN tutor and when AlongSide is silent; escaped when shown', () => {
  const can = ACCT({ plans: { teacher: true }, capabilities: { teachStudents: true } })
  assert.equal(teacherSection({ acct: ACCT(), teacher: { teacher: null } }), '')
  assert.equal(teacherSection({ acct: can, teacher: null }), '', 'AlongSide did not answer')
  assert.equal(teacherSection({ acct: can, teacher: { liannTutor: true } }), '', 'a LiANN tutor keeps the AlongSide dashboard')
  assert.match(teacherSection({ acct: can, teacher: undefined }), /Loading/)
  const evil = '<img src=x onerror=alert(1)>'
  const onboard = teacherSection({ acct: can, teacher: { teacher: null }, tform: { name: evil }, tpolicies: [{ title: evil, version: evil, body_text: evil, source_url: 'javascript:alert(1)' }, { title: 'Terms', version: 1, body_text: 'x', source_url: 'https://lwliann.com/terms' }] })
  assert.ok(!onboard.includes('<img') && !onboard.includes('javascript:'), 'escaped, and a non-https address is dropped')
  assert.match(onboard, /href="https:\/\/lwliann\.com\/terms"/); assert.match(onboard, /id="tagree"/)
  assert.match(teacherSection({ acct: can, teacher: { teacher: null }, tpolicies: null }), /href="https:\/\/lwliann\.com\/terms"/, 'without the text, the website is linked')
  const classes = teacherSection({ acct: can, teacher: { teacher: { onboarded: true }, classes: [{ id: ID, name: evil, code: 'ABCD-EFGH', pending: 2, joined: 1 }] } })
  assert.ok(!classes.includes('<img')); assert.match(classes, /1 student joined · 2 waiting/); assert.match(classes, /ABCD-EFGH/)
  const detail = teacherSection({ acct: can, teacher: { teacher: { onboarded: true } }, cls: { id: ID, status: 'ok', cls: { name: evil, code: 'ABCD-EFGH' },
    seats: [{ id: ID, name: evil, to: evil, isMinor: true, status: 'pending' }, { id: ID, name: 'Done', to: 'd@x.test', isMinor: false, status: 'accepted' }], rows: [{ name: evil, minor: true, email: evil }] } })
  assert.ok(!detail.includes('<img'), 'escaped'); assert.match(detail, /child, via/); assert.match(detail, /Parent or guardian/)
  assert.equal((detail.match(/data-seatwithdraw/g) || []).length, 1, 'only a seat that is still waiting can be withdrawn')
  assert.match(detail, /Nothing is emailed/)
})

test('one escape function serves the whole hub', () => { assert.equal(viewEsc, esc); assert.equal(esc('<&">\''), '&lt;&amp;&quot;&gt;&#39;'.replace('&lt;&amp;&quot;&gt;', '&lt;&amp;&quot;&gt;')) })
