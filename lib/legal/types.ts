export type RightsBasis = "owned" | "permission" | "public_domain" | "licensed" | "unknown"
export type AccessClassification = "public" | "private" | "restricted" | "unknown"
export type IntendedUse =
  | "education"
  | "research"
  | "journalism"
  | "personal_review"
  | "harassment"
  | "persuasion_optimization"
  | "other"
export type RetrievalMethod = "official_api" | "official_captions" | "direct_fetch" | "none"

export type LegalPolicy = {
  version: string | null
  counselApproved: boolean
  developmentTestMode?: boolean
  allowUploads: boolean
  allowPaste: boolean
  allowedUrlHosts: readonly string[]
  blockedUrlHosts: readonly string[]
  officialApiRequiredHosts: readonly string[]
}

export type RightsGateInput = {
  acceptedUseVersion: string | null
  source: {
    type: "upload" | "url" | "paste"
    url?: string
    rightsBasis: RightsBasis
    access: AccessClassification
    intendedUse: IntendedUse
    retrievalMethod?: RetrievalMethod
  }
}

export type RightsGateDecision =
  | { allowed: true; policyVersion: string }
  | {
      allowed: false
      status: 403 | 422 | 503
      code:
        | "acceptable_use_required"
        | "acceptable_use"
        | "rights_blocked"
        | "legal_policy_unavailable"
      reason: string
      alternative: string
    }
