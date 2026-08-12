import "server-only"

import Redis from "ioredis"

import { requireServerEnv } from "@/lib/env/server"

const globalRedis = globalThis as typeof globalThis & {
  __debateRedis?: Redis
}

export function getRedis(): Redis {
  if (!globalRedis.__debateRedis) {
    const { REDIS_URL } = requireServerEnv("REDIS_URL")
    globalRedis.__debateRedis = new Redis(REDIS_URL, {
      enableReadyCheck: true,
      lazyConnect: true,
      maxRetriesPerRequest: 2,
    })
  }
  return globalRedis.__debateRedis
}

export function createRedisSubscriber(): Redis {
  const { REDIS_URL } = requireServerEnv("REDIS_URL")
  return new Redis(REDIS_URL, {
    enableReadyCheck: true,
    lazyConnect: true,
    maxRetriesPerRequest: null,
  })
}
