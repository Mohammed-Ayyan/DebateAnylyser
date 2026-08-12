import "server-only"

import { sql } from "drizzle-orm"

import type { PipelineStage } from "@/lib/contracts/analysis"
import { getDatabase } from "@/lib/db/client"

export type ClaimedAnalysisJob = {
  id: string
  analysisId: string
  stage: PipelineStage
  attempts: number
  lockToken: string
  lockedAt: Date
}

export async function claimAnalysisJob(
  leaseSeconds: number,
  stage?: PipelineStage | readonly PipelineStage[],
): Promise<ClaimedAnalysisJob | undefined> {
  const stages = stage === undefined ? undefined : typeof stage === "string" ? [stage] : stage
  const acceptAllStages = stages === undefined
  const acceptS1 = stages?.includes("S1") ?? false
  const acceptS2 = stages?.includes("S2") ?? false
  const acceptS3 = stages?.includes("S3") ?? false
  const acceptS4 = stages?.includes("S4") ?? false
  const acceptS5 = stages?.includes("S5") ?? false
  const acceptS6 = stages?.includes("S6") ?? false
  const acceptS7 = stages?.includes("S7") ?? false
  const acceptS8 = stages?.includes("S8") ?? false
  const acceptS9 = stages?.includes("S9") ?? false
  const acceptS10 = stages?.includes("S10") ?? false
  const result = await getDatabase().execute(sql`
    with candidate as (
      select job.id
      from analysis_jobs job
      join analyses analysis on analysis.id = job.analysis_id
      where job.available_at <= now()
        and analysis.deleted_at is null
        and (
          ${acceptAllStages}
          or (${acceptS1} and job.stage = 'S1')
          or (${acceptS2} and job.stage = 'S2')
          or (${acceptS3} and job.stage = 'S3')
          or (${acceptS4} and job.stage = 'S4')
          or (${acceptS5} and job.stage = 'S5')
          or (${acceptS6} and job.stage = 'S6')
          or (${acceptS7} and job.stage = 'S7')
          or (${acceptS8} and job.stage = 'S8')
          or (${acceptS9} and job.stage = 'S9')
          or (${acceptS10} and job.stage = 'S10')
        )
        and (
          job.status = 'queued'
          or (job.status = 'processing' and job.locked_at < now() - (${leaseSeconds} * interval '1 second'))
        )
      order by job.available_at, job.created_at
      for update of job skip locked
      limit 1
    )
    update analysis_jobs as job
    set status = 'processing',
        attempts = job.attempts + 1,
        locked_at = now(),
        lock_token = gen_random_uuid(),
        updated_at = now()
    from candidate
    where job.id = candidate.id
    returning job.id, job.analysis_id, job.stage, job.attempts, job.lock_token, job.locked_at
  `)
  const row = result[0] as
    | {
        id: string
        analysis_id: string
        stage: PipelineStage
        attempts: number
        lock_token: string
        locked_at: Date
      }
    | undefined

  if (!row) return undefined
  return {
    id: row.id,
    analysisId: row.analysis_id,
    stage: row.stage,
    attempts: row.attempts,
    lockToken: row.lock_token,
    lockedAt: row.locked_at,
  }
}

export async function renewAnalysisJobLease(id: string, lockToken: string): Promise<boolean> {
  const result = await getDatabase().execute(sql`
    update analysis_jobs
    set locked_at = now(), updated_at = now()
    where id = ${id} and status = 'processing' and lock_token = ${lockToken}::uuid
    returning id
  `)
  return result.length === 1
}

export async function advanceAnalysisJobStage(
  id: string,
  lockToken: string,
  expectedStage: PipelineStage,
  nextStage: PipelineStage,
): Promise<boolean> {
  const result = await getDatabase().execute(sql`
    update analysis_jobs
    set status = 'queued', stage = ${nextStage}::pipeline_stage, attempts = 0,
        available_at = now(), last_error_class = null,
        locked_at = null, lock_token = null, updated_at = now()
    where id = ${id} and status = 'processing' and lock_token = ${lockToken}::uuid
      and stage = ${expectedStage}::pipeline_stage
    returning id
  `)
  return result.length === 1
}

export async function completeAnalysisJob(id: string, lockToken: string): Promise<boolean> {
  const result = await getDatabase().execute(sql`
    update analysis_jobs
    set status = 'complete', locked_at = null, lock_token = null, updated_at = now()
    where id = ${id} and status = 'processing' and lock_token = ${lockToken}::uuid
    returning id
  `)
  return result.length === 1
}

export async function retryAnalysisJob(
  id: string,
  lockToken: string,
  availableAt: Date,
  errorClass: string,
): Promise<boolean> {
  const result = await getDatabase().execute(sql`
    update analysis_jobs
    set status = 'queued', available_at = ${availableAt.toISOString()}::timestamptz, last_error_class = ${errorClass},
        locked_at = null, lock_token = null, updated_at = now()
    where id = ${id} and status = 'processing' and lock_token = ${lockToken}::uuid
    returning id
  `)
  return result.length === 1
}

export async function failAnalysisJob(
  id: string,
  lockToken: string,
  errorClass: string,
): Promise<boolean> {
  const result = await getDatabase().execute(sql`
    update analysis_jobs
    set status = 'failed', last_error_class = ${errorClass},
        locked_at = null, lock_token = null, updated_at = now()
    where id = ${id} and status = 'processing' and lock_token = ${lockToken}::uuid
    returning id
  `)
  return result.length === 1
}
