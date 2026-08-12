import { loadEnvFile } from "node:process"

loadEnvFile(".env.local")

const GROQ_URL = "https://api.groq.com/openai/v1/responses"
const GROQ_MODEL = "openai/gpt-oss-120b"
const SEGMENT_ID = "10000000-0000-4000-8000-000000000001"
const SPEAKER_ID = "10000000-0000-4000-8000-000000000002"
const CLAIM_ID = "10000000-0000-4000-8000-000000000003"
const ANALYSIS_ID = "10000000-0000-4000-8000-000000000004"
const TRANSCRIPT =
  "The city should expand bus service. A survey of 500 residents found that 72 percent commute by car."
const CLAIM_TEXT = "The city should expand bus service."
const FALLACY_TEXT = "Either we expand bus service now, or traffic will destroy the city."

function requireSecret(name: "GROQ_API_KEY" | "DEEPGRAM_API_KEY"): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name}_MISSING`)
  return value
}

function envNumber(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback)
  if (!Number.isFinite(value)) throw new Error(`${name}_INVALID`)
  return value
}

function reportFailure(scope: string, error: unknown): void {
  const code =
    typeof error === "object" && error && "code" in error
      ? String(error.code)
      : error instanceof Error
        ? error.message
        : "UNKNOWN_ERROR"
  console.error(`${scope}: FAIL (${code})`)
  if (error instanceof Error && error.cause instanceof Error) {
    const causeCode =
      "code" in error.cause ? String(error.cause.code) : error.cause.name || "UNKNOWN_CAUSE"
    console.error(`${scope}_CAUSE=${causeCode}`)
  }
  process.exitCode = 1
}
async function verifyGroq(): Promise<void> {
  const [
    { StageSchemaRegistry },
    { runValidatedStage },
    claimContracts,
    claimProviderModule,
    claimWindows,
    supportContracts,
    supportProviderModule,
    supportAssessment,
    structureContracts,
    structureProviderModule,
    structureMapping,
    fallacyContracts,
    fallacyProviderModule,
    fallacyValidation,
  ] = await Promise.all([
    import("../lib/ai/schema-registry"),
    import("../lib/ai/stage-runner"),
    import("../lib/claims/contracts"),
    import("../lib/claims/openai-provider"),
    import("../lib/claims/transcript-windows"),
    import("../lib/support/contracts"),
    import("../lib/support/openai-provider"),
    import("../lib/support/assessment"),
    import("../lib/structure/contracts"),
    import("../lib/structure/openai-provider"),
    import("../lib/structure/mapping"),
    import("../lib/fallacy/contracts"),
    import("../lib/fallacy/openai-provider"),
    import("../lib/fallacy/validation"),
  ])

  const apiKey = requireSecret("GROQ_API_KEY")
  const apiUrl = process.env.OPENAI_RESPONSES_URL ?? GROQ_URL
  const common = { apiKey, apiUrl, timeoutMs: 120_000 }
  const segment = {
    id: SEGMENT_ID,
    index: 0,
    text: TRANSCRIPT,
    speakerId: SPEAKER_ID,
    speakerLabel: "Speaker 1",
    speakerIsNamedPerson: false,
    lowConfidence: false,
  }

  const claimProvider = new claimProviderModule.OpenAIClaimExtractionProvider({
    ...common,
    model: process.env.CLAIM_MODEL ?? GROQ_MODEL,
    maxOutputTokens: envNumber("CLAIM_MAX_OUTPUT_TOKENS", 8_000),
  })
  const window = claimWindows.buildTranscriptWindows([segment], 30_000, 0)[0]
  const claimRegistry = new StageSchemaRegistry()
  claimRegistry.register("s2", claimContracts.claimExtractionJsonSchema)
  const s2 = await runValidatedStage({
    stage: "S2",
    schemaKey: "s2",
    source: window.source,
    registry: claimRegistry,
    maxAttempts: 3,
    invoke: ({ sourceBlock }) =>
      claimProvider.extract({
        sourceBlock,
        promptVersion: "s2-claim-extraction-v1",
        schemaVersion: "s2-claim-schema-v1",
        maxClaims: 10,
      }),
    transformValidated: (candidate) => claimWindows.validateWindowClaims(candidate, window, 10),
  })
  console.log(`S2 REAL GROQ: PASS (validated=${s2.output.length}, attempts=${s2.attempts})`)
  const claimStart = TRANSCRIPT.indexOf(CLAIM_TEXT)
  const internalClaim = {
    id: CLAIM_ID,
    analysis_id: ANALYSIS_ID,
    kind: "claim" as const,
    text: CLAIM_TEXT,
    paraphrase: false,
    confidence: { raw: 0.95, signals: { source_low_confidence: false } },
    confidence_band: null,
    state: "ok" as const,
    person_involved: false,
    span_refs: [
      { segment_id: SEGMENT_ID, start_char: claimStart, end_char: claimStart + CLAIM_TEXT.length },
    ],
    evidence_refs: [],
    produced_by_stage: "S2" as const,
    claim: {
      claim_type: "policy" as const,
      check_worthy: false,
      speaker_id: SPEAKER_ID,
      speaker_label: "Speaker 1",
    },
  }
  const supportInput = {
    analysisId: ANALYSIS_ID,
    status: "analyzing" as const,
    claims: [internalClaim],
    segments: [
      {
        id: SEGMENT_ID,
        index: 0,
        text: TRANSCRIPT,
        speakerId: SPEAKER_ID,
        lowConfidence: false,
      },
    ],
  }
  const supportCall = supportAssessment.prepareSupportCalls(supportInput, 100_000, 10).calls[0]
  if (!supportCall) throw new Error("S3_TEST_CALL_NOT_CREATED")
  const supportProvider = new supportProviderModule.OpenAISupportAssessmentProvider({
    ...common,
    model: process.env.SUPPORT_MODEL ?? GROQ_MODEL,
    maxOutputTokens: envNumber("SUPPORT_MAX_OUTPUT_TOKENS", 8_000),
  })
  const supportRegistry = new StageSchemaRegistry()
  supportRegistry.register("s3", supportContracts.supportAssessmentJsonSchema)
  const s3 = await runValidatedStage({
    stage: "S3",
    schemaKey: "s3",
    source: supportCall.source,
    registry: supportRegistry,
    maxAttempts: 3,
    invoke: ({ sourceBlock }) =>
      supportProvider.assess({
        sourceBlock,
        promptVersion: "s3-support-assessment-v1",
        schemaVersion: "s3-support-schema-v1",
        maxClaims: 10,
      }),
    transformValidated: (candidate) =>
      supportAssessment.validateSupportAssessments(candidate, supportCall),
  })
  console.log(`S3 REAL GROQ: PASS (validated=${s3.output.length}, attempts=${s3.attempts})`)
  const supportResult = s3.output[0]
  if (!supportResult) throw new Error("S3_VALIDATED_OUTPUT_EMPTY")
  const internalSupport = {
    id: "10000000-0000-4000-8000-000000000005",
    analysis_id: ANALYSIS_ID,
    kind: "support" as const,
    text: supportResult.rationale,
    paraphrase: false,
    confidence: { raw: supportResult.assessmentConfidence ?? 0 },
    confidence_band: null,
    state: supportResult.state,
    person_involved: false,
    span_refs: supportResult.spans,
    evidence_refs: [],
    produced_by_stage: "S3" as const,
    support: {
      claim_id: CLAIM_ID,
      support_level: supportResult.supportLevel,
      rationale: supportResult.rationale,
      reason_code: supportResult.reasonCode,
      anchor_role: "support_evidence" as const,
    },
  }
  const structureInput = {
    analysisId: ANALYSIS_ID,
    status: "analyzing" as const,
    claims: [internalClaim],
    supports: [internalSupport],
    segments: supportInput.segments,
  }
  const structureCall = structureMapping.prepareStructureCalls(structureInput, 100_000, 10).calls[0]
  if (!structureCall) throw new Error("S4_TEST_CALL_NOT_CREATED")
  const structureProvider = new structureProviderModule.OpenAIStructureMappingProvider({
    ...common,
    model: process.env.STRUCTURE_MODEL ?? GROQ_MODEL,
    maxOutputTokens: envNumber("STRUCTURE_MAX_OUTPUT_TOKENS", 8_000),
  })
  const structureRegistry = new StageSchemaRegistry()
  structureRegistry.register("s4", structureContracts.structureMappingJsonSchema)
  const s4 = await runValidatedStage({
    stage: "S4",
    schemaKey: "s4",
    source: structureCall.source,
    registry: structureRegistry,
    maxAttempts: 3,
    invoke: ({ sourceBlock }) =>
      structureProvider.map({
        sourceBlock,
        promptVersion: "s4-toulmin-structure-v1",
        schemaVersion: "s4-toulmin-schema-v1",
        maxClaims: 10,
        maxNodesPerClaim: 20,
        maxEdgesPerClaim: 40,
      }),
    transformValidated: (candidate) =>
      structureMapping.validateStructureMappings(candidate, structureCall, {
        maxNodesPerClaim: 20,
        maxEdgesPerClaim: 40,
      }),
  })
  console.log(`S4 REAL GROQ: PASS (validated=${s4.output.length}, attempts=${s4.attempts})`)
  const { FALLACY_TAXONOMY_VERSION } = await import("../lib/fallacy/taxonomy")
  const fallacyProvider = new fallacyProviderModule.OpenAIFallacyDetectionProvider({
    ...common,
    model: process.env.FALLACY_MODEL ?? GROQ_MODEL,
    maxOutputTokens: envNumber("FALLACY_MAX_OUTPUT_TOKENS", 2_000),
  })
  const fallacyRegistry = new StageSchemaRegistry()
  fallacyRegistry.register("s5", fallacyContracts.fallacyDetectionJsonSchema)
  const fallacySegment = {
    id: SEGMENT_ID,
    text: FALLACY_TEXT,
    lowConfidence: false,
    personInvolved: false,
  }
  const fallacySource = JSON.stringify({
    task: "Identify only clearly present possible taxonomy patterns for this claim.",
    source_claim: {
      id: CLAIM_ID,
      text: FALLACY_TEXT,
      claim_type: "policy",
      spans: [{ segment_id: SEGMENT_ID, start_char: 0, end_char: FALLACY_TEXT.length }],
    },
    structure: [],
    transcript_segments: [
      {
        id: SEGMENT_ID,
        text: FALLACY_TEXT,
        low_confidence: false,
        person_involved: false,
      },
    ],
  })
  const s5 = await runValidatedStage({
    stage: "S5",
    schemaKey: "s5",
    source: fallacySource,
    registry: fallacyRegistry,
    maxAttempts: 3,
    invoke: ({ sourceBlock }) =>
      fallacyProvider.detect({
        sourceBlock,
        promptVersion: "s5-fallacy-detection-v1",
        schemaVersion: "s5-fallacy-schema-v1",
        maxFindings: 10,
      }),
    transformValidated: (candidate) =>
      fallacyValidation.validateFallacyDetection(candidate, [fallacySegment], {
        precisionThreshold: 0.9,
        maxFindings: 10,
      }),
  })
  if (s5.output.taxonomyVersion !== FALLACY_TAXONOMY_VERSION) {
    throw new Error("S5_TAXONOMY_VERSION_MISMATCH")
  }
  console.log(
    `S5 REAL GROQ: PASS (validated=${s5.output.findings.length}, attempts=${s5.attempts})`,
  )
}

async function verifyDeepgram(): Promise<void> {
  const { DeepgramTranscriptionProvider } = await import("../lib/transcription/deepgram-adapter")
  const provider = new DeepgramTranscriptionProvider({
    apiKey: requireSecret("DEEPGRAM_API_KEY"),
    apiUrl: process.env.DEEPGRAM_API_URL ?? "https://api.deepgram.com/v1/listen",
    model: process.env.DEEPGRAM_MODEL ?? "nova-3",
    diarizationModel: process.env.DEEPGRAM_DIARIZATION_MODEL ?? "v2",
    timeoutMs: envNumber("ASR_TIMEOUT_MS", 600_000),
    asrLowConfidenceThreshold: envNumber("ASR_LOW_CONFIDENCE_THRESHOLD", 0.8),
    diarizationLowConfidenceThreshold: envNumber("DIARIZATION_LOW_CONFIDENCE_THRESHOLD", 0.8),
  })
  const result = await provider.transcribe({
    mediaUrl: "https://static.deepgram.com/examples/interview_speech-analytics.wav",
  })
  const speakers = new Set(
    result.segments.flatMap((segment) =>
      segment.speakerLabel === null ? [] : [segment.speakerLabel],
    ),
  )
  const diarizedSegments = result.segments.filter(
    (segment) => segment.speakerLabel !== null && segment.diarizationConfidence !== null,
  ).length
  if (speakers.size === 0 || diarizedSegments === 0) {
    throw new Error(
      `ASR_DIARIZATION_NOT_CONFIRMED_SPEAKERS_${speakers.size}_SEGMENTS_${result.segments.length}`,
    )
  }
  console.log(
    `S1 DEEPGRAM REAL TEST: PASS (segments=${result.segments.length}, speakers=${speakers.size}, diarized=${diarizedSegments})`,
  )
}

async function main(): Promise<void> {
  const mode = process.argv[2]
  try {
    if (mode === "groq") await verifyGroq()
    else if (mode === "deepgram") await verifyDeepgram()
    else throw new Error("USAGE_EXPECTED_GROQ_OR_DEEPGRAM")
  } catch (error) {
    reportFailure(mode === "deepgram" ? "S1 DEEPGRAM REAL TEST" : "REAL GROQ STAGES", error)
  }
}

void main()
