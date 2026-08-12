import "server-only"

import { createStageAttempt, transitionAnalysisStatus } from "@/lib/analysis/lifecycle-repository"
import { failRunningStageAttempts, transitionStageRun } from "@/lib/analysis/stage-run-repository"
import { nextStageAfterS5 } from "@/lib/analysis/stage-routing"
import { recordInjectionFlags } from "@/lib/ai/injection-flag-repository"
import { StageSchemaRegistry } from "@/lib/ai/schema-registry"
import { StageOutputValidationError, runValidatedStage } from "@/lib/ai/stage-runner"
import {
  publicFallacyFindingSchema,
  type InternalFallacyFinding,
  type PublicFallacyFinding,
} from "@/lib/contracts/analysis"
import { requireServerEnv, serverEnv } from "@/lib/env/server"
import { appendAnalysisEvent } from "@/lib/events/repository"
import { logger } from "@/lib/observability/logger"
import { pipelineElapsed, pipelineLog, pipelineNow } from "@/lib/observability/pipeline-logger"
import {
  advanceAnalysisJobStage,
  claimAnalysisJob,
  completeAnalysisJob,
  failAnalysisJob,
  renewAnalysisJobLease,
  retryAnalysisJob,
  type ClaimedAnalysisJob,
} from "@/lib/queue/analysis-jobs"
import {
  FallacyDetectionError,
  fallacyDetectionJsonSchema,
  type FallacyDetectionProvider,
  type FallacyTranscriptSegment,
  type ValidatedFallacyFinding,
} from "./contracts"
import { OpenAIFallacyDetectionProvider } from "./openai-provider"
import {
  getFallacyStageSnapshot,
  loadFallacyInput,
  persistFallacyFindings,
  type FallacyInput,
  type PersistableFallacyFinding,
} from "./repository"
import { validateFallacyDetection } from "./validation"

export type FallacyWorkerDependencies = {
  providerFactory: () => FallacyDetectionProvider
  renewJob: typeof renewAnalysisJobLease
  advanceJob: typeof advanceAnalysisJobStage
  completeJob: typeof completeAnalysisJob
  retryJob: typeof retryAnalysisJob
  failJob: typeof failAnalysisJob
  loadInput: typeof loadFallacyInput
  getSnapshot: typeof getFallacyStageSnapshot
  persist: typeof persistFallacyFindings
  failRunningAttempts: typeof failRunningStageAttempts
  createAttempt: typeof createStageAttempt
  transitionStage: typeof transitionStageRun
  transitionAnalysis: typeof transitionAnalysisStatus
  appendEvent: typeof appendAnalysisEvent
  recordInjection: typeof recordInjectionFlags
  evidenceRetrievalEnabled: boolean
  now: () => Date
}

type FallacyCall = {
  sourceClaimId: string
  source: string
  segments: readonly FallacyTranscriptSegment[]
}

function createDefaultProvider(): FallacyDetectionProvider {
  if (!serverEnv.FALLACY_DETECTION_ENABLED) {
    throw new FallacyDetectionError(
      "FALLACY_DETECTION_DISABLED",
      "Fallacy detection is disabled.",
      false,
    )
  }
  const { GROQ_API_KEY } = requireServerEnv("GROQ_API_KEY")
  return new OpenAIFallacyDetectionProvider({
    apiKey: GROQ_API_KEY,
    apiUrl: serverEnv.OPENAI_RESPONSES_URL,
    model: serverEnv.FALLACY_MODEL,
    timeoutMs: serverEnv.FALLACY_REQUEST_TIMEOUT_MS,
    maxOutputTokens: serverEnv.FALLACY_MAX_OUTPUT_TOKENS,
  })
}

function defaultDependencies(): FallacyWorkerDependencies {
  return {
    providerFactory: createDefaultProvider,
    renewJob: renewAnalysisJobLease,
    advanceJob: advanceAnalysisJobStage,
    completeJob: completeAnalysisJob,
    retryJob: retryAnalysisJob,
    failJob: failAnalysisJob,
    loadInput: loadFallacyInput,
    getSnapshot: getFallacyStageSnapshot,
    persist: persistFallacyFindings,
    failRunningAttempts: failRunningStageAttempts,
    createAttempt: createStageAttempt,
    transitionStage: transitionStageRun,
    transitionAnalysis: transitionAnalysisStatus,
    appendEvent: appendAnalysisEvent,
    recordInjection: recordInjectionFlags,
    evidenceRetrievalEnabled: serverEnv.EVIDENCE_RETRIEVAL_ENABLED,
    now: () => new Date(),
  }
}

