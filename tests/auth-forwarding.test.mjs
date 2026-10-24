import test from 'node:test'
import assert from 'node:assert/strict'
import { authHeaders } from '../worker/auth-forwarding.js'
import worker from '../worker/index.js'

const auth = { supabaseUrl: 'https://mznljakkdafbqmapqncd.supabase.co', publishableKey: 'sb_publishable_test' }
const key = 'sb_secret_' + 'a'.repeat(32)
const request = ip => new Request('https://app.lwliann.com/session/verify', { headers: { 'cf-connecting-ip': ip } })

test('publishable mode never forwards a client-controlled IP', () => {
  assert.deepEqual(authHeaders(request('192.0.2.15'), {}, auth), { apikey: 'sb_publishable_test' })
})

test('opted-in Worker mode forwards only a validated Cloudflare visitor IP to the pinned Auth origin', () => {
  const env = { AUTH_IP_FORWARDING: '1', AUTH_SECRET_KEY: key }
  assert.deepEqual(authHeaders(request('192.0.2.15'), env, auth), { apikey: key, 'sb-forwarded-for': '192.0.2.15' })
  assert.deepEqual(authHeaders(request('2001:db8::1'), env, auth, 'user.jwt.token'), { apikey: key, 'sb-forwarded-for': '2001:db8::1', authorization: 'Bearer user.jwt.token' })
  assert.throws(() => authHeaders(request('192.0.2.15'), env, { ...auth, supabaseUrl: 'https://other.supabase.co' }))
  assert.throws(() => authHeaders(request('192.0.2.15'), { AUTH_IP_FORWARDING: '1' }, auth))
  for (const ip of ['192.0.2.999', '192.0.2.01', 'evil.example', '192.0.2.1, 198.51.100.1', '2001:db8:::1', '']) assert.throws(() => authHeaders(request(ip), env, auth), ip)
})

test('the Worker sends the secret key and forwarded IP only to the pinned verification endpoint', async () => {
  const seen = []
  const fetchImpl = async (url, init) => {
    seen.push({ url, headers: init?.headers })
    if (url === 'https://api.test/v1/auth/config') return Response.json({ authentication: { enabled: true, ...auth } })
    if (url === `${auth.supabaseUrl}/auth/v1/verify`) return Response.json({ access_token: 'access', refresh_token: 'refresh-one', expires_in: 3600 })
    throw new Error('unexpected upstream')
  }
  const request = new Request('https://app.lwliann.com/session/verify', { method: 'POST', headers: {
    origin: 'https://app.lwliann.com', 'sec-fetch-site': 'same-origin', 'cf-connecting-ip': '192.0.2.15', 'content-type': 'application/json',
  }, body: JSON.stringify({ email: 'ann@example.com', code: '246810' }) })
  const response = await worker.fetch(request, { PINYIN_API: 'https://api.test', AUTH_IP_FORWARDING: '1', AUTH_SECRET_KEY: key, SESSION_KEY: 'a'.repeat(64), SESSION_RATE_BUCKET: { getByName: () => ({ consume: async () => ({ allowed: true, retryAfter: 0 }) }) } }, {}, { fetchImpl })
  assert.equal(response.status, 200)
  assert.equal(seen.length, 2)
  assert.deepEqual(seen[1].headers, { apikey: key, 'sb-forwarded-for': '192.0.2.15', 'content-type': 'application/json' })
  assert.equal(JSON.stringify(await response.json()).includes(key), false)
})
