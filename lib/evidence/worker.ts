import "server-only"

import { createStageAttempt, transitionAnalysisStatus } from "@/lib/analysis/lifecycle-repository"
import { failRunningStageAttempts, transitionStageRun } from "@/lib/analysis/stage-run-repository"
import { nextStageAfterS6 } from "@/lib/analysis/stage-routing"
import { recordInjectionFlags } from "@/lib/ai/injection-flag-repository"
import { StageOutputValidationError, runValidatedStage } from "@/lib/ai/stage-runner"
import { StageSchemaRegistry } from "@/lib/ai/schema-registry"
import type { InternalClaimFinding, PublicClaimFinding } from "@/lib/contracts/analysis"
import { requireServerEnv, serverEnv } from "@/lib/env/server"
import { appendAnalysisEvent } from "@/lib/events/repository"
import { logger } from "@/lib/observability/logger"
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
  EvidenceError,
  evidenceRetrievalJsonSchema,
  evidenceVerificationJsonSchema,
  type EvidenceRetriever,
  type EvidenceSourceResolver,
  type EvidenceVerifier,
  type VerifiedEvidence,
} from "./contracts"
import { OpenAIEvidenceVerifier } from "./openai-verifier"
import { toTraceablePublicEvidenceClaims } from "./public-evidence"
import {
  getEvidenceRefsByClaim,
  getEvidenceStageSnapshot,
  loadEvidenceInput,
  persistVerifiedEvidence,
} from "./repository"
import { HttpEvidenceRetriever } from "./retriever"
import { HttpsEvidenceSourceResolver } from "./source-resolver"
import {
  deduplicateVerifiedEvidence,
  eligibleEvidenceClaims,
  parseEvidenceCandidates,
  serializeVerificationInput,
  validateEvidenceVerification,
} from "./verification"

export type EvidenceWorkerDependencies = {
  retrieverFactory: () => EvidenceRetriever
  verifierFactory: () => EvidenceVerifier
  sourceResolver: EvidenceSourceResolver
  renewJob: typeof renewAnalysisJobLease
  advanceJob?: typeof advanceAnalysisJobStage
  completeJob: typeof completeAnalysisJob
  retryJob: typeof retryAnalysisJob
  failJob: typeof failAnalysisJob
  loadInput: typeof loadEvidenceInput
  getSnapshot: typeof getEvidenceStageSnapshot
  getRefs: typeof getEvidenceRefsByClaim
  persist: typeof persistVerifiedEvidence
  failRunningAttempts: typeof failRunningStageAttempts
  createAttempt: typeof createStageAttempt
  transitionStage: typeof transitionStageRun
  transitionAnalysis: typeof transitionAnalysisStatus
  appendEvent: typeof appendAnalysisEvent
  recordInjection: typeof recordInjectionFlags
  sourceCredibilityEnabled?: boolean
  now: () => Date
}

function assertEnabled(): void {
  if (!serverEnv.EVIDENCE_RETRIEVAL_ENABLED) {
    throw new EvidenceError(
      "EVIDENCE_RETRIEVAL_DISABLED",
      "Verified evidence retrieval is disabled.",
      false,
    )
  }
}

function createDefaultRetriever(): EvidenceRetriever {
  assertEnabled()
  const { EVIDENCE_RETRIEVER_URL, EVIDENCE_RETRIEVER_API_KEY } = requireServerEnv(
    "EVIDENCE_RETRIEVER_URL",
    "EVIDENCE_RETRIEVER_API_KEY",
  )
  return new HttpEvidenceRetriever({
    apiUrl: EVIDENCE_RETRIEVER_URL,
    apiKey: EVIDENCE_RETRIEVER_API_KEY,
    timeoutMs: serverEnv.EVIDENCE_RETRIEVER_TIMEOUT_MS,
  })
}

function createDefaultVerifier(): EvidenceVerifier {
  assertEnabled()
  const { OPENAI_API_KEY } = requireServerEnv("OPENAI_API_KEY")
  return new OpenAIEvidenceVerifier({
    apiKey: OPENAI_API_KEY,
    apiUrl: serverEnv.OPENAI_RESPONSES_URL,
    model: serverEnv.EVIDENCE_VERIFIER_MODEL,
    timeoutMs: serverEnv.EVIDENCE_VERIFIER_TIMEOUT_MS,
    maxOutputTokens: serverEnv.EVIDENCE_MAX_OUTPUT_TOKENS,
  })
}

