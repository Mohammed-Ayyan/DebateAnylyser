import { createHash } from "node:crypto"

import { z } from "zod"

import { AppError } from "@/lib/errors/app-error"

export const rightsBasisSchema = z.enum([
  "owned",
  "permission",
  "public_domain",
  "licensed",
  "unknown",
])
export const intendedUseSchema = z.enum([
  "education",
  "research",
  "journalism",
  "personal_review",
  "harassment",
  "persuasion_optimization",
  "other",
])
const retentionSchema = z.enum(["keep", "30d", "90d", "delete_on_complete"])
const common = {
  rights_basis: rightsBasisSchema,
  intended_use: intendedUseSchema,
  title: z.string().trim().min(1).max(200).optional(),
  retention_setting: retentionSchema.default("keep"),
}

export const ALLOWED_UPLOADS = Object.freeze([
  { extension: ".txt", contentType: "text/plain" },
  { extension: ".pdf", contentType: "application/pdf" },
  {
    extension: ".docx",
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  { extension: ".mp4", contentType: "video/mp4" },
  { extension: ".mp3", contentType: "audio/mpeg" },
  { extension: ".wav", contentType: "audio/wav" },
])

const uploadRequestSchema = z
  .object({
    filename: z.string().min(1).max(512),
    content_type: z.string().min(1).max(255),
    size: z.number().int().positive(),
    rights_basis: rightsBasisSchema,
    intended_use: intendedUseSchema,
  })
  .strict()

const uploadSubmissionSchema = z
  .object({
    source_type: z.literal("upload"),
    media_key: z.string().trim().min(1).max(1_024),
    ...common,
  })
  .strict()
const urlSubmissionSchema = z
  .object({
    source_type: z.literal("url"),
    url: z.string().trim().min(1).max(2_048),
    access: z.enum(["public", "private", "restricted", "unknown"]),
    retrieval_method: z.enum(["official_api", "official_captions", "direct_fetch"]),
    ...common,
  })
  .strict()
const pasteSubmissionSchema = z
  .object({
    source_type: z.literal("paste"),
    paste_text: z.string(),
    ...common,
  })
  .strict()
const analysisSubmissionSchema = z.discriminatedUnion("source_type", [
  uploadSubmissionSchema,
  urlSubmissionSchema,
  pasteSubmissionSchema,
])

export type UploadRequest = z.infer<typeof uploadRequestSchema>
export type AnalysisSubmission = z.infer<typeof analysisSubmissionSchema>

function invalidRequest(message: string): never {
  throw new AppError({ code: "INVALID_REQUEST", status: 400, message, expose: true })
}

export function normalizeFilename(value: string): string {
  const basename = value.replaceAll("\\", "/").split("/").at(-1)?.normalize("NFC") ?? ""
  const cleaned = basename
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[^\p{L}\p{N}._ -]/gu, "_")
    .replace(/\s+/g, " ")
    .trim()
  if (!cleaned || cleaned === "." || cleaned === "..")
    invalidRequest("A valid filename is required.")
  if (cleaned.length <= 255) return cleaned
  const dot = cleaned.lastIndexOf(".")
  const extension = dot > 0 ? cleaned.slice(dot).slice(0, 16) : ""
  return `${cleaned.slice(0, 255 - extension.length)}${extension}`
}

function allowedUploadDetails() {
  return {
    allowed: ALLOWED_UPLOADS.map(({ extension, contentType }) => `${extension} (${contentType})`),
  }
}

export function parseUploadRequest(value: unknown, maxBytes: number): UploadRequest {
  const parsed = uploadRequestSchema.safeParse(value)
  if (!parsed.success) invalidRequest("Valid upload metadata and rights declarations are required.")
  if (parsed.data.size > maxBytes) {
    throw new AppError({
      code: "PAYLOAD_TOO_LARGE",
      status: 413,
      message: `The upload exceeds the ${maxBytes}-byte limit.`,
      expose: true,
      publicDetails: { max_bytes: maxBytes },
    })
  }
  const filename = normalizeFilename(parsed.data.filename)
  const dot = filename.lastIndexOf(".")
  const extension = dot >= 0 ? filename.slice(dot).toLowerCase() : ""
  const supported = ALLOWED_UPLOADS.some(
    (pair) => pair.extension === extension && pair.contentType === parsed.data.content_type,
  )
  if (!supported) {
    throw new AppError({
      code: "UNSUPPORTED_MEDIA_TYPE",
      status: 415,
      message: "The filename extension and content type are not an allowed pair.",
      expose: true,
      publicDetails: allowedUploadDetails(),
    })
  }
  return { ...parsed.data, filename }
}

export function parseAnalysisSubmission(
  value: unknown,
  maxPasteCharacters: number,
): AnalysisSubmission {
  const parsed = analysisSubmissionSchema.safeParse(value)
  if (!parsed.success) {
    invalidRequest("A valid upload, URL, or paste source envelope is required.")
  }
  if (parsed.data.source_type === "paste") {
    const pasteText = parsed.data.paste_text.trim()
    if (!pasteText) invalidRequest("Pasted content cannot be empty.")
    if (pasteText.length > maxPasteCharacters) {
      throw new AppError({
        code: "PAYLOAD_TOO_LARGE",
        status: 413,
        message: `Pasted content exceeds the ${maxPasteCharacters}-character limit.`,
        expose: true,
        publicDetails: { max_characters: maxPasteCharacters },
      })
    }
    return { ...parsed.data, paste_text: pasteText }
  }
  return parsed.data
}

export function parseIdempotencyKey(value: string | null): string | undefined {
  if (value === null) return undefined
  if (!/^[\x21-\x7e]{1,255}$/.test(value)) {
    invalidRequest("Idempotency-Key must contain 1-255 visible ASCII characters.")
  }
  return value
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    )
  }
  return value
}

export function hashSubmission(value: AnalysisSubmission): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex")
}

export function hashIdempotencyKey(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}