function errorDetails(error: unknown): { code: string; retryable: boolean } {
  if (error instanceof FallacyDetectionError)
    return { code: error.code, retryable: error.retryable }
  if (error instanceof StageOutputValidationError) {
    return { code: "FALLACY_OUTPUT_VALIDATION_FAILED", retryable: true }
  }
  return { code: "FALLACY_DETECTION_INTERNAL_ERROR", retryable: true }
}

function retryDelay(attempt: number): number {
  return Math.min(900, 30 * 2 ** Math.max(0, attempt - 1))
}

async function requireLease(result: Promise<boolean>): Promise<void> {
  if (!(await result)) {
    throw new FallacyDetectionError("WORKER_LEASE_LOST", "The worker lease was lost.", true)
  }
}

function prepareCalls(input: FallacyInput): FallacyCall[] {
  const segmentsById = new Map(input.segments.map((segment) => [segment.id, segment]))
  return input.claims.flatMap((claim) => {
    if (claim.person_involved) return []
    const structures = input.structures.filter(
      (item) => item.structure.source_claim_id === claim.id && !item.person_involved,
    )
    const segmentIds = new Set([
      ...claim.span_refs.map((span) => span.segment_id),
      ...structures.flatMap((item) => item.span_refs.map((span) => span.segment_id)),
    ])
    const segments = [...segmentIds]
      .map((id) => segmentsById.get(id))
      .filter((segment): segment is FallacyInput["segments"][number] => Boolean(segment))
      .sort((left, right) => left.index - right.index)
    if (segments.length === 0) {
      throw new FallacyDetectionError(
        "FALLACY_INPUT_SPAN_MISMATCH",
        "A claim or structure anchor was outside the supplied transcript.",
        false,
      )
    }

    return [
      {
        sourceClaimId: claim.id,
        segments,
        source: JSON.stringify({
          task: "Identify only clearly present possible taxonomy patterns for this claim.",
          source_claim: {
            id: claim.id,
            text: claim.text,
            claim_type: claim.claim.claim_type,
            spans: claim.span_refs,
          },
          structure: structures.map((item) => ({
            text: item.text,
            role: item.structure.role,
            inferred: item.structure.inferred,
            spans: item.span_refs,
          })),
          transcript_segments: segments.map((segment) => ({
            id: segment.id,
            text: segment.text,
            low_confidence: segment.lowConfidence,
            person_involved: segment.personInvolved,
          })),
        }),
      },
    ]
  })
}

function toPublicFindings(
  findings: readonly InternalFallacyFinding[],
  validSegmentIds: ReadonlySet<string>,
): PublicFallacyFinding[] {
  return findings.flatMap((finding) => {
    if (
      finding.person_involved ||
      finding.span_refs.length !== 1 ||
      !validSegmentIds.has(finding.span_refs[0].segment_id)
    ) {
      return []
    }
    const parsed = publicFallacyFindingSchema.safeParse(finding)
    return parsed.success ? [parsed.data] : []
  })
}

async function publishStage(
  dependencies: FallacyWorkerDependencies,
  analysisId: string,
  status: "running" | "complete" | "failed",
  attempt: number,
  errorClass?: string,
): Promise<void> {
  await dependencies.appendEvent(analysisId, {
    type: "stage.status",
    stage: "S5",
    status,
    attempt,
    ...(errorClass ? { error_class: errorClass } : {}),
  })
}

async function publishFallacies(
  dependencies: FallacyWorkerDependencies,
  analysisId: string,
  findings: readonly PublicFallacyFinding[],
): Promise<void> {
  if (findings.length === 0) {
    await dependencies.appendEvent(analysisId, { type: "finding.batch", stage: "S5", findings: [] })
    return
  }
  for (let offset = 0; offset < findings.length; offset += 50) {
    await dependencies.appendEvent(analysisId, {
      type: "finding.batch",
      stage: "S5",
      findings: findings.slice(offset, offset + 50),
    })
  }
}

async function finishAtS5Boundary(
  dependencies: FallacyWorkerDependencies,
  analysisId: string,
  status: "analyzing" | "partial",
): Promise<void> {
  if (status === "analyzing") {
    await dependencies.transitionAnalysis(analysisId, "analyzing", "partial")
  }
  await dependencies.appendEvent(analysisId, { type: "analysis.done", status: "partial" })
}

