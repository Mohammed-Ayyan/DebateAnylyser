import "server-only"

import { z } from "zod"

const optionalVersion = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).max(64).optional(),
)
const optionalUrl = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().url().optional(),
)

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ENV: z.enum(["dev", "staging", "prod"]).default("prod"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  APP_ORIGIN: z.string().url().optional(),
  DATABASE_URL: z.string().url().optional(),
  REDIS_URL: z.string().url().optional(),
  AUTH_ISSUER: z.string().url().optional(),
  AUTH_AUDIENCE: z.string().min(1).optional(),
  AUTH_JWKS_URL: z.string().url().optional(),
  AUTH_CLIENT_ID: z.string().min(1).optional(),
  AUTH_CLIENT_SECRET: z.string().min(1).optional(),
  SESSION_SECRET: z.string().min(32).optional(),
  SESSION_COOKIE_NAME: z.string().min(1).default("debate_session"),
  EVENT_RETENTION_SECONDS: z.coerce.number().int().positive().default(86_400),
  EVENT_REPLAY_LIMIT: z.coerce.number().int().positive().max(10_000).default(1_000),
  RATE_LIMIT_A_PER_HOUR: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_B_PER_HOUR: z.coerce.number().int().positive().default(120),
  RATE_LIMIT_C_PER_HOUR: z.coerce.number().int().positive().default(600),
  RATE_LIMIT_D_CONCURRENT: z.coerce.number().int().positive().default(30),
  RATE_LIMIT_D_LEASE_SECONDS: z.coerce.number().int().positive().default(120),
  RATE_LIMIT_P_PER_HOUR: z.coerce.number().int().positive().default(120),
  LEGAL_POLICY_VERSION: z.string().min(1).max(64).optional(),
  LEGAL_COUNSEL_APPROVED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  LEGAL_DEVELOPMENT_TEST_MODE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  LEGAL_ALLOW_UPLOADS: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  LEGAL_ALLOW_PASTE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  LEGAL_ALLOWED_URL_HOSTS: z.string().default(""),
  LEGAL_BLOCKED_URL_HOSTS: z.string().default(""),
  LEGAL_OFFICIAL_API_REQUIRED_HOSTS: z.string().default("youtube.com,www.youtube.com,youtu.be"),
  PUBLIC_SHARING_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  REPORT_EXPORT_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  ACCOUNT_DATA_EXPORT_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  PDF_EXPORT_ENABLED: z
    .literal("false")
    .default("false")
    .transform(() => false),
  PUBLICATION_COUNSEL_APPROVED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  PUBLICATION_POLICY_VERSION: optionalVersion,
  DISCLAIMER_VERSION: optionalVersion,
  LIMITATIONS_URL: optionalUrl,
  INGEST_MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(524_288_000),
  INGEST_MAX_PASTE_CHARS: z.coerce.number().int().positive().default(1_000_000),
  UPLOAD_URL_TTL_SECONDS: z.coerce.number().int().min(60).max(3_600).default(900),
  IDEMPOTENCY_TTL_SECONDS: z.coerce.number().int().positive().default(86_400),
  OBJECT_STORAGE_BUCKET: z.string().min(1).optional(),
  OBJECT_STORAGE_REGION: z.string().min(1).default("us-east-1"),
  OBJECT_STORAGE_ENDPOINT: z.string().url().optional(),
  OBJECT_STORAGE_ACCESS_KEY_ID: z.string().min(1).optional(),
  OBJECT_STORAGE_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  OBJECT_STORAGE_FORCE_PATH_STYLE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  OBJECT_DOWNLOAD_URL_TTL_SECONDS: z.coerce.number().int().min(60).max(3_600).default(900),
  TRANSCRIPT_TEXT_MAX_BYTES: z.coerce.number().int().positive().default(26_214_400),
  ASR_PROVIDER: z.enum(["deepgram", "whisper"]).default("deepgram"),
  WHISPER_URL: z.string().url().default("http://localhost:5001/transcribe"),
  WHISPER_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(3_600_000).default(600_000),
  DEEPGRAM_API_KEY: z.string().min(1).optional(),
  DEEPGRAM_API_URL: z.string().url().default("https://api.deepgram.com/v1/listen"),
  DEEPGRAM_MODEL: z.string().min(1).default("nova-3"),
  DEEPGRAM_DIARIZATION_MODEL: z.string().min(1).default("v2"),
  ASR_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(3_600_000).default(600_000),
  ASR_LOW_CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.8),
  DIARIZATION_LOW_CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.8),
  WORKER_JOB_LEASE_SECONDS: z.coerce.number().int().min(60).default(900),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().min(100).default(1_000),
  WORKER_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(3),
  HEALTHCHECK_TIMEOUT_MS: z.coerce.number().int().min(250).max(30_000).default(3_000),
  CLAIM_EXTRACTION_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  CLAIM_PROVIDER: z.enum(["openai", "ollama"]).default("openai"),
  GROQ_API_KEY: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  OLLAMA_BASE_URL: z.string().url().default("http://localhost:11434"),
  OLLAMA_MODEL: z.string().min(1).default("phi3:mini"),
  OLLAMA_NUM_CTX: z.coerce.number().int().min(512).max(32768).default(2048),
  OLLAMA_NUM_GPU: z.coerce.number().int().min(0).max(99).default(0),
  OLLAMA_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(10000).max(600000).default(300000),
  OPENAI_RESPONSES_URL: z.string().url().default("https://api.groq.com/openai/v1/responses"),
  CLAIM_MODEL: z.string().min(1).default("openai/gpt-oss-120b"),
  CLAIM_PROMPT_VERSION: z.string().min(1).max(100).default("s2-claim-extraction-v1"),
  CLAIM_SCHEMA_VERSION: z.string().min(1).max(100).default("s2-claim-schema-v1"),
  CLAIM_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(600_000).default(120_000),
  CLAIM_WINDOW_MAX_CHARS: z.coerce.number().int().min(2_000).max(200_000).default(30_000),
  CLAIM_WINDOW_OVERLAP_SEGMENTS: z.coerce.number().int().min(0).max(10).default(2),
  CLAIM_MAX_CLAIMS_PER_WINDOW: z.coerce.number().int().min(1).max(100).default(50),
  CLAIM_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(500).max(32_000).default(8_000),
  CLAIM_SCHEMA_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(5).default(3),
  SUPPORT_ASSESSMENT_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  SUPPORT_PROVIDER: z.enum(["openai", "ollama"]).default("openai"),
  SUPPORT_MODEL: z.string().min(1).default("openai/gpt-oss-120b"),
  SUPPORT_PROMPT_VERSION: z.string().min(1).max(100).default("s3-support-assessment-v1"),
  SUPPORT_SCHEMA_VERSION: z.string().min(1).max(100).default("s3-support-schema-v1"),
  SUPPORT_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(600_000).default(120_000),
  SUPPORT_CONTEXT_MAX_CHARS: z.coerce.number().int().min(20_000).max(500_000).default(100_000),
  SUPPORT_MAX_CLAIMS_PER_CALL: z.coerce.number().int().min(1).max(100).default(20),
  SUPPORT_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(500).max(32_000).default(8_000),
  SUPPORT_SCHEMA_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(5).default(3),
  ARGUMENT_STRUCTURE_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  STRUCTURE_PROVIDER: z.enum(["openai", "ollama"]).default("openai"),
  STRUCTURE_MODEL: z.string().min(1).default("openai/gpt-oss-120b"),
  STRUCTURE_PROMPT_VERSION: z.string().min(1).max(100).default("s4-toulmin-structure-v1"),
  STRUCTURE_SCHEMA_VERSION: z.string().min(1).max(100).default("s4-toulmin-schema-v1"),
  STRUCTURE_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(600_000).default(120_000),
  STRUCTURE_CONTEXT_MAX_CHARS: z.coerce.number().int().min(5_000).max(500_000).default(100_000),
  STRUCTURE_MAX_CLAIMS_PER_CALL: z.coerce.number().int().min(1).max(50).default(10),
  STRUCTURE_MAX_NODES_PER_CLAIM: z.coerce.number().int().min(1).max(50).default(20),
  STRUCTURE_MAX_EDGES_PER_CLAIM: z.coerce.number().int().min(0).max(100).default(40),
  STRUCTURE_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(500).max(32_000).default(8_000),
  STRUCTURE_SCHEMA_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(5).default(3),
  EVIDENCE_RETRIEVAL_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  EVIDENCE_RETRIEVER_PROVIDER: z.enum(["http", "wikipedia"]).default("wikipedia"),
  WIKIPEDIA_API_URL: z.string().url().default("https://en.wikipedia.org/w/api.php"),
  WIKIPEDIA_USER_AGENT: z
    .string()
    .default(
      "DebateAnalyser-EvidenceVerifier/1.0 (https://github.com/Mohammed-Ayyan/DebateAnylyser; contact: local-analyser@debate.local)",
    ),
  EVIDENCE_RETRIEVER_URL: z.string().url().optional(),
  EVIDENCE_RETRIEVER_API_KEY: z.string().min(1).optional(),
  EVIDENCE_RETRIEVER_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(20_000),
  EVIDENCE_MAX_CANDIDATES_PER_CLAIM: z.coerce.number().int().min(1).max(20).default(5),
  EVIDENCE_VERIFIER_PROVIDER: z.enum(["openai", "ollama"]).default("ollama"),
  EVIDENCE_VERIFIER_MODEL: z.string().min(1).default("gpt-5.6"),
  EVIDENCE_PROMPT_VERSION: z.string().min(1).max(100).default("s6-evidence-verification-v1"),
  EVIDENCE_SCHEMA_VERSION: z.string().min(1).max(100).default("s6-evidence-schema-v1"),
  EVIDENCE_VERIFIER_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(600_000).default(120_000),
  EVIDENCE_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(200).max(8_000).default(2_000),
  EVIDENCE_SCHEMA_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(5).default(3),
  EVIDENCE_SOURCE_FETCH_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(60_000).default(15_000),
  EVIDENCE_SOURCE_MAX_BYTES: z.coerce.number().int().min(1_024).max(10_485_760).default(2_097_152),
  EVIDENCE_SOURCE_MAX_REDIRECTS: z.coerce.number().int().min(0).max(5).default(3),
  FALLACY_DETECTION_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  FALLACY_PROVIDER: z.enum(["openai", "ollama"]).default("openai"),
  FALLACY_MODEL: z.string().min(1).default("openai/gpt-oss-120b"),
  FALLACY_PROMPT_VERSION: z.string().min(1).max(100).default("s5-fallacy-detection-v1"),
  FALLACY_SCHEMA_VERSION: z.string().min(1).max(100).default("s5-fallacy-schema-v1"),
  FALLACY_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(600_000).default(120_000),
  FALLACY_MAX_FINDINGS: z.coerce.number().int().min(1).max(50).default(25),
  FALLACY_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(200).max(8_000).default(2_000),
  FALLACY_SCHEMA_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(5).default(3),
  FALLACY_PRECISION_THRESHOLD: z.coerce.number().min(0.9).max(1).default(0.9),
  SOURCE_CREDIBILITY_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  SOURCE_CREDIBILITY_PROVIDER: z.enum(["http", "dataset"]).default("dataset"),
  CREDIBILITY_PROVIDER_URL: z.string().url().optional(),
  CREDIBILITY_PROVIDER_API_KEY: z.string().min(1).optional(),
  CREDIBILITY_PROVIDER_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(20_000),
})

const result = serverEnvSchema.safeParse(process.env)

if (!result.success) {
  const fields = result.error.issues.map((issue) => issue.path.join(".")).join(", ")
  throw new Error(`Invalid server environment configuration: ${fields}`)
}

export const serverEnv = Object.freeze(result.data)
export type ServerEnv = z.infer<typeof serverEnvSchema>

export function requireServerEnv<K extends keyof ServerEnv>(
  ...keys: K[]
): Required<Pick<ServerEnv, K>> {
  const missing = keys.filter((key) => !serverEnv[key])
  if (missing.length > 0)
    throw new Error(`Missing required server configuration: ${missing.join(", ")}`)
  return Object.fromEntries(keys.map((key) => [key, serverEnv[key]])) as Required<
    Pick<ServerEnv, K>
  >
}
