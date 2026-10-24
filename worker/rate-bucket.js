import { DurableObject } from 'cloudflare:workers'
import { rateLimits } from './strict-rate.js'

const WINDOW_MS = 60_000

export class SessionRateBucket extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env)
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS counters (actor TEXT PRIMARY KEY, started INTEGER NOT NULL, hits INTEGER NOT NULL)')
    this.lastCleanup = 0
  }

  consume(kind, actor) {
    const limit = rateLimits[kind]
    if (!limit || !/^[0-9a-f]{64}$/.test(actor || '')) throw new Error('invalid rate key')
    return this.ctx.storage.transactionSync(() => {
      const now = Date.now()
      if (now - this.lastCleanup >= WINDOW_MS) {
        this.ctx.storage.sql.exec('DELETE FROM counters WHERE started < ?', now - WINDOW_MS)
        this.lastCleanup = now
      }
      const row = this.ctx.storage.sql.exec('SELECT started, hits FROM counters WHERE actor = ?', actor).toArray()[0] || null
      if (!row || now - row.started >= WINDOW_MS) {
        this.ctx.storage.sql.exec('INSERT INTO counters (actor, started, hits) VALUES (?, ?, 1) ON CONFLICT(actor) DO UPDATE SET started = excluded.started, hits = 1', actor, now)
        return { allowed: true, retryAfter: 0 }
      }
      if (row.hits >= limit) return { allowed: false, retryAfter: Math.max(1, Math.ceil((row.started + WINDOW_MS - now) / 1000)) }
      this.ctx.storage.sql.exec('UPDATE counters SET hits = hits + 1 WHERE actor = ?', actor)
      return { allowed: true, retryAfter: 0 }
    })
  }
}
