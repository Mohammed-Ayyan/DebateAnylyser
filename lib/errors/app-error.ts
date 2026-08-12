export type AppErrorOptions = {
  code: string
  status: number
  message: string
  expose?: boolean
  retryable?: boolean
  cause?: unknown
  details?: Record<string, unknown>
  publicDetails?: Record<string, unknown>
}

export type PublicError = {
  error: {
    code: string
    message: string
    retryable: boolean
    correlation_id: string
    details?: Record<string, unknown>
  }
}

export class AppError extends Error {
  readonly code: string
  readonly status: number
  readonly expose: boolean
  readonly retryable: boolean
  readonly details?: Record<string, unknown>
  readonly publicDetails?: Record<string, unknown>

  constructor(options: AppErrorOptions) {
    super(options.message, { cause: options.cause })
    this.name = "AppError"
    this.code = options.code
    this.status = options.status
    this.expose = options.expose ?? false
    this.retryable = options.retryable ?? false
    this.details = options.details
    this.publicDetails = options.publicDetails
  }
}

export function toPublicError(error: unknown, correlationId: string): PublicError {
  const appError = error instanceof AppError ? error : undefined
  return {
    error: {
      code: appError?.expose ? appError.code : "INTERNAL_ERROR",
      message: appError?.expose ? appError.message : "An unexpected error occurred.",
      retryable: appError?.retryable ?? false,
      correlation_id: correlationId,
      ...(appError?.expose && appError.publicDetails ? { details: appError.publicDetails } : {}),
    },
  }
}
