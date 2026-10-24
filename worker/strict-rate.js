const encoder = new TextEncoder()
const limits = Object.freeze({
  verify_ip: 600,
  verify_email: 10,
  refresh_ip: 600,
  refresh_session: 10,
  logout_session: 5,
})

export const rateLimits = limits

async function actorDigest(env, kind, actor) {
  if (!/^[0-9a-f]{64}$/.test(env.SESSION_KEY || '')) throw new Error('rate key unavailable')
  if (!limits[kind] || !actor || actor.length > 254) throw new Error('invalid rate actor')
  const bytes = Uint8Array.from(env.SESSION_KEY.match(/../g), x => parseInt(x, 16))
  const key = await crypto.subtle.importKey('raw', bytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(`hub-rate-v1:${kind}:${actor}`)))
  return Array.from(signature, b => b.toString(16).padStart(2, '0')).join('')
}

export async function checkRate(env, kind, actor) {
  if (!env.SESSION_RATE_BUCKET || typeof env.SESSION_RATE_BUCKET.getByName !== 'function') throw new Error('rate bucket unavailable')
  const digest = await actorDigest(env, kind, actor)
  const bucket = env.SESSION_RATE_BUCKET.getByName(`hub-rate-v1-${parseInt(digest.slice(0, 2), 16) % 32}`)
  let result
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      result = await bucket.consume(kind, digest)
      break
    } catch (error) {
      if (attempt === 2) throw error
      await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1) + Math.floor(Math.random() * 50)))
    }
  }
  if (!result || typeof result.allowed !== 'boolean' || !Number.isInteger(result.retryAfter)) throw new Error('invalid rate response')
  return result
}