function defaultDependencies(): EvidenceWorkerDependencies {
  return {
    retrieverFactory: createDefaultRetriever,
    verifierFactory: createDefaultVerifier,
    sourceResolver: new HttpsEvidenceSourceResolver({
      timeoutMs: serverEnv.EVIDENCE_SOURCE_FETCH_TIMEOUT_MS,
      maxBytes: serverEnv.EVIDENCE_SOURCE_MAX_BYTES,
      maxRedirects: serverEnv.EVIDENCE_SOURCE_MAX_REDIRECTS,
    }),
    renewJob: renewAnalysisJobLease,
    advanceJob: advanceAnalysisJobStage,
    completeJob: completeAnalysisJob,
    retryJob: retryAnalysisJob,
    failJob: failAnalysisJob,
    loadInput: loadEvidenceInput,
    getSnapshot: getEvidenceStageSnapshot,
    getRefs: getEvidenceRefsByClaim,
    persist: persistVerifiedEvidence,
    failRunningAttempts: failRunningStageAttempts,
    createAttempt: createStageAttempt,
    transitionStage: transitionStageRun,
    transitionAnalysis: transitionAnalysisStatus,
    appendEvent: appendAnalysisEvent,
    recordInjection: recordInjectionFlags,
    sourceCredibilityEnabled: serverEnv.SOURCE_CREDIBILITY_ENABLED,
    now: () => new Date(),
  }
}

function errorDetails(error: unknown): { code: string; retryable: boolean } {
  if (error instanceof EvidenceError) return { code: error.code, retryable: error.retryable }
  if (error instanceof StageOutputValidationError) {
    return { code: "EVIDENCE_OUTPUT_VALIDATION_FAILED", retryable: true }
  }
  return { code: "EVIDENCE_RETRIEVAL_INTERNAL_ERROR", retryable: true }
}

function retryDelay(attempt: number): number {
  return Math.min(900, 30 * 2 ** Math.max(0, attempt - 1))
}

async function requireLease(result: Promise<boolean>): Promise<void> {
  if (!(await result)) throw new EvidenceError("WORKER_LEASE_LOST", "Worker lease was lost.", true)
}

async function publishStage(
  dependencies: EvidenceWorkerDependencies,
  analysisId: string,
  status: "running" | "complete" | "failed",
  attempt: number,
  errorClass?: string,
): Promise<void> {
  await dependencies.appendEvent(analysisId, {
    type: "stage.status",
    stage: "S6",
    status,
    attempt,
    ...(errorClass ? { error_class: errorClass } : {}),
  })
}

async function publishEvidenceClaims(
  dependencies: EvidenceWorkerDependencies,
  analysisId: string,
  findings: PublicClaimFinding[],
): Promise<void> {
  if (findings.length === 0) {
    await dependencies.appendEvent(analysisId, { type: "finding.batch", stage: "S6", findings: [] })
    return
  }
  for (let offset = 0; offset < findings.length; offset += 50) {
    await dependencies.appendEvent(analysisId, {
      type: "finding.batch",
      stage: "S6",
      findings: findings.slice(offset, offset + 50),
    })
  }
}

async function finishAtF6Boundary(
  dependencies: EvidenceWorkerDependencies,
  analysisId: string,
): Promise<void> {
  await dependencies.transitionAnalysis(analysisId, "analyzing", "partial")
  await dependencies.appendEvent(analysisId, { type: "analysis.done", status: "partial" })
}

async function finishEvidenceJob(
  dependencies: EvidenceWorkerDependencies,
  job: ClaimedAnalysisJob,
): Promise<void> {
  const nextStage = nextStageAfterS6({
    supportAssessment: true,
    argumentStructure: true,
    evidenceRetrieval: true,
    sourceCredibility: dependencies.sourceCredibilityEnabled ?? false,
  })
  if (nextStage) {
    if (!dependencies.advanceJob) {
      throw new EvidenceError(
        "EVIDENCE_STAGE_ADVANCE_UNAVAILABLE",
        "S7 handoff is unavailable.",
        true,
      )
    }
    await requireLease(dependencies.advanceJob(job.id, job.lockToken, "S6", nextStage))
    return
  }
  await finishAtF6Boundary(dependencies, job.analysisId)
  await requireLease(dependencies.completeJob(job.id, job.lockToken))
}

