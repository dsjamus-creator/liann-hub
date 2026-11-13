import { config } from './config.js'

export const ADMIN_SECTIONS = [
  ['overview', 'Overview', 'apps'], ['tutors', 'Tutors', 'figures'], ['students', 'Students', 'read'],
  ['compliance', 'Safeguarding', 'shield'], ['finance', 'Finance', 'plan'], ['comms', 'Communications', 'bell'],
  ['calendar', 'Calendar', 'calendar'], ['waitlist', 'Waitlist', 'library'], ['campaign', 'Campaign', 'send'],
  ['inbox', 'Inbox', 'mail'], ['reports', 'Reports', 'downloads'], ['staff', 'Staff', 'settings'],
]
export const adminSection = value => ADMIN_SECTIONS.some(([id]) => id === value) ? value : 'overview'

// Accept requests only from this exact backend frame. The frame never receives
// the token; the hub refreshes it as needed for each request through account.js.
export function bindAdminBridge({ account, state, onDenied }) {
  const backendOrigin = new URL(config.backend).origin
  const navigate = () => {
    const s = state(), frame = document.querySelector('#admin-frame')
    if (frame && s.admin?.superAdmin && !s.learner)
      frame.contentWindow.postMessage({ type: 'liann-admin:navigate', section: adminSection(s.adminSection), theme: s.theme }, backendOrigin)
  }
  window.addEventListener('message', async event => {
    const frame = document.querySelector('#admin-frame'), s = state()
    if (!frame || event.source !== frame.contentWindow || event.origin !== backendOrigin || !s.admin?.superAdmin || s.learner) return
    const data = event.data
    if (data?.type === 'liann-admin:ready') return navigate()
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
