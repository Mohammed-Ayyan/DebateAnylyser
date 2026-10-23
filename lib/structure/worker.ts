import "server-only"

import { createStageAttempt, transitionAnalysisStatus } from "@/lib/analysis/lifecycle-repository"
import { failRunningStageAttempts, transitionStageRun } from "@/lib/analysis/stage-run-repository"
import { nextStageAfterS4 } from "@/lib/analysis/stage-routing"
import { recordInjectionFlags } from "@/lib/ai/injection-flag-repository"
import { StageOutputValidationError, runValidatedStage } from "@/lib/ai/stage-runner"
import { StageSchemaRegistry } from "@/lib/ai/schema-registry"
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
  StructureMappingError,
  structureMappingJsonSchema,
  type StructureMappingProvider,
  type ValidatedStructureGraph,
} from "./contracts"
import { prepareStructureCalls, validateStructureMappings } from "./mapping"
import { OllamaStructureMappingProvider } from "./ollama-provider"
import { OpenAIStructureMappingProvider } from "./openai-provider"
import { toTraceablePublicStructure, type PublicStructureGraph } from "./public-structure"
import { getStructureStageSnapshot, loadStructureInput, persistStructureGraphs } from "./repository"

export type StructureWorkerDependencies = {
  providerFactory: () => StructureMappingProvider
  renewJob: typeof renewAnalysisJobLease
  advanceJob: typeof advanceAnalysisJobStage
  completeJob: typeof completeAnalysisJob
  retryJob: typeof retryAnalysisJob
  failJob: typeof failAnalysisJob
  loadInput: typeof loadStructureInput
  getSnapshot: typeof getStructureStageSnapshot
  persist: typeof persistStructureGraphs
  failRunningAttempts: typeof failRunningStageAttempts
  createAttempt: typeof createStageAttempt
  transitionStage: typeof transitionStageRun
  transitionAnalysis: typeof transitionAnalysisStatus
  appendEvent: typeof appendAnalysisEvent
  recordInjection: typeof recordInjectionFlags
  evidenceRetrievalEnabled: boolean
  fallacyDetectionEnabled?: boolean
  now: () => Date
}

function createDefaultProvider(): StructureMappingProvider {
  if (!serverEnv.ARGUMENT_STRUCTURE_ENABLED) {
    throw new StructureMappingError(
      "ARGUMENT_STRUCTURE_DISABLED",
      "Argument structure mapping is disabled.",
      false,
    )
  }
  if (serverEnv.STRUCTURE_PROVIDER === "ollama") {
    return new OllamaStructureMappingProvider({
      baseUrl: serverEnv.OLLAMA_BASE_URL,
      model: serverEnv.OLLAMA_MODEL,
      numCtx: serverEnv.OLLAMA_NUM_CTX,
      numGpu: serverEnv.OLLAMA_NUM_GPU,
      timeoutMs: serverEnv.OLLAMA_REQUEST_TIMEOUT_MS,
    })
  }
  const { GROQ_API_KEY } = requireServerEnv("GROQ_API_KEY")
  return new OpenAIStructureMappingProvider({
    apiKey: GROQ_API_KEY,
    apiUrl: serverEnv.OPENAI_RESPONSES_URL,
    model: serverEnv.STRUCTURE_MODEL,
    timeoutMs: serverEnv.STRUCTURE_REQUEST_TIMEOUT_MS,
    maxOutputTokens: serverEnv.STRUCTURE_MAX_OUTPUT_TOKENS,
  })
}

function defaultDependencies(): StructureWorkerDependencies {
  return {
    providerFactory: createDefaultProvider,
    renewJob: renewAnalysisJobLease,
    advanceJob: advanceAnalysisJobStage,
    completeJob: completeAnalysisJob,
    retryJob: retryAnalysisJob,
    failJob: failAnalysisJob,
    loadInput: loadStructureInput,
    getSnapshot: getStructureStageSnapshot,
    persist: persistStructureGraphs,
    failRunningAttempts: failRunningStageAttempts,
    createAttempt: createStageAttempt,
    transitionStage: transitionStageRun,
    transitionAnalysis: transitionAnalysisStatus,
    appendEvent: appendAnalysisEvent,
    recordInjection: recordInjectionFlags,
    evidenceRetrievalEnabled: serverEnv.EVIDENCE_RETRIEVAL_ENABLED,
    fallacyDetectionEnabled: serverEnv.FALLACY_DETECTION_ENABLED,
    now: () => new Date(),
  }
}

function errorDetails(error: unknown): { code: string; retryable: boolean } {
  if (error instanceof StructureMappingError)
    return { code: error.code, retryable: error.retryable }
  if (error instanceof StageOutputValidationError) {
    return { code: "STRUCTURE_OUTPUT_VALIDATION_FAILED", retryable: true }
  }
  return { code: "STRUCTURE_MAPPING_INTERNAL_ERROR", retryable: true }
}

function retryDelay(attempt: number): number {
  return Math.min(900, 30 * 2 ** Math.max(0, attempt - 1))
}

