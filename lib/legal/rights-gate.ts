import { isIP } from "node:net"

import { AppError } from "@/lib/errors/app-error"
import type { LegalPolicy, RightsGateDecision, RightsGateInput } from "./types"

function blocked(
  status: 403 | 422 | 503,
  code: Exclude<RightsGateDecision, { allowed: true }>["code"],
  reason: string,
  alternative: string,
): RightsGateDecision {
  return { allowed: false, status, code, reason, alternative }
}

function normalizeHostname(hostname: string): string {
  return hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "")
}

export function hostMatches(hostname: string, pattern: string): boolean {
  const host = normalizeHostname(hostname)
  const normalizedPattern = pattern.toLowerCase()
  if (normalizedPattern.startsWith("*.")) {
    const suffix = normalizedPattern.slice(2)
    return host.length > suffix.length && host.endsWith(`.${suffix}`)
  }
  return host === normalizedPattern
}

function isPrivateIpv4(hostname: string): boolean {
  const octets = hostname.split(".").map(Number)
  const [a, b, c] = octets
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  )
}

export function isPrivateOrReservedHost(hostname: string): boolean {
  const host = normalizeHostname(hostname)
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return true
  }
  const ipVersion = isIP(host)
  if (ipVersion === 4) return isPrivateIpv4(host)
  if (ipVersion === 6) {
    return (
      host === "::" ||
      host === "::1" ||
      host.startsWith("fc") ||
      host.startsWith("fd") ||
      /^fe[89ab]/.test(host) ||
      host.startsWith("2001:db8:") ||
      host.startsWith("::ffff:")
    )
  }
  return false
}
function evaluateUrl(policy: LegalPolicy, input: RightsGateInput): RightsGateDecision | undefined {
  if (!input.source.url) {
    return blocked(
      422,
      "rights_blocked",
      "No source URL was provided for the rights check.",
      "Provide a complete HTTPS URL or use an authorized upload.",
    )
  }

  let url: URL
  try {
    url = new URL(input.source.url)
  } catch {
    return blocked(
      422,
      "rights_blocked",
      "The source URL is not valid.",
      "Check the address or provide content you are authorized to upload.",
    )
  }

  const hostname = normalizeHostname(url.hostname)
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  ) {
    return blocked(
      422,
      "rights_blocked",
      "The URL does not use an approved secure source format.",
      "Use a public HTTPS URL without embedded credentials or a custom port.",
    )
  }
  if (isPrivateOrReservedHost(hostname)) {
    return blocked(
      422,
      "rights_blocked",
      "Private, local, and reserved network sources cannot be accessed.",
      "Use a public approved source or upload content you are authorized to analyze.",
    )
  }
  if (policy.blockedUrlHosts.some((pattern) => hostMatches(hostname, pattern))) {
    return blocked(
      422,
      "rights_blocked",
      "This source is blocked by the current rights and platform policy.",
      "Use an approved public source or authorized upload instead.",
    )
  }
  if (!policy.allowedUrlHosts.some((pattern) => hostMatches(hostname, pattern))) {
    return blocked(
      422,
      "rights_blocked",
      "This URL provider has not been approved for ingestion.",
      "Use an approved provider or upload content you own or have permission to analyze.",
    )
  }
  if (input.source.access !== "public") {
    return blocked(
      422,
      "rights_blocked",
      input.source.access === "private"
        ? "Private URL content cannot be ingested."
        : input.source.access === "restricted"
          ? "Platform-restricted URL content cannot be ingested."
          : "The URL's public-access status could not be verified.",
      "Use publicly accessible content or an authorized upload.",
    )
  }
  const officialMethodRequired = policy.officialApiRequiredHosts.some((pattern) =>
    hostMatches(hostname, pattern),
  )
  if (
    officialMethodRequired &&
    input.source.retrievalMethod !== "official_api" &&
    input.source.retrievalMethod !== "official_captions"
  ) {
    return blocked(
      422,
      "rights_blocked",
      "This platform requires an approved official API or caption method.",
      "Use the official provider integration or submit authorized source material directly.",
    )
  }
  return undefined
}
export function evaluateRightsGate(
  policy: LegalPolicy,
  input: RightsGateInput,
): RightsGateDecision {
  if ((!policy.counselApproved && policy.developmentTestMode !== true) || !policy.version) {
    return blocked(
      503,
      "legal_policy_unavailable",
      "Analysis is unavailable until the current legal policy is approved.",
      "Try again after the published policy has been reviewed and activated.",
    )
  }
  if (input.acceptedUseVersion !== policy.version) {
    return blocked(
      403,
      "acceptable_use_required",
      "The current acceptable-use policy must be acknowledged before analysis.",
      "Review and accept the current policy at /legal, then retry.",
    )
  }
  if (
    input.source.intendedUse === "harassment" ||
    input.source.intendedUse === "persuasion_optimization"
  ) {
    return blocked(
      403,
      "acceptable_use",
      "Harassment and persuasion optimization against a person are prohibited.",
      "Use the service for educational, research, journalistic, or personal argument analysis.",
    )
  }
  if (input.source.rightsBasis === "unknown") {
    return blocked(
      422,
      "rights_blocked",
      "Authorization to analyze this material has not been established.",
      "Use content you own, have permission to use, or that is licensed or public domain.",
    )
  }

  if (input.source.type === "upload" && !policy.allowUploads) {
    return blocked(
      422,
      "rights_blocked",
      "Uploads are not enabled by the current approved policy.",
      "Use an approved source type or try again when uploads are enabled.",
    )
  }
  if (input.source.type === "paste" && !policy.allowPaste) {
    return blocked(
      422,
      "rights_blocked",
      "Pasted content is not enabled by the current approved policy.",
      "Use an approved source type or try again when pasted content is enabled.",
    )
  }
  if (input.source.type === "url") {
    const urlDecision = evaluateUrl(policy, input)
    if (urlDecision) return urlDecision
  }

  return { allowed: true, policyVersion: policy.version }
}

export function assertRightsGate(policy: LegalPolicy, input: RightsGateInput): void {
  const decision = evaluateRightsGate(policy, input)
  if (decision.allowed) return
  throw new AppError({
    code: decision.code,
    status: decision.status,
    message: decision.reason,
    expose: true,
    retryable: decision.status === 503,
    publicDetails: {
      reason: decision.reason,
      alternative: decision.alternative,
    },
  })
}
