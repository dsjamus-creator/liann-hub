// Email-code sign-in (Supabase, spec D16) and access to the learner's AlongSide SetLists.
// The Worker stores the rotating refresh token in an HttpOnly cookie. Page JavaScript keeps
// only the short-lived access token in memory for the backend and protected comic requests.

const LEGACY_SESSION_KEY = 'liann-hub-session-v1'

export class AccountError extends Error {
  constructor(message, code, status) { super(message); this.code = code; this.status = status }
}

export function createAccount({ pinyinApi, backend, fetchImpl = (...a) => fetch(...a), storage = globalThis.localStorage, now = () => Date.now(), origin = globalThis.location?.origin }) {
  let authConfig = null
  let access = null, refreshing = null, generation = 0, sessionId = null
  // Old sessions are deliberately not migrated through page JavaScript. The next sign-in uses a fresh code.
  try { storage.removeItem(LEGACY_SESSION_KEY) } catch { /* storage blocked */ }
  const clear = () => { generation++; access = null; refreshing = null; sessionId = null; try { storage.removeItem(LEGACY_SESSION_KEY) } catch { /* storage blocked */ } }

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
    if (!session?.access_token || !session?.session_id) throw new AccountError('The sign-in response was incomplete.', 'bad_session')
    sessionId = session.session_id
    access = { token: session.access_token, expires_at: Number(session.expires_at) || Math.floor(now() / 1000) + Number(session.expires_in || 3600) }
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
    const started = generation
    let session
    try {
      session = await json(`${origin}/session/verify`, {
        method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, code }),
      })
    } catch (error) {
      if (error.status === 403 || error.status === 400) throw new AccountError('That code is wrong or has expired. Check the latest email, or send a new code.', 'bad_code', error.status)
      throw error
    }
    if (started !== generation) throw new AccountError('Sign-in was cancelled. Please try again.', 'cancelled')
    clear()
    store(session)
    return user()
  }

  // An implicit email link can carry a refresh token in the URL fragment. Never adopt it in page JavaScript;
  // the app removes the fragment immediately and asks for the email code instead.
  function acceptLink(hash) {
    const q = new URLSearchParams(String(hash || '').replace(/^#/, ''))
    if (q.has('access_token') || q.has('refresh_token')) return { ok: false, code: 'use_code', message: 'For your security, enter the code from the email instead of using its sign-in link. Request a new code if this one has been used.' }
    if (q.get('error') || q.get('error_code')) {
      const used = ['otp_expired', 'access_denied'].includes(q.get('error_code') || q.get('error'))
      return { ok: false, code: q.get('error_code') || q.get('error'), message: used ? 'That sign-in link was already used or has expired. Type the code from the email, or send a new code.' : (q.get('error_description') || 'That sign-in link could not be used.').replace(/\+/g, ' ') }
    }
    return null
  }

  async function accessToken() {
    if (access?.expires_at > Math.floor(now() / 1000) + 60) return access.token
    if (refreshing) return refreshing
    const started = generation
    const task = (async () => {
      try {
        const refreshed = await json(`${origin}/session/refresh`, {
          method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', ...(sessionId ? { 'x-session-id': sessionId } : {}) }, body: '{}',
        })
        if (started !== generation) return null
        store(refreshed)
        return access.token
      } catch (error) {
        if (started !== generation) return null
        if (error.status === 401 || error.status === 409) { clear(); return null }
        throw error
      } finally { if (refreshing === task) refreshing = null }
    })()
    refreshing = task
    return task
  }

  async function user() {
    const token = await accessToken()
    if (!token) return null
    const started = generation
    const s = await settings()
    try {
      const u = await json(`${s.supabaseUrl}/auth/v1/user`, { headers: { apikey: s.publishableKey, Authorization: `Bearer ${token}` } })
      if (started !== generation) return null
      if (!u.email) return null
      return { email: u.email.toLowerCase(), confirmed: Boolean(u.email_confirmed_at) }
    } catch (error) {
      if (error.status === 401 || error.status === 403) { clear(); return null }
      throw error
    }
  }

  async function signOut() {
    const previous = access, priorId = sessionId, started = ++generation
    access = null; refreshing = null
    try {
      await json(`${origin}/session/logout`, {
        method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', ...(priorId ? { 'x-session-id': priorId } : {}) }, body: '{}',
      })
    } catch (error) {
      if (started === generation) { access = previous; sessionId = priorId }
      throw error
    }
    clear()
  }

  async function backendGet(path) {
    const token = await accessToken()
    if (!token) throw new AccountError('Sign in to see your Library.', 'signed_out')
    return json(`${backend}${path}`, { headers: { Authorization: `Bearer ${token}` } })
  }

  // Couple and Family plans (One LiANN account C3). A 404 means AlongSide has households switched off.
  async function backendCall(method, path, body) {
    const token = await accessToken()
    if (!token) throw new AccountError('Sign in again to manage your household.', 'signed_out')
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

  return { requestCode, verifyCode, acceptLink, accessToken, user, signOut, forget: clear, setlists, setlistWords, profileLink, household, householdAction, hasSession: () => Boolean(access?.token) }
}
