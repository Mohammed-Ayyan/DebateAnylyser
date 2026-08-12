import "server-only"

import { serverEnv } from "@/lib/env/server"
import { AppError } from "@/lib/errors/app-error"
import type { LegalPolicy } from "./types"

const hostPattern =
  /^(?:\*\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

function parseHosts(value: string, field: string): string[] {
  const hosts = [
    ...new Set(
      value
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
    ),
  ]
  for (const host of hosts) {
    if (!hostPattern.test(host)) throw new Error(`Invalid host pattern in ${field}: ${host}`)
  }
  return hosts
}

export function getServerLegalPolicy(): LegalPolicy {
  return {
    version: serverEnv.LEGAL_POLICY_VERSION ?? null,
    counselApproved: serverEnv.LEGAL_COUNSEL_APPROVED,
    developmentTestMode: serverEnv.APP_ENV === "dev" && serverEnv.LEGAL_DEVELOPMENT_TEST_MODE,
    allowUploads: serverEnv.LEGAL_ALLOW_UPLOADS,
    allowPaste: serverEnv.LEGAL_ALLOW_PASTE,
    allowedUrlHosts: parseHosts(serverEnv.LEGAL_ALLOWED_URL_HOSTS, "LEGAL_ALLOWED_URL_HOSTS"),
    blockedUrlHosts: parseHosts(serverEnv.LEGAL_BLOCKED_URL_HOSTS, "LEGAL_BLOCKED_URL_HOSTS"),
    officialApiRequiredHosts: parseHosts(
      serverEnv.LEGAL_OFFICIAL_API_REQUIRED_HOSTS,
      "LEGAL_OFFICIAL_API_REQUIRED_HOSTS",
    ),
  }
}
export function isLegalPolicyActive(policy: LegalPolicy): boolean {
  return Boolean(policy.version) && (policy.counselApproved || policy.developmentTestMode === true)
}
export function requireApprovedLegalPolicy(): LegalPolicy & { version: string } {
  const policy = getServerLegalPolicy()
  if (!isLegalPolicyActive(policy) || !policy.version) {
    throw new AppError({
      code: "legal_policy_unavailable",
      status: 503,
      message: "The legal policy is not approved for use.",
      expose: true,
      retryable: false,
      publicDetails: {
        reason: "Analysis is unavailable until the current legal policy is approved.",
        alternative: "Review the published status at /legal and try again later.",
      },
    })
  }
  return { ...policy, version: policy.version }
}
