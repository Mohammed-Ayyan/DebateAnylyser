import { loadEnvFile } from "node:process"

loadEnvFile(".env.local")
process.env.LEGAL_ALLOWED_URL_HOSTS = [process.env.LEGAL_ALLOWED_URL_HOSTS, "static.deepgram.com"]
  .filter(Boolean)
  .join(",")
process.env.CLAIM_MAX_OUTPUT_TOKENS = "4096"
process.env.SUPPORT_MAX_OUTPUT_TOKENS = "4096"
process.env.STRUCTURE_MAX_OUTPUT_TOKENS = "4096"
process.env.FALLACY_MAX_OUTPUT_TOKENS = "1024"

const SAMPLE_URL = "https://static.deepgram.com/examples/Bueller-Life-moves-pretty-fast.wav"
const ANALYSIS_TITLE_PREFIX = "Durable real S1-S5 development check"
const EXPECTED_HANDOFF = { S1: "S2", S2: "S3", S3: "S4", S4: "S5", S5: "S8" } as const
const GROQ_MIN_INTERVAL_MS = 25_000
const nativeFetch = globalThis.fetch.bind(globalThis)
const providerHttp = { deepgramAccepted: 0, groqAccepted: 0, groqRejected: 0 }
let lastGroqStartedAt = 0

globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
  const input = args[0]
  const target = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  const hostname = new URL(target).hostname
  if (hostname === "api.groq.com") {
    const waitMs = Math.max(0, lastGroqStartedAt + GROQ_MIN_INTERVAL_MS - Date.now())
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs))
    lastGroqStartedAt = Date.now()
  }
  const response = await nativeFetch(...args)
  if (hostname === "api.deepgram.com" && response.ok) providerHttp.deepgramAccepted += 1
  if (hostname === "api.groq.com") {
    if (response.ok) providerHttp.groqAccepted += 1
    else providerHttp.groqRejected += 1
  }
  return response
}) as typeof fetch

type CheckedStage = keyof typeof EXPECTED_HANDOFF

type StageEvidence = {
  status: "PASS" | "FAIL" | "BLOCKED"
  reason: string
  findings?: number
}

const evidence: Record<CheckedStage, StageEvidence> = {
  S1: { status: "BLOCKED", reason: "not run" },
  S2: { status: "BLOCKED", reason: "waiting for S1" },
  S3: { status: "BLOCKED", reason: "waiting for S2" },
  S4: { status: "BLOCKED", reason: "waiting for S3" },
  S5: { status: "BLOCKED", reason: "waiting for S4" },
}

function fail(stage: CheckedStage, reason: string): never {
  evidence[stage] = { status: "FAIL", reason }
  throw new Error(`${stage}:${reason}`)
}

function requireCondition(
  stage: CheckedStage,
  condition: unknown,
  reason: string,
): asserts condition {
  if (!condition) fail(stage, reason)
}

