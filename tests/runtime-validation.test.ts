import { describe, expect, it } from "vitest"

import {
  describeFeatureProviders,
  validateRuntimeRole,
  type RuntimeEnvironment,
} from "@/lib/env/runtime-validation"

const webEnvironment: RuntimeEnvironment = {
  APP_ENV: "prod",
  APP_ORIGIN: "https://debate.example",
  DATABASE_URL: "postgresql://app:secret@db.example/debate",
  REDIS_URL: "redis://cache.example:6379",
  AUTH_ISSUER: "https://identity.example/",
  AUTH_AUDIENCE: "debate-analyser",
  AUTH_JWKS_URL: "https://identity.example/.well-known/jwks.json",
  AUTH_CLIENT_ID: "debate-analyser-web",
  AUTH_CLIENT_SECRET: "test-client-secret",
  SESSION_SECRET: "a-secure-session-secret-with-32-characters",
}

describe("runtime role validation", () => {
  it("accepts a web role while all feature gates remain off", () => {
    const result = validateRuntimeRole("web", webEnvironment)
    expect(result.ok).toBe(true)
    expect(result.issues).toEqual([])
  })

  it("reports only field names for missing web dependencies", () => {
    const result = validateRuntimeRole("web", {})
    expect(result.ok).toBe(false)
    expect(result.issues.map((issue) => issue.field)).toEqual(
      expect.arrayContaining(["APP_ORIGIN", "DATABASE_URL", "REDIS_URL", "SESSION_SECRET"]),
    )
  })

  it("rejects the shipped authentication placeholders", () => {
    const result = validateRuntimeRole("web", {
      ...webEnvironment,
      AUTH_ISSUER: "https://identity.example.com/",
      AUTH_JWKS_URL: "https://identity.example.com/.well-known/jwks.json",
      SESSION_SECRET: "replace-with-a-random-secret-at-least-32-characters",
    })
    expect(result.issues).toEqual(
      expect.arrayContaining([
        { field: "AUTH_ISSUER", reason: "must not use shipped placeholder" },
        { field: "AUTH_JWKS_URL", reason: "must not use shipped placeholder" },
        { field: "SESSION_SECRET", reason: "must not use shipped placeholder" },
      ]),
    )
  })

  it("requires credentials only for enabled analysis providers", () => {
    const disabled = validateRuntimeRole("analysis-worker", {
      DATABASE_URL: webEnvironment.DATABASE_URL,
      DEEPGRAM_API_KEY: "asr-key",
      CLAIM_EXTRACTION_ENABLED: "false",
    })
    expect(disabled.ok).toBe(true)

    const enabled = validateRuntimeRole("analysis-worker", {
      DATABASE_URL: webEnvironment.DATABASE_URL,
      DEEPGRAM_API_KEY: "asr-key",
      CLAIM_EXTRACTION_ENABLED: "true",
    })
    expect(enabled.issues).toContainEqual({ field: "GROQ_API_KEY", reason: "required" })
  })
})

describe("conditional operational requirements", () => {
  it("requires publication approval, metadata, and storage for enabled report export", () => {
    const result = validateRuntimeRole("m10-worker", {
      DATABASE_URL: webEnvironment.DATABASE_URL,
      REPORT_EXPORT_ENABLED: "true",
    })
    expect(result.issues.map((issue) => issue.field)).toEqual(
      expect.arrayContaining([
        "PUBLICATION_COUNSEL_APPROVED",
        "PUBLICATION_POLICY_VERSION",
        "DISCLAIMER_VERSION",
        "LIMITATIONS_URL",
        "OBJECT_STORAGE_BUCKET",
      ]),
    )
  })

  it("gates account data export independently from publication counsel", () => {
    const result = validateRuntimeRole("m10-worker", {
      DATABASE_URL: webEnvironment.DATABASE_URL,
      ACCOUNT_DATA_EXPORT_ENABLED: "true",
      OBJECT_STORAGE_BUCKET: "private-account-exports",
    })
    expect(result).toEqual({ ok: true, issues: [] })
  })

  it("accepts the migration role with only a PostgreSQL application URL", () => {
    expect(validateRuntimeRole("migration", { DATABASE_URL: webEnvironment.DATABASE_URL })).toEqual(
      { ok: true, issues: [] },
    )
  })

  it("keeps PDF export explicitly disabled", () => {
    const result = validateRuntimeRole("web", {
      ...webEnvironment,
      PDF_EXPORT_ENABLED: "true",
    })
    expect(result.issues).toContainEqual({
      field: "PDF_EXPORT_ENABLED",
      reason: "PDF export is intentionally disabled",
    })
  })

  it("distinguishes disabled providers from enabled but unconfigured providers", () => {
    const statuses = describeFeatureProviders({
      DEEPGRAM_API_KEY: "asr-key",
      CLAIM_EXTRACTION_ENABLED: "false",
      EVIDENCE_RETRIEVAL_ENABLED: "true",
    })
    expect(statuses).toContainEqual({ provider: "claim_extraction", status: "disabled" })
    expect(statuses).toContainEqual({ provider: "evidence_retrieval", status: "not_configured" })
    expect(statuses).toContainEqual({ provider: "deepgram_asr", status: "configured" })
  })

  it("never includes secret values in validation results", () => {
    const secret = "do-not-disclose-this-value"
    const result = validateRuntimeRole("analysis-worker", {
      DATABASE_URL: "not-a-database-url",
      DEEPGRAM_API_KEY: secret,
    })
    expect(JSON.stringify(result)).not.toContain(secret)
  })
})
