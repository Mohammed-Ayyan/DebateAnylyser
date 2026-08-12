import { describe, expect, it, vi } from "vitest"

import type { AnalysisSubmission, UploadRequest } from "@/lib/ingest/contracts"
import type { IngestDependencies } from "@/lib/ingest/service"
import { prepareUpload, submitAnalysis } from "@/lib/ingest/service"
import type { LegalPolicy } from "@/lib/legal/types"

const policy: LegalPolicy & { version: string } = {
  version: "v1",
  counselApproved: true,
  allowUploads: true,
  allowPaste: true,
  allowedUrlHosts: ["example.com"],
  blockedUrlHosts: [],
  officialApiRequiredHosts: [],
}

const uploadRequest: UploadRequest = {
  filename: "debate.mp4",
  content_type: "video/mp4",
  size: 100,
  rights_basis: "owned",
  intended_use: "education",
}
const pasteSubmission = {
  source_type: "paste",
  paste_text: "Speaker A: A supported claim.",
  rights_basis: "owned",
  intended_use: "education",
  retention_setting: "keep",
} satisfies AnalysisSubmission
const uploadSubmission = {
  source_type: "upload",
  media_key: "uploads/user/upload/debate.mp4",
  rights_basis: "owned",
  intended_use: "education",
  retention_setting: "keep",
} satisfies AnalysisSubmission

function dependencies() {
  const calls: string[] = []
  const reservation = {
    id: "upload-id",
    ownerId: "user-id",
    mediaKey: uploadSubmission.media_key,
    filename: "debate.mp4",
    contentType: "video/mp4",
    size: 100,
    expiresAt: new Date("2030-01-01T00:00:00Z"),
    claimedAt: null,
    createdAt: new Date("2029-01-01T00:00:00Z"),
  }
  const deps = {
    now: () => new Date("2029-01-01T00:00:00Z"),
    storage: {
      createPresignedUpload: vi.fn(async () => {
        calls.push("storage.create")
        return {
          uploadUrl: "https://storage.example/upload",
          mediaKey: reservation.mediaKey,
          expiresAt: reservation.expiresAt,
        }
      }),
      headObject: vi.fn(async () => {
        calls.push("storage.head")
        return {
          contentType: reservation.contentType,
          size: reservation.size,
          metadata: { "owner-id": reservation.ownerId },
        }
      }),
      deleteObject: vi.fn(async () => undefined),
    },
    repository: {
      createUploadReservation: vi.fn(async () => {
        calls.push("repository.reserve")
        return reservation
      }),
      deleteUploadReservation: vi.fn(async () => undefined),
      findAnalysisReplay: vi.fn(async () => {
        calls.push("repository.replay")
        return undefined
      }),
      findAvailableUpload: vi.fn(async () => {
        calls.push("repository.find")
        return reservation
      }),
      createAnalysisTransaction: vi.fn(async () => {
        calls.push("repository.transaction")
        return { id: "analysis-id", status: "queued" as const, replayed: false }
      }),
    },
  } as unknown as IngestDependencies
  return { calls, deps, reservation }
}

describe("F1 rights-first ordering", () => {
  it("does not presign or reserve a blocked upload", async () => {
    const { calls, deps } = dependencies()
    await expect(
      prepareUpload("user-id", "old", policy, uploadRequest, deps),
    ).rejects.toMatchObject({
      status: 403,
      code: "acceptable_use_required",
    })
    expect(calls).toEqual([])
  })

  it("does not inspect storage or create a job for a blocked analysis", async () => {
    const { calls, deps } = dependencies()
    await expect(
      submitAnalysis("user-id", "old", policy, pasteSubmission, "retry-1", deps),
    ).rejects.toMatchObject({ status: 403, code: "acceptable_use_required" })
    expect(calls).toEqual([])
  })

  it("presigns only after approval and persists the reservation", async () => {
    const { calls, deps } = dependencies()
    await expect(
      prepareUpload("user-id", "v1", policy, uploadRequest, deps),
    ).resolves.toMatchObject({
      mediaKey: uploadSubmission.media_key,
    })
    expect(calls).toEqual(["storage.create", "repository.reserve"])
  })
})

