import "server-only"

import { randomUUID } from "node:crypto"

import { getRedis } from "@/lib/cache/redis"
import type { ConsumeResult, RateLimitBackend, StreamLease } from "./backend"

const consumeScript = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
return {count, ttl}`

const acquireScript = `
local now = tonumber(ARGV[1])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)
if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[2]) then return 0 end
redis.call('ZADD', KEYS[1], tonumber(ARGV[3]), ARGV[4])
redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[5]))
return 1`

const renewScript = `
if redis.call('ZSCORE', KEYS[1], ARGV[1]) == false then return 0 end
redis.call('ZADD', KEYS[1], tonumber(ARGV[2]), ARGV[1])
redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[3]))
return 1`

const releaseScript = `return redis.call('ZREM', KEYS[1], ARGV[1])`

export class RedisRateLimitBackend implements RateLimitBackend {
  async consume(key: string, limit: number, windowSeconds: number): Promise<ConsumeResult> {
    const result = (await getRedis().eval(consumeScript, 1, key, windowSeconds * 1000)) as [
      number,
      number,
    ]
    const [count, ttlMs] = result
    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      retryAfterSeconds: Math.max(1, Math.ceil(ttlMs / 1000)),
    }
  }
  async acquireLease(
    key: string,
    limit: number,
    leaseSeconds: number,
  ): Promise<StreamLease | null> {
    const redis = getRedis()
    const token = randomUUID()
    const leaseMs = leaseSeconds * 1000
    const now = Date.now()
    const acquired = await redis.eval(
      acquireScript,
      1,
      key,
      now,
      limit,
      now + leaseMs,
      token,
      leaseMs,
    )
    if (Number(acquired) !== 1) return null

    let released = false
    return {
      token,
      async renew() {
        if (released) return false
        const renewed = await redis.eval(renewScript, 1, key, token, Date.now() + leaseMs, leaseMs)
        return Number(renewed) === 1
      },
      async release() {
        if (released) return
        released = true
        await redis.eval(releaseScript, 1, key, token)
      },
    }
  }
}
