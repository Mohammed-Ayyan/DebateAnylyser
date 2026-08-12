export type ConsumeResult = {
  allowed: boolean
  remaining: number
  retryAfterSeconds: number
}

export type StreamLease = {
  token: string
  renew(): Promise<boolean>
  release(): Promise<void>
}

export interface RateLimitBackend {
  consume(key: string, limit: number, windowSeconds: number): Promise<ConsumeResult>
  acquireLease(key: string, limit: number, leaseSeconds: number): Promise<StreamLease | null>
}