async function verifyClaimCandidates(
  claim: InternalClaimFinding,
  dependencies: EvidenceWorkerDependencies,
  registry: StageSchemaRegistry,
  retriever: EvidenceRetriever,
  verifier: EvidenceVerifier,
  signal: AbortSignal,
): Promise<VerifiedEvidence[]> {
  const retrieval = await runValidatedStage({
    stage: "S6",
    schemaKey: `${serverEnv.EVIDENCE_SCHEMA_VERSION}:retrieval`,
    source: claim.text,
    registry,
    maxAttempts: serverEnv.EVIDENCE_SCHEMA_MAX_ATTEMPTS,
    recordInjectionSignals: (signals) => dependencies.recordInjection(claim.analysis_id, signals),
    invoke: ({ sourceBlock }) =>
      retriever.retrieve(
        {
          claimId: claim.id,
          claimText: sourceBlock,
          maxCandidates: serverEnv.EVIDENCE_MAX_CANDIDATES_PER_CLAIM,
        },
        signal,
      ),
    transformValidated: (value) =>
      parseEvidenceCandidates(value, serverEnv.EVIDENCE_MAX_CANDIDATES_PER_CLAIM),
  })

  const verified: VerifiedEvidence[] = []
  let retryableFailure: unknown
  for (const candidate of retrieval.output) {
    try {
      const resolved = await dependencies.sourceResolver.resolve(candidate, signal)
      const source = serializeVerificationInput(claim, resolved)
      const result = await runValidatedStage<VerifiedEvidence | undefined>({
        stage: "S6",
        schemaKey: `${serverEnv.EVIDENCE_SCHEMA_VERSION}:verification`,
        source,
        registry,
        maxAttempts: serverEnv.EVIDENCE_SCHEMA_MAX_ATTEMPTS,
        recordInjectionSignals: (signals) =>
          dependencies.recordInjection(claim.analysis_id, signals),
        invoke: ({ sourceBlock }) =>
          verifier.verify(
            {
              sourceBlock,
              promptVersion: serverEnv.EVIDENCE_PROMPT_VERSION,
              schemaVersion: serverEnv.EVIDENCE_SCHEMA_VERSION,
            },
            signal,
          ),
        transformValidated: (value) => validateEvidenceVerification(value, claim, resolved),
      })
      if (result.output) verified.push(result.output)
    } catch (error) {
      const details = errorDetails(error)
      if (details.retryable) retryableFailure = error
      logger.warn("evidence.candidate_dropped", {
        analysisId: claim.analysis_id,
        claimId: claim.id,
        errorClass: details.code,
        retryable: details.retryable,
      })
    }
  }
  if (verified.length === 0 && retryableFailure) throw retryableFailure
  return verified
}

