// Email-code sign-in (Supabase, spec D16) and read-only access to the learner's AlongSide SetLists.
// The flow matches public/shared/lwl-account.js in pinyin-tiles-playtest: the Supabase URL and
// publishable key come from the Pinyin API at run time, and the backend is called with a bearer token.
// Tokens stay in this origin's localStorage and are never logged.

const SESSION_KEY = 'liann-hub-session-v1'

export class AccountError extends Error {
  constructor(message, code, status) { super(message); this.code = code; this.status = status }
}

export function createAccount({ pinyinApi, backend, fetchImpl = (...a) => fetch(...a), storage = globalThis.localStorage, now = () => Date.now() }) {
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
    if (!response.ok) throw new AccountError(body.error_description || body.msg || body.error || `HTTP ${response.status}`, body.error_code || body.error || 'http', response.status)
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
    await json(`${s.supabaseUrl}/auth/v1/otp`, {
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

  async function setlists() {
    try {
      const result = await backendGet('/learning/setlists')
      return Array.isArray(result.setlists) ? result.setlists : []
    } catch (error) {
      if (error.code === 'not_a_student') throw new AccountError('Your Library starts when you save your first words in a game.', 'not_a_student', error.status)
      throw error
    }
  }

  async function setlistWords(id) {
    if (!/^[0-9a-f-]{36}$/i.test(String(id))) throw new AccountError('Unknown SetList.', 'bad_id')
    const result = await backendGet(`/learning/setlists/${encodeURIComponent(id)}/words`)
    return { name: result.name, words: Array.isArray(result.words) ? result.words : [] }
  }

  return { requestCode, verifyCode, accessToken, user, signOut, setlists, setlistWords, hasSession: () => Boolean(read()?.access_token) }
}
