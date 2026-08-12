import type { AssembledAnalysis } from "@/lib/contracts/analysis"

export type AccountExportInput = Readonly<{
  generatedAt: string
  account: {
    id: string
    email: string
    createdAt: Date
    defaultRetentionSetting: string
    preferences: {
      confidenceDisplay: string
      jargonPlainLanguage: boolean
      readingDensity: string
      accessibilityPrefs: Record<string, unknown>
    }
  }
  analyses: readonly {
    id: string
    title: string
    status: string
    sourceType: string
    language: string | null
    retentionSetting: string
    createdAt: Date
    updatedAt: Date
    annotations: readonly {
      findingId: string | null
      note: string | null
      visibility: string
      highlighted: boolean
    }[]
    contests: readonly {
      findingId: string
      reason: string | null
      state: string
      resolution: string | null
    }[]
    assembled?: AssembledAnalysis
    transcript?: readonly {
      startMs: number
      endMs: number
      text: string
      speakerLabel: string | null
    }[]
  }[]
}>

const forbiddenKey =
  /(?:auth.?provider|secret|password|credential|token|prompt|injection|asr|diar|raw.?confidence|verifier|idempotency|source.?media.?key|source.?url|object.?key|error.?class)/i
function projectAssembled(assembled: AssembledAnalysis) {
  return {
    overview: assembled.overview,
    findings: assembled.findings.map((finding) => ({
      id: finding.id,
      analysis_id: finding.analysis_id,
      kind: finding.kind,
      text: finding.text,
      paraphrase: finding.paraphrase,
      confidence_band: finding.confidence_band,
      state: finding.state,
      person_involved: finding.person_involved,
      span_refs: finding.span_refs,
      evidence_refs: finding.evidence_refs,
      produced_by_stage: finding.produced_by_stage,
      ...(finding.claim ? { claim: finding.claim } : {}),
      ...(finding.support ? { support: finding.support } : {}),
      ...(finding.structure ? { structure: finding.structure } : {}),
      ...(finding.fallacy ? { fallacy: finding.fallacy } : {}),
      ...(finding.credibility ? { credibility: finding.credibility } : {}),
    })),
    sources: assembled.sources.map((source) => ({
      id: source.id,
      analysis_id: source.analysis_id,
      url: source.url,
      retrieved_snippet: source.retrieved_snippet,
      provenance: source.provenance,
      tier: source.tier,
      resolves: source.resolves,
      supports_relation: source.supports_relation,
      licensing_quote_verified: source.licensing_quote_verified,
      retrieved_at: source.retrieved_at,
      ...(source.credibility_ratings ? { credibility_ratings: source.credibility_ratings } : {}),
      ...(source.credibility_disagreement === undefined
        ? {}
        : { credibility_disagreement: source.credibility_disagreement }),
    })),
    structure_edges: assembled.structure_edges,
    stage_runs: assembled.stage_runs,
  }
}

export function projectAccountData(input: AccountExportInput) {
  return {
    generated_at: input.generatedAt,
    account: {
      id: input.account.id,
      email: input.account.email,
      created_at: input.account.createdAt.toISOString(),
      default_retention_setting: input.account.defaultRetentionSetting,
      preferences: {
        confidence_display: input.account.preferences.confidenceDisplay,
        jargon_plain_language: input.account.preferences.jargonPlainLanguage,
        reading_density: input.account.preferences.readingDensity,
        accessibility_prefs: structuredClone(input.account.preferences.accessibilityPrefs),
      },
    },
    analyses: input.analyses.map((analysis) => ({
      id: analysis.id,
      title: analysis.title,
      status: analysis.status,
      source_type: analysis.sourceType,
      language: analysis.language,
      retention_setting: analysis.retentionSetting,
      created_at: analysis.createdAt.toISOString(),
      updated_at: analysis.updatedAt.toISOString(),
      annotations: analysis.annotations.map((annotation) => ({
        finding_id: annotation.findingId,
        note: annotation.note,
        visibility: annotation.visibility,
        highlighted: annotation.highlighted,
      })),
      contests: analysis.contests.map((contest) => ({
        finding_id: contest.findingId,
        reason: contest.reason,
        state: contest.state,
        resolution: contest.resolution,
      })),
      ...(analysis.assembled ? { public_analysis: projectAssembled(analysis.assembled) } : {}),
      ...(analysis.transcript
        ? {
            transcript: analysis.transcript.map((segment) => ({
              start_ms: segment.startMs,
              end_ms: segment.endMs,
              text: segment.text,
              speaker_label: segment.speakerLabel,
            })),
          }
        : {}),
    })),
  }
}

export function findForbiddenAccountExportPath(value: unknown, path = "$"): string | null {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findForbiddenAccountExportPath(value[index], `${path}[${index}]`)
      if (found) return found
    }
    return null
  }
  if (!value || typeof value !== "object") return null
  for (const [key, item] of Object.entries(value)) {
    const itemPath = `${path}.${key}`
    if (forbiddenKey.test(key)) return itemPath
    const found = findForbiddenAccountExportPath(item, itemPath)
    if (found) return found
  }
  return null
}

export function assertSafeAccountExport(value: unknown): void {
  const forbiddenPath = findForbiddenAccountExportPath(value)
  if (forbiddenPath) throw new Error(`ACCOUNT_EXPORT_FORBIDDEN_FIELD:${forbiddenPath}`)
}