async function main(): Promise<void> {
  const [
    { and, asc, eq, inArray, isNull },
    schema,
    { getDatabase },
    { getRedis, createRedisSubscriber },
    { processNextAnalysisJob },
  ] = await Promise.all([
    import("drizzle-orm"),
    import("../lib/db/schema"),
    import("../lib/db/client"),
    import("../lib/cache/redis"),
    import("../lib/analysis/worker"),
  ])
  const db = getDatabase()
  const activeJobs = await db
    .select({
      analysisId: schema.analysisJobs.analysisId,
      stage: schema.analysisJobs.stage,
      status: schema.analysisJobs.status,
      availableAt: schema.analysisJobs.availableAt,
      title: schema.analyses.title,
    })
    .from(schema.analysisJobs)
    .innerJoin(schema.analyses, eq(schema.analyses.id, schema.analysisJobs.analysisId))
    .where(inArray(schema.analysisJobs.status, ["queued", "processing"]))
  if (activeJobs.length > 1) throw new Error("MULTIPLE_PREEXISTING_ACTIVE_JOBS")
  const oldJob = activeJobs[0]
  if (oldJob) {
    if (!oldJob.title.startsWith(ANALYSIS_TITLE_PREFIX))
      throw new Error("UNRELATED_PREEXISTING_ACTIVE_JOB")
    if (oldJob.status === "processing") throw new Error("PREEXISTING_JOB_PROCESSING")
    if (!["S8", "S9", "S10"].includes(oldJob.stage))
      throw new Error("PREEXISTING_JOB_NOT_FINALIZABLE")
    let finalized = false
    while (!finalized) {
      const [current] = await db
        .select({
          stage: schema.analysisJobs.stage,
          status: schema.analysisJobs.status,
          availableAt: schema.analysisJobs.availableAt,
          lastErrorClass: schema.analysisJobs.lastErrorClass,
        })
        .from(schema.analysisJobs)
        .where(eq(schema.analysisJobs.analysisId, oldJob.analysisId))
        .limit(1)
      if (!current) throw new Error("PREEXISTING_JOB_MISSING")
      if (current.status === "complete") {
        finalized = true
        break
      }
      if (current.status !== "queued" || !["S8", "S9", "S10"].includes(current.stage)) {
        throw new Error(
          `PREEXISTING_FINALIZATION_${current.stage}_${current.status}_${current.lastErrorClass ?? "none"}`,
        )
      }
      const waitMs = Math.max(0, current.availableAt.getTime() - Date.now() + 250)
      if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs))
      if (!(await processNextAnalysisJob())) throw new Error("PREEXISTING_FINALIZATION_NOT_CLAIMED")
    }
  }

  const [owner] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(isNull(schema.users.deletedAt))
    .orderBy(asc(schema.users.createdAt))
    .limit(1)
  if (!owner) throw new Error("NO_ACTIVE_OWNER")
  const [{ submitAnalysis }, { requireApprovedLegalPolicy }] = await Promise.all([
    import("../lib/ingest/service"),
    import("../lib/legal/server-policy"),
  ])
  const policy = requireApprovedLegalPolicy()
  const created = await submitAnalysis(
    owner.id,
    policy.version,
    policy,
    {
      source_type: "url",
      url: SAMPLE_URL,
      access: "public",
      retrieval_method: "direct_fetch",
      rights_basis: "public_domain",
      intended_use: "research",
      retention_setting: "keep",
      title: `${ANALYSIS_TITLE_PREFIX} ${new Date().toISOString()}`,
    },
    undefined,
  )
  const analysisId = created.id
  const subscriber = createRedisSubscriber()
  let redisMessages = 0
  await subscriber.connect()
  await subscriber.subscribe(`debate:analysis-events:${analysisId}`)
  subscriber.on("message", () => {
    redisMessages += 1
  })

  const [
    { getTranscriptForAnalysis },
    { getClaimStageSnapshot },
    { getSupportStageSnapshot },
    { getStructureStageSnapshot },
    { getFallacyStageSnapshot },
  ] = await Promise.all([
    import("../lib/transcription/transcript-repository"),
    import("../lib/claims/repository"),
    import("../lib/support/repository"),
    import("../lib/structure/repository"),
    import("../lib/fallacy/repository"),
  ])

  const readJob = async () => {
    const [job] = await db
      .select({
        stage: schema.analysisJobs.stage,
        status: schema.analysisJobs.status,
        attempts: schema.analysisJobs.attempts,
        availableAt: schema.analysisJobs.availableAt,
        lastErrorClass: schema.analysisJobs.lastErrorClass,
      })
      .from(schema.analysisJobs)
      .where(eq(schema.analysisJobs.analysisId, analysisId))
      .limit(1)
    return job
  }
  const readRun = async (stage: CheckedStage) => {
    const runs = await db
      .select({
        status: schema.analysisStageRuns.status,
        attempt: schema.analysisStageRuns.attempt,
        startedAt: schema.analysisStageRuns.startedAt,
        finishedAt: schema.analysisStageRuns.finishedAt,
        errorClass: schema.analysisStageRuns.errorClass,
      })
      .from(schema.analysisStageRuns)
      .where(
        and(
          eq(schema.analysisStageRuns.analysisId, analysisId),
          eq(schema.analysisStageRuns.stage, stage),
        ),
      )
      .orderBy(asc(schema.analysisStageRuns.attempt))
    return runs
  }
  const runStage = async (stage: CheckedStage) => {
    for (;;) {
      const before = await readJob()
      requireCondition(
        stage,
        before?.stage === stage && before.status === "queued",
        `handoff_${before?.stage ?? "missing"}_${before?.status ?? "missing"}`,
      )
      const waitMs = Math.max(0, before.availableAt.getTime() - Date.now() + 250)
      if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs))
      requireCondition(stage, await processNextAnalysisJob(), "worker_did_not_claim_job")

      const runs = await readRun(stage)
      const latest = runs.at(-1)
      requireCondition(stage, runs.length >= 1, "stage_attempt_missing")
      requireCondition(
        stage,
        runs.slice(0, -1).every((run) => run.status === "failed"),
        "unexpected_prior_attempt_state",
      )
      requireCondition(
        stage,
        runs.every((run) => run.startedAt && run.finishedAt),
        "lifecycle_timestamps_missing",
      )
      const after = await readJob()
      if (latest?.status === "failed" && after?.stage === stage && after.status === "queued") {
        if (stage === "S5") {
          const partial = await db
            .select({ id: schema.findings.id })
            .from(schema.findings)
            .where(
              and(
                eq(schema.findings.analysisId, analysisId),
                eq(schema.findings.kind, "fallacy"),
                eq(schema.findings.producedByStage, "S5"),
              ),
            )
            .limit(1)
          requireCondition(stage, partial.length === 0, "partial_findings_after_failed_attempt")
        }
        continue
      }
      requireCondition(
        stage,
        latest?.status === "complete",
        `stage_${latest?.status ?? "missing"}_${latest?.errorClass ?? "none"}`,
      )
      requireCondition(
        stage,
        after?.stage === EXPECTED_HANDOFF[stage] && after.status === "queued",
        `handoff_${after?.stage ?? "missing"}_${after?.status ?? "missing"}_${after?.lastErrorClass ?? "none"}`,
      )
      const eventRows = await db
        .select({ payload: schema.analysisEvents.payload })
        .from(schema.analysisEvents)
        .where(eq(schema.analysisEvents.analysisId, analysisId))
        .orderBy(asc(schema.analysisEvents.sequence))
      const statuses = eventRows.flatMap(({ payload }) =>
        payload.type === "stage.status" &&
        payload.stage === stage &&
        typeof payload.status === "string"
          ? [payload.status]
          : [],
      )
      requireCondition(
        stage,
        statuses.includes("running") && statuses.includes("complete"),
        "lifecycle_events_missing",
      )
      return
    }
  }

  await runStage("S1")
  const transcript = await getTranscriptForAnalysis(analysisId)
  requireCondition("S1", transcript?.transcript.source === "asr", "persisted_transcript_not_asr")
  requireCondition("S1", transcript.segments.length > 0, "persisted_segments_empty")
  requireCondition(
    "S1",
    transcript.segments.every(
      (segment) => segment.speakerLabel !== null && segment.diarizationConfidence !== null,
    ),
    "persisted_diarization_incomplete",
  )
  requireCondition("S1", providerHttp.deepgramAccepted > 0, "real_deepgram_request_not_accepted")
  evidence.S1 = { status: "PASS", reason: "real ASR persisted with complete lifecycle" }
  const segmentText = new Map(transcript.segments.map((segment) => [segment.id, segment.text]))
  const validSpan = (span: { segment_id: string; start_char: number; end_char: number }) => {
    const text = segmentText.get(span.segment_id)
    return Boolean(
      text &&
      span.start_char >= 0 &&
      span.end_char > span.start_char &&
      span.end_char <= text.length &&
      text.slice(span.start_char, span.end_char).trim(),
    )
  }

  await runStage("S2")
  const s2 = await getClaimStageSnapshot(analysisId)
  requireCondition("S2", s2?.status === "complete", "snapshot_not_complete")
  requireCondition("S2", s2.findings.length > 0, "real_provider_returned_no_claims")
  requireCondition(
    "S2",
    s2.findings.every(
      (finding) =>
        finding.span_refs.length === 1 &&
        finding.span_refs.every(validSpan) &&
        segmentText
          .get(finding.span_refs[0].segment_id)
          ?.slice(finding.span_refs[0].start_char, finding.span_refs[0].end_char) === finding.text,
    ),
    "claim_not_exactly_anchored",
  )
  const claimIds = new Set(s2.findings.map((finding) => finding.id))
  evidence.S2 = {
    status: "PASS",
    reason: "real validated claims persisted and handed to S3",
    findings: s2.findings.length,
  }

  await runStage("S3")
  const s3 = await getSupportStageSnapshot(analysisId)
  requireCondition("S3", s3?.status === "complete", "snapshot_not_complete")
  const supportedClaimIds = new Set(s3.findings.map((finding) => finding.support.claim_id))
  requireCondition(
    "S3",
    s3.findings.length === s2.findings.length &&
      supportedClaimIds.size === claimIds.size &&
      [...supportedClaimIds].every((id) => claimIds.has(id)),
    "claim_coverage_mismatch",
  )
  requireCondition(
    "S3",
    s3.findings.every(
      (finding) => finding.span_refs.length > 0 && finding.span_refs.every(validSpan),
    ),
    "span_not_persisted_transcript",
  )
  evidence.S3 = {
    status: "PASS",
    reason: "real validated support persisted from S2 input and handed to S4",
    findings: s3.findings.length,
  }

  await runStage("S4")
  const s4 = await getStructureStageSnapshot(analysisId)
  requireCondition("S4", s4?.status === "complete", "snapshot_not_complete")
  requireCondition("S4", s4.findings.length > 0, "persisted_structure_empty")
  const structuredClaimIds = new Set(
    s4.findings.map((finding) => finding.structure.source_claim_id),
  )
  requireCondition(
    "S4",
    structuredClaimIds.size === claimIds.size &&
      [...structuredClaimIds].every((id) => claimIds.has(id)),
    "claim_coverage_mismatch",
  )
  requireCondition(
    "S4",
    s4.findings.every(
      (finding) => finding.span_refs.length > 0 && finding.span_refs.every(validSpan),
    ),
    "span_not_persisted_transcript",
  )
  evidence.S4 = {
    status: "PASS",
    reason: "real validated structure persisted from upstream input and handed to S5",
    findings: s4.findings.length,
  }

  const acceptedBeforeS5 = providerHttp.groqAccepted
  await runStage("S5")
  requireCondition(
    "S5",
    providerHttp.groqAccepted > acceptedBeforeS5,
    "real_groq_s5_request_not_accepted",
  )
  const s5 = await getFallacyStageSnapshot(analysisId)
  requireCondition("S5", s5?.status === "complete", "snapshot_not_complete")
  requireCondition(
    "S5",
    s5.findings.every(
      (finding) =>
        claimIds.has(finding.fallacy.source_claim_id) &&
        finding.span_refs.length === 1 &&
        finding.span_refs.every(validSpan),
    ),
    "fallacy_traceability_failed",
  )
  evidence.S5 = {
    status: "PASS",
    reason: "real validated output atomically committed and handed to S8",
    findings: s5.findings.length,
  }

  await new Promise((resolve) => setTimeout(resolve, 100))
  if (redisMessages === 0) throw new Error("REDIS_EVENT_PUBLICATION_NOT_OBSERVED")
  console.log(
    JSON.stringify({
      analysisId,
      oldJobFinalized: oldJob?.analysisId ?? null,
      transcriptSegments: transcript.segments.length,
      structureEdges: s4.edges.length,
      evidence,
      redisMessages,
      providerHttp,
      realDeepgram: providerHttp.deepgramAccepted > 0,
      realGroq: providerHttp.groqAccepted > 0,
      realPostgres: true,
      realRedisWorker: true,
    }),
  )
  subscriber.disconnect()
  getRedis().disconnect()
}

void main()
  .catch((error: unknown) => {
    const safeReason = error instanceof Error ? error.message : "UNKNOWN_ERROR"
    console.error(JSON.stringify({ evidence, error: safeReason }))
    process.exitCode = 1
  })
  .finally(() => setTimeout(() => process.exit(process.exitCode ?? 0), 50))