async function requireLease(result: Promise<boolean>): Promise<void> {
  if (!(await result)) {
    throw new StructureMappingError("WORKER_LEASE_LOST", "The worker lease was lost.", true)
  }
}

async function publishStage(
  dependencies: StructureWorkerDependencies,
  analysisId: string,
  status: "running" | "complete" | "failed",
  attempt: number,
  errorClass?: string,
): Promise<void> {
  await dependencies.appendEvent(analysisId, {
    type: "stage.status",
    stage: "S4",
    status,
    attempt,
    ...(errorClass ? { error_class: errorClass } : {}),
  })
}

async function publishStructure(
  dependencies: StructureWorkerDependencies,
  analysisId: string,
  graph: PublicStructureGraph,
): Promise<void> {
  if (graph.findings.length === 0) {
    await dependencies.appendEvent(analysisId, {
      type: "finding.batch",
      stage: "S4",
      findings: [],
      structure_edges: [],
    })
    return
  }
  for (let offset = 0; offset < graph.findings.length; offset += 50) {
    const findings = graph.findings.slice(offset, offset + 50)
    const ids = new Set(findings.map((finding) => finding.id))
    await dependencies.appendEvent(analysisId, {
      type: "finding.batch",
      stage: "S4",
      findings,
      structure_edges: graph.edges.filter((edge) => ids.has(edge.to_finding_id)),
    })
  }
}

async function finishAtF5Boundary(
  dependencies: StructureWorkerDependencies,
  analysisId: string,
): Promise<void> {
  await dependencies.transitionAnalysis(analysisId, "analyzing", "partial")
  await dependencies.appendEvent(analysisId, { type: "analysis.done", status: "partial" })
}

async function finishStructureJob(
  dependencies: StructureWorkerDependencies,
  job: ClaimedAnalysisJob,
): Promise<void> {
  const nextStage = nextStageAfterS4({
    supportAssessment: true,
    argumentStructure: true,
    fallacyDetection: dependencies.fallacyDetectionEnabled ?? false,
    evidenceRetrieval: dependencies.evidenceRetrievalEnabled,
  })
  if (nextStage) {
    await requireLease(dependencies.advanceJob(job.id, job.lockToken, "S4", nextStage))
    return
  }
  await finishAtF5Boundary(dependencies, job.analysisId)
  await requireLease(dependencies.completeJob(job.id, job.lockToken))
}

