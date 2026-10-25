// Email-code sign-in (Supabase, spec D16) and read-only access to the learner's AlongSide SetLists.
// The flow matches public/shared/lwl-account.js in pinyin-tiles-playtest: the Supabase URL and
// publishable key come from the Pinyin API at run time, and the backend is called with a bearer token.
// Tokens stay in this origin's localStorage and are never logged.

const SESSION_KEY = 'liann-hub-session-v1'

export class AccountError extends Error {
  constructor(message, code, status) { super(message); this.code = code; this.status = status }
}

export function createAccount({ pinyinApi, backend, fetchImpl = (...a) => fetch(...a), storage = globalThis.localStorage, now = () => Date.now(), origin = globalThis.location?.origin }) {
  let authConfig = null

  const read = () => { try { return JSON.parse(storage.getItem(SESSION_KEY) || 'null') } catch { return null } }
  const write = value => { try { storage.setItem(SESSION_KEY, JSON.stringify(value)); return true } catch { return false } }
  const clear = () => { try { storage.removeItem(SESSION_KEY) } catch { /* storage blocked */ } }

  async function json(url, options = {}) {
    let response
    try { response = await fetchImpl(url, { cache: 'no-store', referrerPolicy: 'no-referrer', ...options }) }
    catch { throw new AccountError('Could not reach the server. Check your connection and try again.', 'network') }
    let body = {}
    try { body = response.status === 204 ? {} : await response.json() } catch { body = {} }
    if (!response.ok) throw Object.assign(new AccountError(body.error_description || body.msg || body.error || `HTTP ${response.status}`, body.error_code || body.error || 'http', response.status), { body })
    return body
  }

  async function settings() {
    if (authConfig) return authConfig
    const result = await json(`${pinyinApi}/v1/auth/config`)
    const auth = result.authentication
    if (!auth?.enabled || !auth.supabaseUrl || !auth.publishableKey) throw new AccountError('Sign-in is unavailable right now.', 'auth_disabled')
    authConfig = auth
    return auth
  }

  function store(session) {
    session.expires_at = Number(session.expires_at) || Math.floor(now() / 1000) + Number(session.expires_in || 3600)
    if (!session.access_token || !session.refresh_token) throw new AccountError('The sign-in response was incomplete.', 'bad_session')
    if (!write({ access_token: session.access_token, refresh_token: session.refresh_token, expires_at: session.expires_at, email: session.user?.email || null }))
      throw new AccountError('This browser blocked storage, so you cannot stay signed in.', 'storage')
  }

  async function requestCode(email) {
    const s = await settings()
    // The email also carries a sign-in link. Without a return address Supabase sends it to the project's default site (the
    // Pinyin Tiles game), which uses the code up. Asking for this site brings the link back here; Supabase ignores an address
    // that is not on its Redirect URLs list.
    const back = origin ? `?redirect_to=${encodeURIComponent(`${origin}/`)}` : ''
    await json(`${s.supabaseUrl}/auth/v1/otp${back}`, {
      method: 'POST', headers: { 'content-type': 'application/json', apikey: s.publishableKey },
      body: JSON.stringify({ email, create_user: true }),
    })
  }

  async function verifyCode(email, code) {
    if (!/^\d{6,10}$/.test(code)) throw new AccountError('Enter the code from the email.', 'bad_code')
    const s = await settings()
    let session
    try {
      session = await json(`${s.supabaseUrl}/auth/v1/verify`, {
        method: 'POST', headers: { 'content-type': 'application/json', apikey: s.publishableKey },
        body: JSON.stringify({ email, token: code, type: 'email' }),
      })
    } catch (error) {
      if (error.status === 403 || error.status === 400) throw new AccountError('That code is wrong or has expired. Check the latest email, or send a new code.', 'bad_code', error.status)
      throw error
    }
    store(session)
    return user()
  }

  // The sign-in link in the email returns here with the session in the address fragment (#access_token=...&refresh_token=...),
  // or with #error=...&error_code=otp_expired when the link or code was already used. Returns null for any other fragment.
  function acceptLink(hash) {
    const q = new URLSearchParams(String(hash || '').replace(/^#/, ''))
    if (q.get('access_token')) {
      store({ access_token: q.get('access_token'), refresh_token: q.get('refresh_token'), expires_in: q.get('expires_in'), expires_at: q.get('expires_at') })
      return { ok: true }
    }
    if (q.get('error') || q.get('error_code')) {
      const used = ['otp_expired', 'access_denied'].includes(q.get('error_code') || q.get('error'))
      return { ok: false, code: q.get('error_code') || q.get('error'), message: used ? 'That sign-in link was already used or has expired. Type the code from the email, or send a new code.' : (q.get('error_description') || 'That sign-in link could not be used.').replace(/\+/g, ' ') }
    }
    return null
  }

  async function accessToken() {
    const session = read()
    if (!session?.access_token) return null
    if (Number(session.expires_at) > Math.floor(now() / 1000) + 60) return session.access_token
    const s = await settings()
    try {
      const refreshed = await json(`${s.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST', headers: { 'content-type': 'application/json', apikey: s.publishableKey },
        body: JSON.stringify({ refresh_token: session.refresh_token }),
      })
      store(refreshed)
      return refreshed.access_token
    } catch (error) {
      if (error.status === 400 || error.status === 401) { clear(); return null }
      throw error
    }
  }

  async function user() {
    const token = await accessToken()
    if (!token) return null
    const s = await settings()
    try {
      const u = await json(`${s.supabaseUrl}/auth/v1/user`, { headers: { apikey: s.publishableKey, Authorization: `Bearer ${token}` } })
      if (!u.email) return null
      return { email: u.email.toLowerCase(), confirmed: Boolean(u.email_confirmed_at) }
    } catch (error) {
      if (error.status === 401 || error.status === 403) { clear(); return null }
      throw error
    }
  }

  async function signOut() {
    const token = await accessToken().catch(() => null)
    clear()
    if (!token || !authConfig) return
    await fetchImpl(`${authConfig.supabaseUrl}/auth/v1/logout`, {
      method: 'POST', headers: { apikey: authConfig.publishableKey, Authorization: `Bearer ${token}` }, body: '{}',
    }).catch(() => {})
  }

  async function backendGet(path) {
    const token = await accessToken()
    if (!token) throw new AccountError('Sign in to see your Library.', 'signed_out')
    return json(`${backend}${path}`, { headers: { Authorization: `Bearer ${token}` } })
  }

  // Couple and Family plans (One LiANN account C3). A 404 means AlongSide has households switched off.
  async function backendCall(method, path, body) {
    const token = await accessToken()
    if (!token) throw new AccountError('Sign in again to continue.', 'signed_out')
    return json(`${backend}${path}`, { method, headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
      body: body === undefined ? undefined : JSON.stringify(body) })
  }
  async function household() {
    try { return await backendGet('/learning/household') } catch (error) { if (error.status === 404) return null; throw error }
  }
  const householdAction = (method, path, body) => backendCall(method, `/learning/household${path}`, body)

  async function setlists(profileId) {
    if (profileId !== undefined && !/^[0-9a-f-]{36}$/i.test(String(profileId))) throw new AccountError('Unknown profile.', 'bad_profile')
    try {
      const result = await backendGet(profileId ? `/learning/setlists?profileId=${encodeURIComponent(profileId)}` : '/learning/setlists')
      return Array.isArray(result.setlists) ? result.setlists : []
    } catch (error) {
      if (error.code === 'not_a_student') throw Object.assign(new AccountError('Your Library needs a learner profile first.', 'not_a_student', error.status), { profile: error.body?.profile })
      throw error
    }
  }

  async function setlistWords(id) {
    if (!/^[0-9a-f-]{36}$/i.test(String(id))) throw new AccountError('Unknown SetList.', 'bad_id')
    const result = await backendGet(`/learning/setlists/${encodeURIComponent(id)}/words`)
    return { name: result.name, words: Array.isArray(result.words) ? result.words : [] }
  }

  // Finish the learner profile (One LiANN account, B2): ask AlongSide for a one-time pass, which opens its profile
  // form already signed in. Only AlongSide's own addresses are ever used, whatever the reply says.
  async function profileLink(profile) {
    const token = await accessToken()
    if (!token) throw new AccountError('Sign in again to finish your profile.', 'signed_out')
    const origin = new URL(backend).origin
    const ours = u => { try { return new URL(u).origin === origin } catch { return false } }
    const form = `${origin}/student#profile`
    const passUrl = ours(profile?.sessionPass?.url) ? profile.sessionPass.url : `${origin}/learning/session-pass`
    const next = /^\/(?!\/)[^\s\\]*$/.test(profile?.sessionPass?.next || '') ? profile.sessionPass.next : '/student#profile'
    try {
      const result = await json(passUrl, { method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ next }) })
      if (!ours(result.url)) throw new AccountError('AlongSide sent an unexpected address.', 'bad_pass')
      return result.url
    } catch (error) {
      // An AlongSide without the pass yet: open the form; it asks the learner to sign in there.
      if (error.status === 404) return form
      throw error
    }
  }

  // Plans, sharing and teaching (owner, 24 Oct 2026: individuals never pay; payment gates sharing). Every route below sits under
  // /learning, which AlongSide opens to this site with a bearer token. A 404 means that AlongSide does not have the route yet,
  // and the hub then simply shows nothing new.
  const UUID = /^[0-9a-f-]{36}$/i
  const need = (id, what) => { if (!UUID.test(String(id))) throw new AccountError(`Unknown ${what}.`, 'bad_id'); return encodeURIComponent(id) }
  const missing = promise => promise.catch(error => { if (error.status === 404) return null; throw error })

  // What this account may do: the plans it holds and the sharing it may start. null: AlongSide does not answer yet.
  async function summary() {
    const a = await missing(backendGet('/learning/account'))
    if (!a) return null
    const p = a.plans || {}, c = a.capabilities || {}
    return {
      email: a.email, registered: a.registered !== false, accountType: String(a.accountType || 'registered'),
      plans: { household: p.household === 'couple' || p.household === 'family' ? p.household : null, teacher: p.teacher === true, organisation: p.organisation === true, staff: p.staff === true },
      capabilities: { shareSetlists: c.shareSetlists === true, teachStudents: c.teachStudents === true, runHousehold: c.runHousehold === true, runOrganisation: c.runOrganisation === true },
    }
  }

  // Sharing a SetList with someone else: they receive their own copy, never a live view of yours.
  async function shares() {
    const r = await backendGet('/learning/setlists/shares')
    return { incoming: Array.isArray(r.incoming) ? r.incoming : [], outgoing: Array.isArray(r.outgoing) ? r.outgoing : [] }
  }
  const shareSetlist = async (id, email) => backendCall('POST', `/learning/setlists/${need(id, 'SetList')}/shares`, { email })
  const acceptShare = async id => backendCall('POST', `/learning/setlists/shares/${need(id, 'share')}/accept`)
  const revokeShare = async id => backendCall('POST', `/learning/setlists/shares/${need(id, 'share')}/revoke`)

  // Teachers and classes. The teacher is a fenced tutors row on AlongSide; students are listed by email address (a child's
  // by the parent or guardian's), and a class code opens nothing for any other address.
  const teach = (method, path, body) => backendCall(method, `/learning/teacher${path}`, body)
  const teacherMe = () => missing(backendGet('/learning/teacher/me'))
  const teacherPolicies = async () => (await missing(backendGet('/learning/teacher/policies')))?.policies || null
  const teacherOnboard = fullName => teach('POST', '/onboard', { fullName, agreements: { terms: true, privacy: true } })
  const classes = async () => (await backendGet('/learning/teacher/classes')).classes || []
  const classDetail = async id => backendGet(`/learning/teacher/classes/${need(id, 'class')}`)
  const createClass = name => teach('POST', '/classes', { name })
  const addSeats = async (id, students) => teach('POST', `/classes/${need(id, 'class')}/students`, { students })
  const withdrawSeat = async (classId, seatId) => teach('DELETE', `/classes/${need(classId, 'class')}/students/${need(seatId, 'seat')}`)
  const archiveClass = async id => teach('DELETE', `/classes/${need(id, 'class')}`)
  // A learner joins a class with its code; it works only for an address the teacher listed.
  const joinClass = code => backendCall('POST', '/learning/class-code', { code })

  return { requestCode, verifyCode, acceptLink, accessToken, user, signOut, setlists, setlistWords, profileLink, household, householdAction, summary, shares, shareSetlist, acceptShare, revokeShare, teacherMe, teacherPolicies, teacherOnboard, classes, classDetail, createClass, addSeats, withdrawSeat, archiveClass, joinClass, hasSession: () => Boolean(read()?.access_token) }
}
