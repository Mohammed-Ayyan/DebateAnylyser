import { loadEnvFile } from "node:process"
loadEnvFile(".env.local")

async function main(): Promise<void> {
  const [{ desc, eq }, schema, { getDatabase }, { getTranscriptForAnalysis }] = await Promise.all([
    import("drizzle-orm"),
    import("../lib/db/schema"),
    import("../lib/db/client"),
    import("../lib/transcription/transcript-repository"),
  ])
  const [analysis] = await getDatabase()
    .select({ id: schema.analyses.id })
    .from(schema.analyses)
    .where(eq(schema.analyses.title, "Durable real S1-S5 development check"))
    .orderBy(desc(schema.analyses.createdAt))
    .limit(1)
  if (!analysis) throw new Error("ANALYSIS_NOT_FOUND")
  const persisted = await getTranscriptForAnalysis(analysis.id)
  if (!persisted) throw new Error("TRANSCRIPT_NOT_FOUND")
  const [
    { buildTranscriptWindows },
    { OpenAIClaimExtractionProvider },
    { serverEnv, requireServerEnv },
  ] = await Promise.all([
    import("../lib/claims/transcript-windows"),
    import("../lib/claims/openai-provider"),
    import("../lib/env/server"),
  ])
  const segments = persisted.segments.map((item) => ({
    id: item.id,
    index: item.index,
    text: item.text,
    speakerId: item.speakerId,
    speakerLabel: item.speakerDisplayName ?? item.speakerLabel,
    speakerIsNamedPerson: false,
    lowConfidence: item.lowConfidence,
  }))
  const window = buildTranscriptWindows(
    segments,
    serverEnv.CLAIM_WINDOW_MAX_CHARS,
    serverEnv.CLAIM_WINDOW_OVERLAP_SEGMENTS,
  )[0]
  if (!window) throw new Error("WINDOW_NOT_FOUND")
  console.log(
    `PERSISTED_SEGMENTS=${segments.length};TRANSCRIPT_CHARS=${segments.reduce((sum, item) => sum + item.text.length, 0)};WINDOW_CHARS=${window.source.length}`,
  )
  let httpStatus = 0
  let providerErrorCode = "NONE"
  let providerErrorType = "NONE"
  const provider = new OpenAIClaimExtractionProvider({
    apiKey: requireServerEnv("GROQ_API_KEY").GROQ_API_KEY,
    apiUrl: serverEnv.OPENAI_RESPONSES_URL,
    model: serverEnv.CLAIM_MODEL,
    timeoutMs: serverEnv.CLAIM_REQUEST_TIMEOUT_MS,
    maxOutputTokens: serverEnv.CLAIM_MAX_OUTPUT_TOKENS,
    fetchImpl: async (...args) => {
      const response = await fetch(...args)
      httpStatus = response.status
      if (!response.ok) {
        try {
          const payload = (await response.clone().json()) as {
            error?: { code?: unknown; type?: unknown }
          }
          providerErrorCode = typeof payload.error?.code === "string" ? payload.error.code : "NONE"
          providerErrorType = typeof payload.error?.type === "string" ? payload.error.type : "NONE"
        } catch {
          providerErrorCode = "UNPARSEABLE"
        }
      }
      return response
    },
  })
  try {
    await provider.extract({
      sourceBlock: window.source,
      promptVersion: serverEnv.CLAIM_PROMPT_VERSION,
      schemaVersion: serverEnv.CLAIM_SCHEMA_VERSION,
      maxClaims: serverEnv.CLAIM_MAX_CLAIMS_PER_WINDOW,
    })
    console.log(
      `S2_HTTP_STATUS=${httpStatus};RESULT=ACCEPTED;ERROR_CODE=${providerErrorCode};ERROR_TYPE=${providerErrorType}`,
    )
  } catch (error) {
    const code =
      typeof error === "object" && error && "code" in error ? String(error.code) : "UNKNOWN"
    console.log(
      `S2_HTTP_STATUS=${httpStatus};RESULT=${code};ERROR_CODE=${providerErrorCode};ERROR_TYPE=${providerErrorType}`,
    )
    process.exitCode = 1
  } finally {
    setTimeout(() => process.exit(process.exitCode ?? 0), 50)
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "PROBE_FAILED")
  process.exit(1)
})
