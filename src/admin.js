import { config } from './config.js'

export const ADMIN_SECTIONS = [
  ['overview', 'Overview', 'apps'],
  ['inbox', 'Inbox', 'mail'], ['campaign', 'Campaigns', 'send'],
  ['calendar', 'Calendar', 'calendar'], ['recruitment', 'Recruitment', 'figures'],
  ['hsk', 'HSK Content', 'read'], ['tutors', 'Tutors', 'figures'], ['students', 'Students', 'read'],
  ['compliance', 'Safeguarding', 'shield'], ['finance', 'Finance', 'plan'], ['comms', 'Communications', 'bell'],
  ['waitlist', 'Waitlist', 'library'], ['reports', 'Reports', 'downloads'], ['staff', 'Staff', 'settings'],
]
const campaignViews = new Set(['campaign-work', 'tutor-outreach'])
export const adminSection = value => campaignViews.has(value) || ADMIN_SECTIONS.some(([id]) => id === value) ? value : 'overview'
export const adminRailSection = value => campaignViews.has(value) ? 'campaign' : adminSection(value)

// Accept requests only from this exact backend frame. The frame never receives
// the token; the hub refreshes it as needed for each request through account.js.
export function bindAdminBridge({ account, state, onDenied }) {
  const backendOrigin = new URL(config.backend).origin
  let inboxFrame = null
  let inboxState = { open: false, dirty: false, busy: false }
  const currentInboxFrame = () => {
    const s = state(), frame = document.querySelector('#admin-frame')
    return s.page === 'admin' && s.adminSection === 'inbox' && s.admin?.superAdmin && !s.learner ? frame : null
  }
  const warnBeforeLeaving = event => {
    if (currentInboxFrame()?.contentWindow !== inboxFrame || !inboxState.dirty) return
    event.preventDefault()
    event.returnValue = ''
  }
  const rememberInboxState = (source, next) => {
    inboxFrame = source
    inboxState = next
    if (next.dirty) window.addEventListener('beforeunload', warnBeforeLeaving)
    else window.removeEventListener('beforeunload', warnBeforeLeaving)
  }
  const closeInboxForNavigation = frame => {
    if (frame?.contentWindow !== inboxFrame || !inboxState.open) return true
    if (inboxState.busy || (inboxState.dirty && !window.confirm('Close this message and discard unsaved changes?'))) return false
    rememberInboxState(inboxFrame, { open: false, dirty: false, busy: false })
    inboxFrame.postMessage({ type: 'liann-admin:outside-inbox' }, backendOrigin)
    return true
  }
  document.addEventListener('click', event => {
    const frame = currentInboxFrame()
    if (!frame || frame.contentWindow !== inboxFrame || !inboxState.open || frame.contains(event.target)) return
    if (!closeInboxForNavigation(frame)) {
      event.preventDefault()
      event.stopImmediatePropagation()
    }
  }, true)
  const navigate = () => {
    const s = state(), frame = document.querySelector('#admin-frame')
    if (!frame || !s.admin?.superAdmin || s.learner) return
    const section = adminSection(s.adminSection)
    const target = section === 'campaign-work' ? 'outreach' : section === 'tutor-outreach' ? 'campaign' : section
    const record = location.hash.split('/')[2]
    frame.contentWindow.postMessage({ type: 'liann-admin:navigate', section: target, theme: s.theme, record }, backendOrigin)
  }
  window.addEventListener('message', async event => {
    const frame = document.querySelector('#admin-frame'), s = state()
    if (!frame || event.source !== frame.contentWindow || event.origin !== backendOrigin || !s.admin?.superAdmin || s.learner) return
    const data = event.data
    if (data?.type === 'liann-admin:ready') {
      rememberInboxState(event.source, { open: false, dirty: false, busy: false })
      return navigate()
    }
    if (data?.type === 'liann-admin:inbox-state') {
      if (typeof data.open === 'boolean' && typeof data.dirty === 'boolean' && typeof data.busy === 'boolean') {
        rememberInboxState(event.source, { open: data.open, dirty: data.dirty, busy: data.busy })
      }
      return
    }
    if (data?.type === 'liann-admin:open-record') {
      if (typeof data.hash === 'string' && /^#admin\/(?:inbox|campaign-work|campaign|recruitment|finance|tutor-outreach)(?:\/[0-9a-f-]{36})?$/i.test(data.hash) && closeInboxForNavigation(currentInboxFrame())) {
        location.hash = data.hash
      }
      return
    }
    if (data?.type !== 'liann-admin:request' || !Number.isSafeInteger(data.id)) return
    const source = event.source, user = s.user, admin = s.admin
    try {
      const result = await account.adminRequest(data.path, data.method, data.body)
      if (state().user !== user || state().admin !== admin) return
      source.postMessage({ type: 'liann-admin:response', id: data.id, ...result }, backendOrigin)
      if ([401, 403].includes(result.status) && (data.path === '/me' || data.path === '/admin/whoami' || result.body?.error === 'super_admin_only' || result.body?.error === 'not_authorised' || result.status === 401)) onDenied()
    } catch (error) {
      if (state().user !== user || state().admin !== admin) return
      source.postMessage({ type: 'liann-admin:response', id: data.id, error: error.message }, backendOrigin)
      if (error.code === 'signed_out') onDenied()
    }
  })
  return navigate
}
