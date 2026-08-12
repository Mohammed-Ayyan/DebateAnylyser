import "server-only"

import { lookup } from "node:dns/promises"

import { serverEnv } from "@/lib/env/server"
import { hostMatches, isPrivateOrReservedHost } from "@/lib/legal/rights-gate"
import { getServerLegalPolicy } from "@/lib/legal/server-policy"
import type { LegalPolicy } from "@/lib/legal/types"
import type { ObjectStorage } from "@/lib/storage/types"
import {
  TranscriptionError,
  type MediaTranscriptionRequest,
  type TranscriptionOutput,
} from "./contracts"
import type { TranscriptionSource } from "./source-repository"
import {
  extractTextTranscript,
  TEXT_SOURCE_CONTENT_TYPES,
  userSuppliedTranscript,
} from "./text-extractor"

export type ResolvedTranscriptionInput =
  | { kind: "transcript"; transcript: TranscriptionOutput }
  | { kind: "media"; request: MediaTranscriptionRequest }

export type HostLookup = (hostname: string) => Promise<readonly string[]>

const defaultLookup: HostLookup = async (hostname) =>
  (await lookup(hostname, { all: true, verbatim: true })).map((result) => result.address)

async function assertDirectUrlSafe(
  urlValue: string,
  lookupHost: HostLookup,
  policy: LegalPolicy,
): Promise<void> {
  const url = new URL(urlValue)
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    isPrivateOrReservedHost(url.hostname)
  ) {
    throw new TranscriptionError(
      "SOURCE_URL_UNSAFE",
      "The source URL is no longer safe to access.",
      false,
    )
  }
  if (
    policy.blockedUrlHosts.some((pattern) => hostMatches(url.hostname, pattern)) ||
    !policy.allowedUrlHosts.some((pattern) => hostMatches(url.hostname, pattern))
  ) {
    throw new TranscriptionError(
      "SOURCE_URL_NO_LONGER_APPROVED",
      "The source URL is not approved by the current policy.",
      false,
    )
  }
  let addresses: readonly string[]
  try {
    addresses = await lookupHost(url.hostname)
  } catch (error) {
    throw new TranscriptionError(
      "SOURCE_DNS_UNAVAILABLE",
      "The source host could not be resolved.",
      true,
      error,
    )
  }
  if (addresses.length === 0 || addresses.some(isPrivateOrReservedHost)) {
    throw new TranscriptionError(
      "SOURCE_URL_UNSAFE",
      "The source URL resolves to a private or reserved network.",
      false,
    )
  }
}

export async function resolveTranscriptionInput(
  source: TranscriptionSource,
  storage: ObjectStorage,
  lookupHost: HostLookup = defaultLookup,
  policy: LegalPolicy = getServerLegalPolicy(),
): Promise<ResolvedTranscriptionInput> {
  if (source.type === "paste") {
    return { kind: "transcript", transcript: userSuppliedTranscript(source.text) }
  }
  if (source.type === "upload" && TEXT_SOURCE_CONTENT_TYPES.has(source.contentType)) {
    if (source.size > serverEnv.TRANSCRIPT_TEXT_MAX_BYTES) {
      throw new TranscriptionError(
        "TEXT_SOURCE_TOO_LARGE",
        "The text document exceeds the configured extraction limit.",
        false,
      )
    }
    const bytes = await storage.readObject(source.mediaKey, serverEnv.TRANSCRIPT_TEXT_MAX_BYTES)
    return {
      kind: "transcript",
      transcript: await extractTextTranscript(source.contentType, bytes),
    }
  }
  if (source.type === "upload") {
    return {
      kind: "media",
      request: {
        mediaUrl: await storage.createPresignedDownload(
          source.mediaKey,
          serverEnv.OBJECT_DOWNLOAD_URL_TTL_SECONDS,
        ),
        contentType: source.contentType,
      },
    }
  }
  if (source.retrievalMethod !== "direct_fetch") {
    throw new TranscriptionError(
      "OFFICIAL_SOURCE_ADAPTER_UNAVAILABLE",
      "The configured official source integration is not available.",
      false,
    )
  }
  await assertDirectUrlSafe(source.url, lookupHost, policy)
  return { kind: "media", request: { mediaUrl: source.url } }
}
