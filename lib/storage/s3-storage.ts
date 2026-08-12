import "server-only"

import { randomUUID } from "node:crypto"

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

import { requireServerEnv, serverEnv } from "@/lib/env/server"
import { AppError } from "@/lib/errors/app-error"
import type {
  ImmutableObjectWrite,
  ObjectStorage,
  PresignedUpload,
  PresignedUploadRequest,
  StoredObject,
} from "./types"

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function safeSegment(value: string, label: string): string {
  if (!uuidPattern.test(value)) throw new Error(`${label} must be a UUID.`)
  return value.toLowerCase()
}

function safeFilename(filename: string): string {
  const basename = filename.replaceAll("\\", "/").split("/").at(-1) ?? ""
  const normalized = basename
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}._-]/gu, "_")
    .slice(0, 180)
  if (!normalized || normalized === "." || normalized === "..") {
    throw new Error("Artifact filename is invalid.")
  }
  return encodeURIComponent(normalized).replaceAll("%", "_")
}

function storageConfiguration() {
  const { OBJECT_STORAGE_BUCKET } = requireServerEnv("OBJECT_STORAGE_BUCKET")
  const accessKeyId = serverEnv.OBJECT_STORAGE_ACCESS_KEY_ID
  const secretAccessKey = serverEnv.OBJECT_STORAGE_SECRET_ACCESS_KEY
  if (Boolean(accessKeyId) !== Boolean(secretAccessKey)) {
    throw new Error("Both object-storage credential fields must be configured together.")
  }
  return {
    bucket: OBJECT_STORAGE_BUCKET,
    client: {
      region: serverEnv.OBJECT_STORAGE_REGION,
      endpoint: serverEnv.OBJECT_STORAGE_ENDPOINT,
      forcePathStyle: serverEnv.OBJECT_STORAGE_FORCE_PATH_STYLE,
      ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {}),
    },
  }
}

export function createUploadKey(ownerId: string, filename: string): string {
  return `uploads/${safeSegment(ownerId, "ownerId")}/${randomUUID()}/${safeFilename(filename)}`
}

export function createAnalysisArtifactKey(
  ownerId: string,
  analysisId: string,
  filename: string,
): string {
  return `artifacts/${safeSegment(ownerId, "ownerId")}/analyses/${safeSegment(analysisId, "analysisId")}/${randomUUID()}/${safeFilename(filename)}`
}

export function createOwnerArtifactKey(ownerId: string, filename: string): string {
  return `artifacts/${safeSegment(ownerId, "ownerId")}/account/${randomUUID()}/${safeFilename(filename)}`
}

export class S3ObjectStorage implements ObjectStorage {
  async createPresignedUpload(request: PresignedUploadRequest): Promise<PresignedUpload> {
    const config = storageConfiguration()
    const client = new S3Client(config.client)
    const mediaKey = createUploadKey(request.ownerId, request.filename)
    const expiresAt = new Date(Date.now() + request.ttlSeconds * 1_000)
    try {
      const uploadUrl = await getSignedUrl(
        client,
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: mediaKey,
          ContentType: request.contentType,
          ContentLength: request.size,
          Metadata: {
            "owner-id": request.ownerId,
            "original-filename": encodeURIComponent(request.filename),
          },
        }),
        { expiresIn: request.ttlSeconds },
      )
      return { uploadUrl, mediaKey, expiresAt }
    } catch (cause) {
      throw new AppError({
        code: "STORAGE_UNAVAILABLE",
        status: 503,
        message: "Upload storage is temporarily unavailable.",
        expose: true,
        retryable: true,
        cause,
      })
    }
  }

  async createPresignedDownload(mediaKey: string, ttlSeconds: number): Promise<string> {
    const config = storageConfiguration()
    try {
      return await getSignedUrl(
        new S3Client(config.client),
        new GetObjectCommand({ Bucket: config.bucket, Key: mediaKey }),
        { expiresIn: ttlSeconds },
      )
    } catch (cause) {
      throw new AppError({
        code: "STORAGE_UNAVAILABLE",
        status: 503,
        message: "Source storage is temporarily unavailable.",
        expose: true,
        retryable: true,
        cause,
      })
    }
  }

  async writeImmutableObject(request: ImmutableObjectWrite): Promise<void> {
    const config = storageConfiguration()
    try {
      await new S3Client(config.client).send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: request.mediaKey,
          Body: request.bytes,
          ContentLength: request.bytes.byteLength,
          ContentType: request.contentType,
          Metadata: request.metadata,
          IfNoneMatch: "*",
        }),
      )
    } catch (cause) {
      const status = (cause as { $metadata?: { httpStatusCode?: number } }).$metadata
        ?.httpStatusCode
      if (status === 409 || status === 412) {
        throw new AppError({
          code: "IMMUTABLE_OBJECT_EXISTS",
          status: 409,
          message: "The immutable artifact already exists.",
          expose: true,
          cause,
        })
      }
      throw new AppError({
        code: "STORAGE_UNAVAILABLE",
        status: 503,
        message: "Artifact storage is temporarily unavailable.",
        expose: true,
        retryable: true,
        cause,
      })
    }
  }

  async readObject(mediaKey: string, maxBytes: number): Promise<Uint8Array> {
    const config = storageConfiguration()
    try {
      const result = await new S3Client(config.client).send(
        new GetObjectCommand({ Bucket: config.bucket, Key: mediaKey }),
      )
      if ((result.ContentLength ?? 0) > maxBytes) {
        throw new AppError({
          code: "SOURCE_TOO_LARGE",
          status: 422,
          message: "The text source exceeds the extraction limit.",
          expose: true,
        })
      }
      if (!result.Body) throw new Error("Object storage returned an empty response body.")
      const bytes = await result.Body.transformToByteArray()
      if (bytes.byteLength > maxBytes) {
        throw new AppError({
          code: "SOURCE_TOO_LARGE",
          status: 422,
          message: "The text source exceeds the extraction limit.",
          expose: true,
        })
      }
      return bytes
    } catch (cause) {
      if (cause instanceof AppError) throw cause
      throw new AppError({
        code: "STORAGE_UNAVAILABLE",
        status: 503,
        message: "The source object could not be read.",
        expose: true,
        retryable: true,
        cause,
      })
    }
  }

  async headObject(mediaKey: string): Promise<StoredObject | null> {
    const config = storageConfiguration()
    try {
      const result = await new S3Client(config.client).send(
        new HeadObjectCommand({ Bucket: config.bucket, Key: mediaKey }),
      )
      return {
        contentType: result.ContentType ?? null,
        size: result.ContentLength ?? null,
        metadata: result.Metadata ?? {},
      }
    } catch (cause) {
      const status = (cause as { $metadata?: { httpStatusCode?: number } }).$metadata
        ?.httpStatusCode
      if (status === 404) return null
      throw new AppError({
        code: "STORAGE_UNAVAILABLE",
        status: 503,
        message: "Upload storage could not be verified.",
        expose: true,
        retryable: true,
        cause,
      })
    }
  }

  async deleteObject(mediaKey: string): Promise<void> {
    const config = storageConfiguration()
    try {
      await new S3Client(config.client).send(
        new DeleteObjectCommand({ Bucket: config.bucket, Key: mediaKey }),
      )
    } catch (cause) {
      throw new AppError({
        code: "STORAGE_UNAVAILABLE",
        status: 503,
        message: "Upload cleanup could not be completed.",
        expose: true,
        retryable: true,
        cause,
      })
    }
  }
}
