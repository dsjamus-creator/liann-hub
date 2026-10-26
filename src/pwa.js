// Installing the hub. It is a website, so "installing" means asking the browser to add it to the device: Chrome and
// Edge show an Install button, Android adds it to the home screen, and iPhone and iPad use Share, Add to Home Screen.
// The installed app is the live site in its own window, so a deploy reaches everyone at once; nothing is copied.

// What the Downloads page should offer on this device. 'installed' means the hub is already running as an app (the
// browser's installed window, or the Windows and Mac app), so nothing is shown.
export function installMode({ ua = '', standalone = false, touchPoints = 0, canPrompt = false } = {}) {
  if (standalone || /Electron\//.test(ua)) return 'installed'
  if (canPrompt) return 'prompt'
  if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && touchPoints > 1)) return 'ios'
  return 'browser'
}

let deferred = null
const listeners = new Set()
const notify = () => listeners.forEach(fn => { try { fn() } catch { /* a listener failing never blocks the others */ } })

export function currentMode(win = globalThis) {
  const nav = win.navigator || {}
  const standalone = !!(win.matchMedia?.('(display-mode: standalone)').matches || nav.standalone)
  return installMode({ ua: nav.userAgent || '', standalone, touchPoints: nav.maxTouchPoints || 0, canPrompt: !!deferred })
}

export function onInstallChange(fn) { listeners.add(fn); return () => listeners.delete(fn) }

export async function promptInstall() {
  if (!deferred) return 'unavailable'
  const event = deferred
  deferred = null
  event.prompt()
  let outcome = 'dismissed'
  try { outcome = (await event.userChoice).outcome } catch { /* the browser closed the prompt */ }
  notify()
  return outcome
}

export function registerServiceWorker(nav = globalThis.navigator) {
  if (!nav || !('serviceWorker' in nav)) return Promise.resolve(null)
  return nav.serviceWorker.register('/sw.js').catch(() => null)
}

export function initInstall(win = globalThis) {
  win.addEventListener?.('beforeinstallprompt', event => { event.preventDefault(); deferred = event; notify() })
  win.addEventListener?.('appinstalled', () => { deferred = null; notify() })
  registerServiceWorker(win.navigator)
}
