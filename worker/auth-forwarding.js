// Optional server-only Supabase Auth IP forwarding. Never call Data API or an address
// supplied by the browser with the secret key. This module must stay Worker-only.
const IDENTITY_ORIGIN = 'https://mznljakkdafbqmapqncd.supabase.co'

function visitorIp(request) {
  const ip = request.headers.get('cf-connecting-ip') || ''
  if (ip.length < 3 || ip.length > 45 || !/^[0-9a-fA-F:.]+$/.test(ip)) throw new Error('visitor IP unavailable')
  if (ip.includes(':')) {
    // URL parsing checks the IPv6 syntax, including IPv4-mapped IPv6 addresses.
    new URL(`http://[${ip}]/`)
  } else {
    const parts = ip.split('.')
    if (parts.length !== 4 || parts.some(part => !/^\d{1,3}$/.test(part) || Number(part) > 255 || (part.length > 1 && part[0] === '0'))) throw new Error('invalid visitor IP')
  }
  return ip
}

export function authHeaders(request, env, auth, accessToken = null) {
  const headers = { apikey: auth.publishableKey }
  if (env.AUTH_IP_FORWARDING === '1') {
    if (auth.supabaseUrl !== IDENTITY_ORIGIN || !/^sb_secret_[A-Za-z0-9_-]+$/.test(env.AUTH_SECRET_KEY || '')) throw new Error('Auth forwarding unavailable')
    headers.apikey = env.AUTH_SECRET_KEY
    headers['sb-forwarded-for'] = visitorIp(request)
  }
  if (accessToken) headers.authorization = `Bearer ${accessToken}`
  return headers
}