export async function processClaimedStructureJob(
  job: ClaimedAnalysisJob,
  dependencies: StructureWorkerDependencies = defaultDependencies(),
): Promise<void> {
  if (job.stage !== "S4") throw new Error(`Structure worker cannot process ${job.stage}`)
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
  pipelineLog("S4", "START", "", { analysisId: job.analysisId, attempt: job.attempts })
  let stageRun: Awaited<ReturnType<typeof createStageAttempt>> | undefined
  let analysisActive = false
  try {
    const input = await dependencies.loadInput(job.analysisId)
    pipelineLog("S4", "INPUT", "", { segments: input.segments.length })
    if (input.status === "partial") {
      await dependencies.transitionAnalysis(job.analysisId, "partial", "analyzing")
    }
    analysisActive = true
    const validSegmentIds = new Set(input.segments.map((segment) => segment.id))
    const snapshot = await dependencies.getSnapshot(job.analysisId, true)
    if (snapshot?.status === "complete") {
      await requireLease(dependencies.renewJob(job.id, job.lockToken))
      await publishStructure(
        dependencies,
        job.analysisId,
        toTraceablePublicStructure(snapshot.findings, snapshot.edges, validSegmentIds),
      )
      await finishStructureJob(dependencies, job)
      return
    }

    await dependencies.failRunningAttempts(job.analysisId, "S4")
    stageRun = await dependencies.createAttempt(job.analysisId, "S4")
    await dependencies.transitionStage(stageRun.id, "pending", "running")
    await publishStage(dependencies, job.analysisId, "running", stageRun.attempt)

    let persisted = snapshot?.findings.length
      ? { created: false, findings: snapshot.findings, edges: snapshot.edges }
      : undefined
    if (!persisted) {
      const prepared = prepareStructureCalls(
        input,
        serverEnv.STRUCTURE_CONTEXT_MAX_CHARS,
        serverEnv.STRUCTURE_MAX_CLAIMS_PER_CALL,
      )
      const graphs: ValidatedStructureGraph[] = [...prepared.deterministic]
      if (prepared.calls.length > 0) {
        const registry = new StageSchemaRegistry()
        registry.register(serverEnv.STRUCTURE_SCHEMA_VERSION, structureMappingJsonSchema)
        const provider = dependencies.providerFactory()
        for (const call of prepared.calls) {
          pipelineLog("S4", "PROVIDER", "Sending request", { model: serverEnv.STRUCTURE_MODEL })
          const _callStart = pipelineNow()
          const result = await runValidatedStage<ValidatedStructureGraph[]>({
            stage: "S4",
            schemaKey: serverEnv.STRUCTURE_SCHEMA_VERSION,
            source: call.source,
            registry,
            maxAttempts: serverEnv.STRUCTURE_SCHEMA_MAX_ATTEMPTS,
            recordInjectionSignals: (signals) =>
              dependencies.recordInjection(job.analysisId, signals),
            invoke: ({ sourceBlock }) =>
              provider.map(
                {
                  sourceBlock,
                  promptVersion: serverEnv.STRUCTURE_PROMPT_VERSION,
                  schemaVersion: serverEnv.STRUCTURE_SCHEMA_VERSION,
                  maxClaims: serverEnv.STRUCTURE_MAX_CLAIMS_PER_CALL,
                  maxNodesPerClaim: serverEnv.STRUCTURE_MAX_NODES_PER_CLAIM,
                  maxEdgesPerClaim: serverEnv.STRUCTURE_MAX_EDGES_PER_CLAIM,
                },
                abortController.signal,
              ),
            transformValidated: (candidate) =>
              validateStructureMappings(candidate, call, {
                maxNodesPerClaim: serverEnv.STRUCTURE_MAX_NODES_PER_CLAIM,
                maxEdgesPerClaim: serverEnv.STRUCTURE_MAX_EDGES_PER_CLAIM,
              }),
          })
          graphs.push(...result.output)
          pipelineLog("S4", "PROVIDER", "Response received", {
            elapsed: pipelineElapsed(_callStart),
          })
          if (leaseLost) {
            throw new StructureMappingError("WORKER_LEASE_LOST", "The worker lease was lost.", true)
          }
        }
      }
      persisted = await dependencies.persist(job.analysisId, graphs, {
        promptVersion: serverEnv.STRUCTURE_PROMPT_VERSION,
        schemaVersion: serverEnv.STRUCTURE_SCHEMA_VERSION,
      })
    }

    const publicGraph = toTraceablePublicStructure(
      persisted.findings,
      persisted.edges,
      validSegmentIds,
    )
    if (publicGraph.findings.length !== persisted.findings.length) {
      throw new StructureMappingError(
        "STRUCTURE_TRACEABILITY_FAILED",
        "An argument structure node failed the traceability gate.",
        false,
      )
    }
    pipelineLog("S4", "VALIDATION", "Schema validation passed", {
      findings: publicGraph.findings.length,
    })
    pipelineLog("S4", "DB", "Persisting", {
      findings: publicGraph.findings.length,
      edges: publicGraph.edges.length,
    })
    await requireLease(dependencies.renewJob(job.id, job.lockToken))
    await dependencies.transitionStage(stageRun.id, "running", "complete")
    await publishStage(dependencies, job.analysisId, "complete", stageRun.attempt)
    await publishStructure(dependencies, job.analysisId, publicGraph)
    pipelineLog("S4", "DB", "Persistence complete", {})
    await finishStructureJob(dependencies, job)
    pipelineLog("S4", "COMPLETE", "", { duration: pipelineElapsed(_pipelineStart) })
  } catch (error) {
    const details = errorDetails(error)
    pipelineLog("S4", "ERROR", "", { code: details.code, retryable: details.retryable })
    logger.error("argument_structure.job_failed", {
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
        logger.warn("argument_structure.stage_failure_record_failed", {
          analysisId: job.analysisId,
          stageRunId: stageRun.id,
          error: stageError,
        })
      }
    }

    if (details.retryable && job.attempts < serverEnv.WORKER_MAX_ATTEMPTS) {
      const availableAt = new Date(dependencies.now().getTime() + retryDelay(job.attempts) * 1_000)
      pipelineLog("S4", "RETRY", "", {
        attempt: `${job.attempts + 1}/${serverEnv.WORKER_MAX_ATTEMPTS}`,
        delaySeconds: retryDelay(job.attempts),
      })
      await dependencies.appendEvent(job.analysisId, {
        type: "error",
        code: details.code,
        message: "Argument structure mapping was interrupted and will be retried.",
      })
      await dependencies.retryJob(job.id, job.lockToken, availableAt, details.code)
      return
    }
    await dependencies.appendEvent(job.analysisId, {
      type: "error",
      code: details.code,
      message: "Argument structure could not be mapped reliably; earlier findings were preserved.",
    })
    if (analysisActive && dependencies.evidenceRetrievalEnabled) {
      await requireLease(dependencies.advanceJob(job.id, job.lockToken, "S4", "S6"))
      return
    }
    if (analysisActive) {
      try {
        await finishAtF5Boundary(dependencies, job.analysisId)
      } catch (boundaryError) {
        logger.warn("argument_structure.partial_boundary_failed", {
          analysisId: job.analysisId,
          originalErrorClass: details.code,
          error: boundaryError,
        })
      }
    }
    await dependencies.failJob(job.id, job.lockToken, details.code)
  } finally {
    clearInterval(heartbeat)
  }
}

export async function processNextStructureJob(
  dependencies: StructureWorkerDependencies = defaultDependencies(),
): Promise<boolean> {
  const job = await claimAnalysisJob(serverEnv.WORKER_JOB_LEASE_SECONDS, "S4")
  if (!job) return false
  await processClaimedStructureJob(job, dependencies)
  return true
}
