import { loadEnvFile } from "node:process"
loadEnvFile(".env.local")

async function main(): Promise<void> {
  const { eq, sql, desc } = await import("drizzle-orm")
  const schema = await import("../lib/db/schema")
  const { getDatabase } = await import("../lib/db/client")
  const db = getDatabase()

  // Find the most recent "Pasted transcript" that failed at S2
  const [analysis] = await db
    .select({ id: schema.analyses.id, title: schema.analyses.title, status: schema.analyses.status })
    .from(schema.analyses)
    .where(eq(schema.analyses.title, "Pasted transcript"))
    .orderBy(desc(schema.analyses.createdAt))
    .limit(1)
  if (!analysis) { console.log("NO_MATCHING_ANALYSIS"); process.exit(1) }
  console.log(`TARGET: ${analysis.id} | ${analysis.title} | ${analysis.status}`)

  // Check current job state
  const [job] = await db
    .select({ id: schema.analysisJobs.id, stage: schema.analysisJobs.stage, status: schema.analysisJobs.status, attempts: schema.analysisJobs.attempts })
    .from(schema.analysisJobs)
    .where(eq(schema.analysisJobs.analysisId, analysis.id))
    .limit(1)
  console.log(`CURRENT_JOB: stage=${job?.stage} status=${job?.status} attempts=${job?.attempts}`)

  if (job?.stage !== "S2" || job?.status !== "failed") {
    console.log("JOB_NOT_IN_EXPECTED_STATE")
    process.exit(1)
  }

  // Reset job to queued with 0 attempts
  await db.execute(sql`
    UPDATE analysis_jobs
    SET status = 'queued', attempts = 0, available_at = now(),
        last_error_class = NULL, locked_at = NULL, lock_token = NULL, updated_at = now()
    WHERE analysis_id = ${analysis.id}
  `)

  // Also reset analysis status back to "analyzing" if it was "failed"
  if (analysis.status === "failed") {
    await db.execute(sql`
      UPDATE analyses SET status = 'analyzing', updated_at = now()
      WHERE id = ${analysis.id}
    `)
    console.log("ANALYSIS_STATUS_RESET_TO_ANALYZING")
  }

  console.log("JOB_RESET_TO_QUEUED_S2")

  // Now run the worker once to process this job
  const { processNextAnalysisJob } = await import("../lib/analysis/worker")
  console.log("RUNNING_WORKER...")
  const processed = await processNextAnalysisJob()
  console.log(`WORKER_PROCESSED: ${processed}`)

  if (!processed) {
    // Try once more in case of timing
    await new Promise(r => setTimeout(r, 1000))
    const processed2 = await processNextAnalysisJob()
    console.log(`WORKER_PROCESSED_RETRY: ${processed2}`)
  }

  // Check result
  const [updatedJob] = await db
    .select({ stage: schema.analysisJobs.stage, status: schema.analysisJobs.status, lastErrorClass: schema.analysisJobs.lastErrorClass, attempts: schema.analysisJobs.attempts })
    .from(schema.analysisJobs)
    .where(eq(schema.analysisJobs.analysisId, analysis.id))
    .limit(1)
  console.log(`RESULT_JOB: stage=${updatedJob?.stage} status=${updatedJob?.status} error=${updatedJob?.lastErrorClass ?? "none"} attempts=${updatedJob?.attempts}`)

  // Check S2 stage run
  const { asc } = await import("drizzle-orm")
  const runs = await db
    .select({ stage: schema.analysisStageRuns.stage, status: schema.analysisStageRuns.status, attempt: schema.analysisStageRuns.attempt, errorClass: schema.analysisStageRuns.errorClass })
    .from(schema.analysisStageRuns)
    .where(eq(schema.analysisStageRuns.analysisId, analysis.id))
    .orderBy(asc(schema.analysisStageRuns.attempt))
  const s2Runs = runs.filter(r => r.stage === "S2")
  console.log(`S2_RUNS: ${JSON.stringify(s2Runs)}`)

  // Check if claims were persisted
  const { getClaimStageSnapshot } = await import("../lib/claims/repository")
  const snapshot = await getClaimStageSnapshot(analysis.id)
  console.log(`S2_SNAPSHOT: status=${snapshot?.status} findings=${snapshot?.findings.length ?? 0}`)

  process.exit(0)
}

void main().catch((e) => { console.error(e instanceof Error ? e.message : "FAILED"); process.exit(1) })
