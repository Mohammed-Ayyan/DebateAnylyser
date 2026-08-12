import type {
  CredibilityLookupRequest,
  CredibilityProvider,
  CredibilityProviderOutput,
} from "./contracts"
import { credibilityLookupRequestSchema, validateCredibilityProviderOutput } from "./validation"

export type HttpCredibilityProviderOptions = {
  endpoint: string
  timeoutMs: number
  headers?: Readonly<Record<string, string>>
  fetchImpl?: typeof fetch
}

export class CredibilityProviderError extends Error {
  readonly code: string
  readonly retryable: boolean

  constructor(code: string, message: string, retryable: boolean, cause?: unknown) {
    super(message, { cause })
    this.name = "CredibilityProviderError"
    this.code = code
    this.retryable = retryable
  }
}

function validateEndpoint(value: string): string {
  try {
    const endpoint = new URL(value)
    if (
      endpoint.protocol !== "https:" ||
      endpoint.username !== "" ||
      endpoint.password !== "" ||
      endpoint.hash !== ""
    ) {
      throw new Error("Endpoint must be an HTTPS URL without credentials or a fragment.")
    }
    return endpoint.toString()
  } catch (error) {
    throw new CredibilityProviderError(
      "CREDIBILITY_PROVIDER_ENDPOINT_UNSAFE",
      "Credibility provider endpoint must be a configured HTTPS URL.",
      false,
      error,
    )
  }
}

function responseError(status: number): CredibilityProviderError {
  if (status === 401 || status === 403) {
    return new CredibilityProviderError(
      "CREDIBILITY_PROVIDER_AUTHENTICATION_FAILED",
      "Credibility provider authentication failed.",
      false,
    )
  }
  if (status === 400 || status === 404 || status === 422) {
    return new CredibilityProviderError(
      "CREDIBILITY_PROVIDER_REQUEST_REJECTED",
      "Credibility provider rejected the request.",
      false,
    )
  }
  return new CredibilityProviderError(
    "CREDIBILITY_PROVIDER_UNAVAILABLE",
    "Credibility provider is temporarily unavailable.",
    status === 408 || status === 409 || status === 429 || status >= 500,
  )
}

export class HttpCredibilityProvider implements CredibilityProvider {
  private readonly endpoint: string

  constructor(private readonly options: HttpCredibilityProviderOptions) {
    this.endpoint = validateEndpoint(options.endpoint)
    if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs <= 0) {
      throw new CredibilityProviderError(
        "CREDIBILITY_PROVIDER_CONFIG_INVALID",
        "Credibility provider timeout must be a positive integer.",
        false,
      )
    }
  }

  async assess(
    request: CredibilityLookupRequest,
    signal?: AbortSignal,
  ): Promise<CredibilityProviderOutput> {
    const parsedRequest = credibilityLookupRequestSchema.safeParse(request)
    if (!parsedRequest.success) {
      throw new CredibilityProviderError(
        "CREDIBILITY_REQUEST_INVALID",
        "Credibility lookup requires a valid HTTPS source URL.",
        false,
        parsedRequest.error,
      )
    }

    const controller = new AbortController()
    let timedOut = false
    const abort = () => controller.abort(signal?.reason)
    signal?.addEventListener("abort", abort, { once: true })
    const timeout = setTimeout(() => {
      timedOut = true
      controller.abort(new Error("Credibility provider timed out"))
    }, this.options.timeoutMs)

    try {
      const response = await (this.options.fetchImpl ?? fetch)(this.endpoint, {
        method: "POST",
        headers: { ...this.options.headers, "content-type": "application/json" },
        body: JSON.stringify(parsedRequest.data),
        redirect: "error",
        signal: controller.signal,
      })
      if (!response.ok) throw responseError(response.status)

      let body: unknown
      try {
        body = await response.json()
      } catch (error) {
        throw new CredibilityProviderError(
          "CREDIBILITY_PROVIDER_INVALID_JSON",
          "Credibility provider returned invalid JSON.",
          true,
          error,
        )
      }

      try {
        return validateCredibilityProviderOutput(body)
      } catch (error) {
        throw new CredibilityProviderError(
          "CREDIBILITY_PROVIDER_INVALID_RESPONSE",
          "Credibility provider returned invalid credibility data.",
          true,
          error,
        )
      }
    } catch (error) {
      if (error instanceof CredibilityProviderError) throw error
      if (controller.signal.aborted) {
        throw new CredibilityProviderError(
          timedOut ? "CREDIBILITY_PROVIDER_TIMEOUT" : "CREDIBILITY_PROVIDER_ABORTED",
          timedOut ? "Credibility provider timed out." : "Credibility lookup was interrupted.",
          true,
          error,
        )
      }
      throw new CredibilityProviderError(
        "CREDIBILITY_PROVIDER_NETWORK_ERROR",
        "Credibility provider could not be reached.",
        true,
        error,
      )
    } finally {
      clearTimeout(timeout)
      signal?.removeEventListener("abort", abort)
    }
  }
}