describe("F1 upload verification", () => {
  it("rejects missing, expired, or other-owner reservations before object inspection", async () => {
    const { calls, deps } = dependencies()
    vi.mocked(deps.repository.findAvailableUpload).mockResolvedValueOnce(undefined)
    await expect(
      submitAnalysis("user-id", "v1", policy, uploadSubmission, undefined, deps),
    ).rejects.toMatchObject({ status: 422, code: "UPLOAD_INVALID" })
    expect(calls).toEqual([])
    expect(deps.repository.findAvailableUpload).toHaveBeenCalledOnce()
    expect(deps.storage.headObject).not.toHaveBeenCalled()
  })

  it("rejects object metadata mismatches without creating an analysis or job", async () => {
    const { calls, deps } = dependencies()
    vi.mocked(deps.storage.headObject).mockResolvedValueOnce({
      contentType: "video/mp4",
      size: 101,
      metadata: { "owner-id": "other-user" },
    })
    await expect(
      submitAnalysis("user-id", "v1", policy, uploadSubmission, undefined, deps),
    ).rejects.toMatchObject({ status: 422, code: "UPLOAD_INVALID" })
    expect(calls).toEqual(["repository.find"])
    expect(deps.repository.createAnalysisTransaction).not.toHaveBeenCalled()
  })

  it("verifies the upload then hands one normalized transaction to PostgreSQL", async () => {
    const { calls, deps } = dependencies()
    await expect(
      submitAnalysis("user-id", "v1", policy, uploadSubmission, "retry-1", deps),
    ).resolves.toEqual({ id: "analysis-id", status: "queued", replayed: false })
    expect(calls).toEqual([
      "repository.replay",
      "repository.find",
      "storage.head",
      "repository.transaction",
    ])
    expect(deps.repository.createAnalysisTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: "user-id",
        title: "debate",
        idempotencyKeyHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        requestHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    )
  })

  it("replays a completed upload retry before checking the claimed reservation", async () => {
    const { calls, deps } = dependencies()
    vi.mocked(deps.repository.findAnalysisReplay).mockImplementationOnce(async () => {
      calls.push("repository.replay")
      return { id: "existing-analysis", status: "queued", replayed: true }
    })
    await expect(
      submitAnalysis("user-id", "v1", policy, uploadSubmission, "retry-1", deps),
    ).resolves.toEqual({ id: "existing-analysis", status: "queued", replayed: true })
    expect(calls).toEqual(["repository.replay"])
    expect(deps.repository.findAvailableUpload).not.toHaveBeenCalled()
    expect(deps.storage.headObject).not.toHaveBeenCalled()
  })
})

describe("F1 source handoff", () => {
  it("queues paste text without touching object storage", async () => {
    const { calls, deps } = dependencies()
    await submitAnalysis("user-id", "v1", policy, pasteSubmission, undefined, deps)
    expect(calls).toEqual(["repository.transaction"])
    expect(deps.repository.createAnalysisTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ submission: pasteSubmission, title: "Pasted transcript" }),
    )
  })

  it("queues an approved URL without fetching it", async () => {
    const { calls, deps } = dependencies()
    const submission: AnalysisSubmission = {
      source_type: "url",
      url: "https://example.com/debate",
      access: "public",
      retrieval_method: "direct_fetch",
      rights_basis: "permission",
      intended_use: "research",
      retention_setting: "30d",
    }
    await submitAnalysis("user-id", "v1", policy, submission, undefined, deps)
    expect(calls).toEqual(["repository.transaction"])
    expect(deps.repository.createAnalysisTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Debate from example.com" }),
    )
  })
})