async function finishFallacyJob(
  dependencies: FallacyWorkerDependencies,
  job: ClaimedAnalysisJob,
  status: "analyzing" | "partial",
): Promise<void> {
  const nextStage = nextStageAfterS5({
    supportAssessment: true,
    argumentStructure: true,
    fallacyDetection: true,
    evidenceRetrieval: dependencies.evidenceRetrievalEnabled,
  })
  if (nextStage) {
    await requireLease(dependencies.advanceJob(job.id, job.lockToken, "S5", nextStage))
    return
  }
  await finishAtS5Boundary(dependencies, job.analysisId, status)
  await requireLease(dependencies.completeJob(job.id, job.lockToken))
}

async function detectFallacies(
  input: FallacyInput,
  dependencies: FallacyWorkerDependencies,
  analysisId: string,
  signal: AbortSignal,
  leaseWasLost: () => boolean,
): Promise<PersistableFallacyFinding[]> {
  const calls = prepareCalls(input)
  if (calls.length === 0) return []

  const registry = new StageSchemaRegistry()
  registry.register(serverEnv.FALLACY_SCHEMA_VERSION, fallacyDetectionJsonSchema)
  const provider = dependencies.providerFactory()
  const accepted: PersistableFallacyFinding[] = []
  const seen = new Set<string>()

  for (const call of calls) {
    const remaining = serverEnv.FALLACY_MAX_FINDINGS - accepted.length
    if (remaining <= 0) break
    pipelineLog("S5", "PROVIDER", "Sending request", { model: serverEnv.FALLACY_MODEL })
    const _callStart = pipelineNow()
    const result = await runValidatedStage<readonly ValidatedFallacyFinding[]>({
      stage: "S5",
      schemaKey: serverEnv.FALLACY_SCHEMA_VERSION,
      source: call.source,
      registry,
      maxAttempts: serverEnv.FALLACY_SCHEMA_MAX_ATTEMPTS,
      recordInjectionSignals: (signals) => dependencies.recordInjection(analysisId, signals),
      invoke: ({ sourceBlock }) =>
        provider.detect(
          {
            sourceBlock,
            promptVersion: serverEnv.FALLACY_PROMPT_VERSION,
            schemaVersion: serverEnv.FALLACY_SCHEMA_VERSION,
            maxFindings: remaining,
          },
          signal,
        ),
      transformValidated: (candidate) =>
        validateFallacyDetection(candidate, call.segments, {
          precisionThreshold: serverEnv.FALLACY_PRECISION_THRESHOLD,
          maxFindings: remaining,
        }).findings,
    })
    for (const finding of result.output) {
      const key = `${finding.taxonomyId}:${finding.span.segmentId}:${finding.span.startChar}:${finding.span.endChar}`
      if (seen.has(key)) continue
      seen.add(key)
      accepted.push({ ...finding, sourceClaimId: call.sourceClaimId })
    }
    pipelineLog("S5", "PROVIDER", "Response received", { elapsed: pipelineElapsed(_callStart), accepted: accepted.length })
    if (leaseWasLost()) {
      throw new FallacyDetectionError("WORKER_LEASE_LOST", "The worker lease was lost.", true)
    }
  }
  return accepted
}

