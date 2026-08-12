export const runtimeRoles = ["web", "analysis-worker", "m10-worker", "migration"] as const

export type RuntimeRole = (typeof runtimeRoles)[number]
export type RuntimeEnvironment = Record<string, string | undefined>
export type RuntimeValidationIssue = { field: string; reason: string }
export type ProviderStatus = {
  provider: string
  status: "disabled" | "configured" | "not_configured"
}

const roleRequirements: Record<RuntimeRole, string[]> = {
  web: [
    "APP_ENV",
    "APP_ORIGIN",
    "DATABASE_URL",
    "REDIS_URL",
    "AUTH_ISSUER",
    "AUTH_AUDIENCE",
    "AUTH_JWKS_URL",
    "AUTH_CLIENT_ID",
    "AUTH_CLIENT_SECRET",
    "SESSION_SECRET",
  ],
  "analysis-worker": ["DATABASE_URL"],
  "m10-worker": ["DATABASE_URL"],
  migration: ["DATABASE_URL"],
}

const shippedPlaceholderValues: Partial<Record<string, string>> = {
  AUTH_ISSUER: "https://identity.example.com/",
  AUTH_JWKS_URL: "https://identity.example.com/.well-known/jwks.json",
  AUTH_CLIENT_ID: "replace-with-development-oidc-client-id",
  AUTH_CLIENT_SECRET: "replace-with-development-oidc-client-secret",
  SESSION_SECRET: "replace-with-a-random-secret-at-least-32-characters",
}

const urlFields = new Set([
  "APP_ORIGIN",
  "DATABASE_URL",
  "REDIS_URL",
  "AUTH_ISSUER",
  "AUTH_JWKS_URL",
  "OPENAI_RESPONSES_URL",
  "EVIDENCE_RETRIEVER_URL",
  "CREDIBILITY_PROVIDER_URL",
  "LIMITATIONS_URL",
])

function isEnabled(env: RuntimeEnvironment, key: string): boolean {
  return env[key] === "true"
}

function hasValue(env: RuntimeEnvironment, key: string): boolean {
  return Boolean(env[key]?.trim())
}

function addRequired(
  issues: RuntimeValidationIssue[],
  env: RuntimeEnvironment,
  fields: string[],
): void {
  for (const field of fields) {
    if (!hasValue(env, field)) issues.push({ field, reason: "required" })
  }
}

type ProviderSpec = {
  provider: string
  flag?: string
  requirements: string[]
}

const providerSpecs: ProviderSpec[] = [
  { provider: "deepgram_asr", requirements: ["DEEPGRAM_API_KEY"] },
  {
    provider: "claim_extraction",
    flag: "CLAIM_EXTRACTION_ENABLED",
    requirements: ["GROQ_API_KEY"],
  },
  {
    provider: "support_assessment",
    flag: "SUPPORT_ASSESSMENT_ENABLED",
    requirements: ["GROQ_API_KEY"],
  },
  {
    provider: "argument_structure",
    flag: "ARGUMENT_STRUCTURE_ENABLED",
    requirements: ["GROQ_API_KEY"],
  },
  {
    provider: "fallacy_detection",
    flag: "FALLACY_DETECTION_ENABLED",
    requirements: ["GROQ_API_KEY"],
  },
  {
    provider: "evidence_retrieval",
    flag: "EVIDENCE_RETRIEVAL_ENABLED",
    requirements: ["EVIDENCE_RETRIEVER_URL", "EVIDENCE_RETRIEVER_API_KEY", "OPENAI_API_KEY"],
  },
  {
    provider: "source_credibility",
    flag: "SOURCE_CREDIBILITY_ENABLED",
    requirements: ["CREDIBILITY_PROVIDER_URL", "CREDIBILITY_PROVIDER_API_KEY"],
  },
]

export function describeFeatureProviders(env: RuntimeEnvironment): ProviderStatus[] {
  return providerSpecs.map((provider) => {
    const enabled = provider.flag ? isEnabled(env, provider.flag) : true
    if (!enabled) return { provider: provider.provider, status: "disabled" }
    const configured = provider.requirements.every((key) => hasValue(env, key))
    return { provider: provider.provider, status: configured ? "configured" : "not_configured" }
  })
}

function addFeatureRequirements(issues: RuntimeValidationIssue[], env: RuntimeEnvironment): void {
  const isolatedDevelopmentTest =
    env.APP_ENV === "dev" && isEnabled(env, "LEGAL_DEVELOPMENT_TEST_MODE")
  for (const provider of providerSpecs) {
    if (provider.provider === "deepgram_asr" && isolatedDevelopmentTest) continue
    if (!provider.flag || isEnabled(env, provider.flag)) {
      addRequired(issues, env, provider.requirements)
    }
  }
}

