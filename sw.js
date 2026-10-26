// Learning with LiANN hub service worker. It does one job: when the network is down and someone opens a page, show a
// plain "you're offline" page instead of the browser's error. It never caches the hub's own files, data, comics or
// sign-in calls, and it does not touch any request except a page navigation, so a deploy is always what people see.
const CACHE = 'liann-hub-offline-v1'
const OFFLINE = '/offline.html'

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.add(OFFLINE)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()))
})

self.addEventListener('fetch', event => {
  if (event.request.mode !== 'navigate') return
  event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE).then(r => r || Response.error())))
})
