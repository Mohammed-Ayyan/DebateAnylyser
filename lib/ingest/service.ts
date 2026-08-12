import "server-only"

import { serverEnv } from "@/lib/env/server"
import { AppError } from "@/lib/errors/app-error"
import { assertRightsGate } from "@/lib/legal/rights-gate"
import type { LegalPolicy, RightsGateInput } from "@/lib/legal/types"
import { S3ObjectStorage } from "@/lib/storage/s3-storage"
import type { ObjectStorage } from "@/lib/storage/types"
import type { AnalysisSubmission, UploadRequest } from "./contracts"
import { hashIdempotencyKey, hashSubmission } from "./contracts"
import {
  createAnalysisTransaction,
  createUploadReservation,
  deleteUploadReservation,
  findAnalysisReplay,
  findAvailableUpload,
  type AvailableUpload,
  type CreateAnalysisResult,
} from "./repository"

export type IngestRepository = {
  createUploadReservation: typeof createUploadReservation
  deleteUploadReservation: typeof deleteUploadReservation
  findAnalysisReplay: typeof findAnalysisReplay
  findAvailableUpload: typeof findAvailableUpload
  createAnalysisTransaction: typeof createAnalysisTransaction
}

export type IngestDependencies = {
  storage: ObjectStorage
  repository: IngestRepository
  now: () => Date
}

const defaultRepository: IngestRepository = {
  createUploadReservation,
  deleteUploadReservation,
  findAnalysisReplay,
  findAvailableUpload,
  createAnalysisTransaction,
}

function rightsInput(
  acceptedUseVersion: string | null,
  submission: AnalysisSubmission | UploadRequest,
): RightsGateInput {
  if ("source_type" in submission && submission.source_type === "url") {
    return {
      acceptedUseVersion,
      source: {
        type: "url",
        url: submission.url,
        rightsBasis: submission.rights_basis,
        access: submission.access,
        intendedUse: submission.intended_use,
        retrievalMethod: submission.retrieval_method,
      },
    }
  }
  const type = "source_type" in submission ? submission.source_type : "upload"
  return {
    acceptedUseVersion,
    source: {
      type,
      rightsBasis: submission.rights_basis,
      access: "unknown",
      intendedUse: submission.intended_use,
      retrievalMethod: "none",
    },
  }
}

function defaultDependencies(): IngestDependencies {
  return {
    storage: new S3ObjectStorage(),
    repository: defaultRepository,
    now: () => new Date(),
  }
}

export async function prepareUpload(
  ownerId: string,
  acceptedUseVersion: string | null,
  policy: LegalPolicy,
  request: UploadRequest,
  dependencies: IngestDependencies = defaultDependencies(),
) {
  assertRightsGate(policy, rightsInput(acceptedUseVersion, request))
  const target = await dependencies.storage.createPresignedUpload({
    ownerId,
    filename: request.filename,
    contentType: request.content_type,
    size: request.size,
    ttlSeconds: serverEnv.UPLOAD_URL_TTL_SECONDS,
  })
  try {
    await dependencies.repository.createUploadReservation({
      ownerId,
      mediaKey: target.mediaKey,
      filename: request.filename,
      contentType: request.content_type,
      size: request.size,
      expiresAt: target.expiresAt,
    })
  } catch (cause) {
    await dependencies.storage.deleteObject(target.mediaKey).catch(() => undefined)
    throw cause
  }
  return target
}

function uploadUnavailable(message: string): AppError {
  return new AppError({
    code: "UPLOAD_INVALID",
    status: 422,
    message,
    expose: true,
    publicDetails: { alternative: "Request a new upload URL and upload the file again." },
  })
}

async function verifyUpload(
  ownerId: string,
  mediaKey: string,
  dependencies: IngestDependencies,
): Promise<AvailableUpload> {
  const reservation = await dependencies.repository.findAvailableUpload(
    ownerId,
    mediaKey,
    dependencies.now(),
  )
  if (!reservation) throw uploadUnavailable("The upload reservation is missing or expired.")
  const object = await dependencies.storage.headObject(mediaKey)
  if (!object) throw uploadUnavailable("The file has not finished uploading.")
  if (
    object.size !== reservation.size ||
    object.contentType !== reservation.contentType ||
    object.metadata["owner-id"] !== ownerId
  ) {
    throw uploadUnavailable("The uploaded object does not match its reserved metadata.")
  }
  return reservation
}

function deriveTitle(submission: AnalysisSubmission, upload?: AvailableUpload): string {
  if (submission.title) return submission.title
  if (submission.source_type === "upload" && upload) {
    return upload.filename.replace(/\.[^.]+$/, "").slice(0, 200) || "Uploaded debate"
  }
  if (submission.source_type === "url") {
    try {
      return `Debate from ${new URL(submission.url).hostname}`.slice(0, 200)
    } catch {
      return "Imported debate"
    }
  }
  return "Pasted transcript"
}

export async function submitAnalysis(
  ownerId: string,
  acceptedUseVersion: string | null,
  policy: LegalPolicy & { version: string },
  submission: AnalysisSubmission,
  idempotencyKey: string | undefined,
  dependencies: IngestDependencies = defaultDependencies(),
): Promise<CreateAnalysisResult> {
  assertRightsGate(policy, rightsInput(acceptedUseVersion, submission))
  const requestHash = hashSubmission(submission)
  const idempotencyKeyHash = idempotencyKey ? hashIdempotencyKey(idempotencyKey) : undefined
  if (idempotencyKeyHash) {
    const replay = await dependencies.repository.findAnalysisReplay(
      ownerId,
      idempotencyKeyHash,
      requestHash,
      dependencies.now(),
    )
    if (replay) return replay
  }
  const upload =
    submission.source_type === "upload"
      ? await verifyUpload(ownerId, submission.media_key, dependencies)
      : undefined
  const idempotencyExpiresAt = idempotencyKeyHash
    ? new Date(dependencies.now().getTime() + serverEnv.IDEMPOTENCY_TTL_SECONDS * 1_000)
    : undefined

  return dependencies.repository.createAnalysisTransaction({
    ownerId,
    submission,
    upload,
    title: deriveTitle(submission, upload),
    requestHash,
    idempotencyKeyHash,
    idempotencyExpiresAt,
  })
}