export async function processClaimedEvidenceJob(
  job: ClaimedAnalysisJob,
  dependencies: EvidenceWorkerDependencies = defaultDependencies(),
): Promise<void> {
  if (job.stage !== "S6") throw new Error(`Evidence worker cannot process ${job.stage}`)
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

  let stageRun: Awaited<ReturnType<typeof createStageAttempt>> | undefined
  let analysisActive = false
  try {
    const input = await dependencies.loadInput(job.analysisId)
    if (input.status === "partial") {
      await dependencies.transitionAnalysis(job.analysisId, "partial", "analyzing")
    }
    analysisActive = true
    const snapshot = await dependencies.getSnapshot(job.analysisId, true)
    if (snapshot?.status === "complete") {
      await requireLease(dependencies.renewJob(job.id, job.lockToken))
      const refs = await dependencies.getRefs(job.analysisId)
      const publicClaims = toTraceablePublicEvidenceClaims(
        input.claims,
        refs,
        input.validSegmentIds,
        new Set(snapshot.sources.map((source) => source.id)),
        true,
      )
      await publishEvidenceClaims(dependencies, job.analysisId, publicClaims)
      await finishEvidenceJob(dependencies, job)
      return
    }

    await dependencies.failRunningAttempts(job.analysisId, "S6")
    stageRun = await dependencies.createAttempt(job.analysisId, "S6")
    await dependencies.transitionStage(stageRun.id, "pending", "running")
    await publishStage(dependencies, job.analysisId, "running", stageRun.attempt)

    const verified: VerifiedEvidence[] = []
    if (!snapshot?.sources.length) {
      const eligible = eligibleEvidenceClaims(input.claims)
      if (eligible.length > 0) {
        const registry = new StageSchemaRegistry()
        registry.register(
          `${serverEnv.EVIDENCE_SCHEMA_VERSION}:retrieval`,
          evidenceRetrievalJsonSchema,
        )
        registry.register(
          `${serverEnv.EVIDENCE_SCHEMA_VERSION}:verification`,
          evidenceVerificationJsonSchema,
        )
        const retriever = dependencies.retrieverFactory()
        const verifier = dependencies.verifierFactory()
        for (const claim of eligible) {
          verified.push(
            ...(await verifyClaimCandidates(
              claim,
              dependencies,
              registry,
              retriever,
              verifier,
              abortController.signal,
            )),
          )
          if (leaseLost) throw new EvidenceError("WORKER_LEASE_LOST", "Worker lease lost.", true)
        }
      }
    }
    await requireLease(dependencies.renewJob(job.id, job.lockToken))
    const persisted = await dependencies.persist(
      job.analysisId,
      deduplicateVerifiedEvidence(verified),
      {
        promptVersion: serverEnv.EVIDENCE_PROMPT_VERSION,
        schemaVersion: serverEnv.EVIDENCE_SCHEMA_VERSION,
      },
      stageRun.id,
    )

    const refs = await dependencies.getRefs(job.analysisId)
    const verifiedIds = new Set(persisted.sources.map((source) => source.id))
    const publicClaims = toTraceablePublicEvidenceClaims(
      input.claims,
      refs,
      input.validSegmentIds,
      verifiedIds,
      true,
    )
    const expectedClaims = [...refs.values()].filter((ids) =>
      ids.some((id) => verifiedIds.has(id)),
    ).length
    if (publicClaims.length !== expectedClaims) {
      throw new EvidenceError(
        "EVIDENCE_TRACEABILITY_FAILED",
        "A verified evidence attachment failed the traceability gate.",
        false,
      )
    }
    await requireLease(dependencies.renewJob(job.id, job.lockToken))
    await publishStage(dependencies, job.analysisId, "complete", stageRun.attempt)
    await publishEvidenceClaims(dependencies, job.analysisId, publicClaims)
    await finishEvidenceJob(dependencies, job)
  } catch (error) {
    const details = errorDetails(error)
    logger.error("evidence_retrieval.job_failed", {
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
        logger.warn("evidence_retrieval.stage_failure_record_failed", {
          analysisId: job.analysisId,
          stageRunId: stageRun.id,
          error: stageError,
        })
      }
    }
    if (details.retryable && job.attempts < serverEnv.WORKER_MAX_ATTEMPTS) {
      const availableAt = new Date(dependencies.now().getTime() + retryDelay(job.attempts) * 1_000)
      await dependencies.appendEvent(job.analysisId, {
        type: "error",
        code: details.code,
        message: "External evidence retrieval was interrupted and will be retried.",
      })
      await dependencies.retryJob(job.id, job.lockToken, availableAt, details.code)
      return
    }
    await dependencies.appendEvent(job.analysisId, {
      type: "error",
      code: details.code,
      message: "No reliable external evidence could be verified; earlier findings were preserved.",
    })
    if (analysisActive && dependencies.advanceJob) {
      await requireLease(dependencies.advanceJob(job.id, job.lockToken, "S6", "S8"))
      return
    }
    await dependencies.failJob(job.id, job.lockToken, details.code)
  } finally {
    clearInterval(heartbeat)
  }
}

export async function processNextEvidenceJob(
  dependencies: EvidenceWorkerDependencies = defaultDependencies(),
): Promise<boolean> {
  const job = await claimAnalysisJob(serverEnv.WORKER_JOB_LEASE_SECONDS, "S6")
  if (!job) return false
  await processClaimedEvidenceJob(job, dependencies)
  return true
}
