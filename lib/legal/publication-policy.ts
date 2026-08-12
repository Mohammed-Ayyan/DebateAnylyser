import "server-only"

import { serverEnv } from "@/lib/env/server"
import { AppError } from "@/lib/errors/app-error"

export type PublicationPolicy = {
  counselApproved: boolean
  policyVersion: string | null
  disclaimerVersion: string | null
  limitationsUrl: string | null
}

export function getPublicationPolicy(): PublicationPolicy {
  return {
    counselApproved: serverEnv.PUBLICATION_COUNSEL_APPROVED,
    policyVersion: serverEnv.PUBLICATION_POLICY_VERSION ?? null,
    disclaimerVersion: serverEnv.DISCLAIMER_VERSION ?? null,
    limitationsUrl: serverEnv.LIMITATIONS_URL ?? null,
  }
}

function unavailable(message: string): never {
  throw new AppError({
    code: "PUBLICATION_UNAVAILABLE",
    status: 503,
    message,
    expose: true,
  })
}

function requireApprovedPublication(): {
  counselApproved: true
  policyVersion: string
  disclaimerVersion: string
  limitationsUrl: string
} {
  const policy = getPublicationPolicy()
  if (
    !policy.counselApproved ||
    !policy.policyVersion ||
    !policy.disclaimerVersion ||
    !policy.limitationsUrl
  ) {
    unavailable("Publication is unavailable until its policy and disclosures are approved.")
  }
  return {
    counselApproved: true,
    policyVersion: policy.policyVersion,
    disclaimerVersion: policy.disclaimerVersion,
    limitationsUrl: policy.limitationsUrl,
  }
}

export function requirePublicSharingPublication() {
  if (!serverEnv.PUBLIC_SHARING_ENABLED) unavailable("Public sharing is not enabled.")
  return requireApprovedPublication()
}

export function requireReportExportPublication() {
  if (!serverEnv.REPORT_EXPORT_ENABLED) unavailable("Report export is not enabled.")
  return requireApprovedPublication()
}

export function requireAccountDataExportEnabled(): void {
  if (!serverEnv.ACCOUNT_DATA_EXPORT_ENABLED) {
    unavailable("Account data export is not enabled.")
  }
}