function addLegalRequirements(issues: RuntimeValidationIssue[], env: RuntimeEnvironment): void {
  const developmentTestMode = isEnabled(env, "LEGAL_DEVELOPMENT_TEST_MODE")
  if (developmentTestMode && env.APP_ENV !== "dev") {
    issues.push({
      field: "LEGAL_DEVELOPMENT_TEST_MODE",
      reason: "is permitted only when APP_ENV is dev",
    })
  }
  if (!isEnabled(env, "LEGAL_ALLOW_UPLOADS") && !isEnabled(env, "LEGAL_ALLOW_PASTE")) return
  addRequired(issues, env, ["LEGAL_POLICY_VERSION"])
  if (
    !isEnabled(env, "LEGAL_COUNSEL_APPROVED") &&
    !(developmentTestMode && env.APP_ENV === "dev")
  ) {
    issues.push({
      field: "LEGAL_COUNSEL_APPROVED,LEGAL_DEVELOPMENT_TEST_MODE",
      reason: "ingest requires counsel approval or isolated dev test mode",
    })
  }
}

function addPublicationRequirements(
  issues: RuntimeValidationIssue[],
  env: RuntimeEnvironment,
): void {
  const enabled = ["PUBLIC_SHARING_ENABLED", "REPORT_EXPORT_ENABLED"].some((key) =>
    isEnabled(env, key),
  )
  if (!enabled) return
  addRequired(issues, env, ["PUBLICATION_POLICY_VERSION", "DISCLAIMER_VERSION", "LIMITATIONS_URL"])
  if (!isEnabled(env, "PUBLICATION_COUNSEL_APPROVED")) {
    issues.push({
      field: "PUBLICATION_COUNSEL_APPROVED",
      reason: "must be true when publication is enabled",
    })
  }
}

function needsStorage(role: RuntimeRole, env: RuntimeEnvironment): boolean {
  const upload = isEnabled(env, "LEGAL_ALLOW_UPLOADS")
  const exportsEnabled =
    isEnabled(env, "REPORT_EXPORT_ENABLED") || isEnabled(env, "ACCOUNT_DATA_EXPORT_ENABLED")
  if (role === "web") return upload || exportsEnabled
  if (role === "analysis-worker") return upload
  if (role === "m10-worker") return exportsEnabled
  return false
}

export function validateRuntimeRole(
  role: RuntimeRole,
  env: RuntimeEnvironment,
): { ok: boolean; issues: RuntimeValidationIssue[] } {
  const issues: RuntimeValidationIssue[] = []
  addRequired(issues, env, roleRequirements[role])
  if (role === "web") {
    if (hasValue(env, "APP_ENV") && !["dev", "staging", "prod"].includes(env.APP_ENV!)) {
      issues.push({ field: "APP_ENV", reason: "must be dev, staging, or prod" })
    }
    for (const [field, placeholder] of Object.entries(shippedPlaceholderValues)) {
      if (env[field] === placeholder)
        issues.push({ field, reason: "must not use shipped placeholder" })
    }
  }

  if (hasValue(env, "SESSION_SECRET") && (env.SESSION_SECRET?.length ?? 0) < 32) {
    issues.push({ field: "SESSION_SECRET", reason: "must contain at least 32 characters" })
  }
  for (const field of urlFields) {
    if (!hasValue(env, field)) continue
    try {
      const value = new URL(env[field]!)
      if (field === "DATABASE_URL" && !["postgres:", "postgresql:"].includes(value.protocol)) {
        throw new Error("invalid database scheme")
      }
      if (field === "REDIS_URL" && !["redis:", "rediss:"].includes(value.protocol)) {
        throw new Error("invalid redis scheme")
      }
    } catch {
      issues.push({ field, reason: "must be a valid URL" })
    }
  }

  const storageAccessKey = hasValue(env, "OBJECT_STORAGE_ACCESS_KEY_ID")
  const storageSecret = hasValue(env, "OBJECT_STORAGE_SECRET_ACCESS_KEY")
  if (storageAccessKey !== storageSecret) {
    issues.push({
      field: "OBJECT_STORAGE_ACCESS_KEY_ID,OBJECT_STORAGE_SECRET_ACCESS_KEY",
      reason: "must be configured together",
    })
  }
  if (env.PDF_EXPORT_ENABLED && env.PDF_EXPORT_ENABLED !== "false") {
    issues.push({ field: "PDF_EXPORT_ENABLED", reason: "PDF export is intentionally disabled" })
  }

  if (role === "analysis-worker") addFeatureRequirements(issues, env)
  if (role === "web") addLegalRequirements(issues, env)
  if (role === "web" || role === "m10-worker") addPublicationRequirements(issues, env)
  if (needsStorage(role, env)) addRequired(issues, env, ["OBJECT_STORAGE_BUCKET"])

  const unique = new Map(issues.map((issue) => [`${issue.field}:${issue.reason}`, issue]))
  const deduplicated = [...unique.values()]
  return { ok: deduplicated.length === 0, issues: deduplicated }
}

export function assertRuntimeRole(role: RuntimeRole, env: RuntimeEnvironment): void {
  const result = validateRuntimeRole(role, env)
  if (result.ok) return
  const fields = [...new Set(result.issues.map((issue) => issue.field))].join(", ")
  throw new Error(`Invalid ${role} runtime configuration: ${fields}`)
}

export function isRuntimeRole(value: string | undefined): value is RuntimeRole {
  return runtimeRoles.some((role) => role === value)
}
