import "server-only"

import { sql } from "drizzle-orm"

import { getDatabase } from "@/lib/db/client"
import type { OperationType } from "./selection"

export type ClaimedOperationJob = {
  id: string
  type: OperationType
  ownerId: string | null
  analysisId: string | null
  payload: Record<string, unknown>
  attempts: number
  lockToken: string
}

export type DueRetentionSchedule = {
  analysisId: string
  ownerId: string
}

export async function claimDueRetentionSchedule(): Promise<DueRetentionSchedule | undefined> {
  const result = await getDatabase().execute(sql`
    with candidate as (
      select schedule.id
      from retention_schedules schedule
      join analyses analysis on analysis.id = schedule.analysis_id
      where schedule.status = 'scheduled'
        and schedule.due_at <= now()
        and analysis.deleted_at is null
        and (schedule.retention_setting <> 'delete_on_complete' or analysis.status = 'complete')
      order by schedule.due_at, schedule.id
      for update of schedule skip locked
      limit 1
    )
    update retention_schedules schedule
    set status = 'processing', updated_at = now()
    from candidate, analyses analysis
    where schedule.id = candidate.id and analysis.id = schedule.analysis_id
    returning schedule.analysis_id, analysis.owner_id
  `)
  const row = result[0] as { analysis_id: string; owner_id: string } | undefined
  return row ? { analysisId: row.analysis_id, ownerId: row.owner_id } : undefined
}

export async function claimOperationJob(
  leaseSeconds: number,
): Promise<ClaimedOperationJob | undefined> {
  const result = await getDatabase().execute(sql`
    with candidate as (
      select job.id
      from operation_jobs job
      where job.available_at <= now()
        and job.type in ('analysis_cleanup', 'account_cleanup', 'report_export', 'account_data_export')
        and (
          job.status = 'queued'
          or (job.status = 'processing' and job.locked_at < now() - (${leaseSeconds} * interval '1 second'))
        )
        and (
          (job.type = 'analysis_cleanup' and exists (
            select 1 from analyses where analyses.id = job.analysis_id and analyses.deleted_at is not null
          ))
          or (job.type = 'account_cleanup' and exists (
            select 1 from users where users.id = job.owner_id and users.deleted_at is not null
          ))
          or (job.type = 'report_export' and exists (
            select 1 from exports export
            join analyses analysis on analysis.id = export.analysis_id
            where export.id = (job.payload->>'export_id')::uuid
              and export.owner_id = job.owner_id and export.kind = 'report_html'
              and export.status in ('queued', 'processing') and analysis.deleted_at is null
          ))
          or (job.type = 'account_data_export' and exists (
            select 1 from exports export
            join users owner on owner.id = export.owner_id
            where export.id = (job.payload->>'export_id')::uuid
              and export.owner_id = job.owner_id and export.kind = 'account_data_json'
              and export.status in ('queued', 'processing') and owner.deleted_at is null
          ))
        )
      order by case job.type
        when 'analysis_cleanup' then 0
        when 'account_cleanup' then 1
        else 2
      end,
        job.available_at, job.created_at, job.id
      for update of job skip locked
      limit 1
    )
    update operation_jobs job
    set status = 'processing', attempts = job.attempts + 1,
        locked_at = now(), lock_token = gen_random_uuid(), updated_at = now()
    from candidate
    where job.id = candidate.id
    returning job.id, job.type, job.owner_id, job.analysis_id, job.payload,
      job.attempts, job.lock_token
  `)
  const row = result[0] as
    | {
        id: string
        type: OperationType
        owner_id: string | null
        analysis_id: string | null
        payload: Record<string, unknown>
        attempts: number
        lock_token: string
      }
    | undefined
  return row
    ? {
        id: row.id,
        type: row.type,
        ownerId: row.owner_id,
        analysisId: row.analysis_id,
        payload: row.payload,
        attempts: row.attempts,
        lockToken: row.lock_token,
      }
    : undefined
}

export async function completeOperationJob(id: string, lockToken: string): Promise<boolean> {
  const result = await getDatabase().execute(sql`
    update operation_jobs set status = 'complete', locked_at = null, lock_token = null,
      updated_at = now()
    where id = ${id}::uuid and status = 'processing' and lock_token = ${lockToken}::uuid
    returning id
  `)
  return result.length === 1
}

export async function retryOperationJob(
  id: string,
  lockToken: string,
  availableAt: Date,
  errorClass: string,
): Promise<boolean> {
  const result = await getDatabase().execute(sql`
    update operation_jobs set status = 'queued', available_at = ${availableAt},
      last_error_class = ${errorClass}, locked_at = null, lock_token = null, updated_at = now()
    where id = ${id}::uuid and status = 'processing' and lock_token = ${lockToken}::uuid
    returning id
  `)
  return result.length === 1
}

export async function failOperationJob(
  id: string,
  lockToken: string,
  errorClass: string,
): Promise<boolean> {
  const result = await getDatabase().execute(sql`
    update operation_jobs set status = 'failed', last_error_class = ${errorClass},
      locked_at = null, lock_token = null, updated_at = now()
    where id = ${id}::uuid and status = 'processing' and lock_token = ${lockToken}::uuid
    returning id
  `)
  return result.length === 1
}

export async function releaseRetentionSchedule(analysisId: string): Promise<void> {
  await getDatabase().execute(sql`
    update retention_schedules set status = 'scheduled', updated_at = now()
    where analysis_id = ${analysisId}::uuid and status = 'processing'
  `)
}