export async function processClaimedFallacyJob(
  job: ClaimedAnalysisJob,
  dependencies: FallacyWorkerDependencies = defaultDependencies(),
): Promise<void> {
  if (job.stage !== "S5") throw new Error(`Fallacy worker cannot process ${job.stage}`)
  const abortController = new AbortController()
  let leaseLost = false
  const heartbeat = setInterval(
    () => {
      void dependencies.renewJob(job.id, job.lockToken).then((renewed) => {
        if (!renewed) {
          leaseLost = true
          abortController.abort(new Error("Worker lease lost"))
        }
      })
    },
    Math.max(10_000, Math.floor((serverEnv.WORKER_JOB_LEASE_SECONDS * 1_000) / 3)),
  )
  heartbeat.unref?.()

  const _pipelineStart = pipelineNow()
  pipelineLog("S5", "START", "", { analysisId: job.analysisId, attempt: job.attempts })
  let stageRun: Awaited<ReturnType<typeof createStageAttempt>> | undefined
  let inputStatus: "analyzing" | "partial" | undefined
  try {
    const input = await dependencies.loadInput(job.analysisId)
    pipelineLog("S5", "INPUT", "", { segments: input.segments.length, claims: input.claims.length, structures: input.structures.length })
    inputStatus = input.status
    const validSegmentIds = new Set(input.segments.map((segment) => segment.id))
    const snapshot = await dependencies.getSnapshot(job.analysisId, true)
    if (snapshot?.status === "complete") {
      const publicFindings = toPublicFindings(snapshot.findings, validSegmentIds)
      if (publicFindings.length !== snapshot.findings.length) {
        throw new FallacyDetectionError(
          "FALLACY_TRACEABILITY_FAILED",
          "A persisted fallacy finding failed the traceability or person-containment gate.",
          false,
        )
      }
      await requireLease(dependencies.renewJob(job.id, job.lockToken))
      await publishFallacies(dependencies, job.analysisId, publicFindings)
      await finishFallacyJob(dependencies, job, input.status)
      return
    }

    await dependencies.failRunningAttempts(job.analysisId, "S5")
    stageRun = await dependencies.createAttempt(job.analysisId, "S5")
    await dependencies.transitionStage(stageRun.id, "pending", "running")
    await publishStage(dependencies, job.analysisId, "running", stageRun.attempt)

    const detections = await detectFallacies(
      input,
      dependencies,
      job.analysisId,
      abortController.signal,
      () => leaseLost,
    )
    await requireLease(dependencies.renewJob(job.id, job.lockToken))
    const persisted = await dependencies.persist(job.analysisId, stageRun.id, detections, {
      promptVersion: serverEnv.FALLACY_PROMPT_VERSION,
      schemaVersion: serverEnv.FALLACY_SCHEMA_VERSION,
    })
    const publicFindings = toPublicFindings(persisted.findings, validSegmentIds)
    if (publicFindings.length !== persisted.findings.length) {
      throw new FallacyDetectionError(
        "FALLACY_TRACEABILITY_FAILED",
        "A persisted fallacy finding failed the traceability or person-containment gate.",
        false,
      )
    }

    pipelineLog("S5", "VALIDATION", "Schema validation passed", { findings: publicFindings.length })
    pipelineLog("S5", "DB", "Persisting", { findings: publicFindings.length })
    await requireLease(dependencies.renewJob(job.id, job.lockToken))
    await publishStage(dependencies, job.analysisId, "complete", stageRun.attempt)
    await publishFallacies(dependencies, job.analysisId, publicFindings)
    pipelineLog("S5", "DB", "Persistence complete", {})
    await finishFallacyJob(dependencies, job, input.status)
    pipelineLog("S5", "COMPLETE", "", { duration: pipelineElapsed(_pipelineStart) })
  } catch (error) {
    const details = errorDetails(error)
    pipelineLog("S5", "ERROR", "", { code: details.code, retryable: details.retryable })
    logger.error("fallacy_detection.job_failed", {
      analysisId: job.analysisId,
      jobId: job.id,
      attempt: job.attempts,
      errorClass: details.code,
      retryable: details.retryable,
      error,
    })
    if (leaseLost || details.code === "WORKER_LEASE_LOST") return

    if (stageRun) {
      try {
        await dependencies.transitionStage(stageRun.id, "running", "failed", details.code)
        await publishStage(dependencies, job.analysisId, "failed", stageRun.attempt, details.code)
      } catch (stageError) {
        logger.warn("fallacy_detection.stage_failure_record_failed", {
          analysisId: job.analysisId,
          stageRunId: stageRun.id,
          error: stageError,
        })
      }
    }
    if (details.retryable && job.attempts < serverEnv.WORKER_MAX_ATTEMPTS) {
      const availableAt = new Date(dependencies.now().getTime() + retryDelay(job.attempts) * 1_000)
      pipelineLog("S5", "RETRY", "", {
        attempt: `${job.attempts + 1}/${serverEnv.WORKER_MAX_ATTEMPTS}`,
        delaySeconds: retryDelay(job.attempts),
      })
      await dependencies.appendEvent(job.analysisId, {
        type: "error",
        code: details.code,
        message: "Fallacy detection was interrupted and will be retried.",
      })
      await dependencies.retryJob(job.id, job.lockToken, availableAt, details.code)
      return
    }

    await dependencies.appendEvent(job.analysisId, {
      type: "error",
      code: details.code,
      message:
        "Possible fallacies could not be identified reliably; earlier findings were preserved.",
    })
    if (inputStatus) {
      const recoveryStage = nextStageAfterS5({
        supportAssessment: true,
        argumentStructure: true,
        evidenceRetrieval: dependencies.evidenceRetrievalEnabled ?? false,
      })
      await requireLease(dependencies.advanceJob(job.id, job.lockToken, "S5", recoveryStage))
      return
    }
    await dependencies.failJob(job.id, job.lockToken, details.code)
  } finally {
    clearInterval(heartbeat)
  }
}

export async function processNextFallacyJob(
  dependencies: FallacyWorkerDependencies = defaultDependencies(),
): Promise<boolean> {
  const job = await claimAnalysisJob(serverEnv.WORKER_JOB_LEASE_SECONDS, "S5")
  if (!job) return false
  await processClaimedFallacyJob(job, dependencies)
  return true
}
