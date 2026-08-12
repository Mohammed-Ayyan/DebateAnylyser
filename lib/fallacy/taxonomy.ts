export const FALLACY_TAXONOMY_VERSION = "f17-s5-v1" as const

export const FALLACY_TAXONOMY_IDS = [
  "LF_STRAW_MAN",
  "LF_FALSE_DILEMMA",
  "LF_HASTY_GENERALIZATION",
  "LF_FALSE_CAUSE",
  "RT_APPEAL_TO_EMOTION",
  "RT_LOADED_LANGUAGE",
  "RT_RED_HERRING",
  "MI_CHERRY_PICKING",
  "MI_MISSING_CONTEXT",
  "MI_VAGUE_ATTRIBUTION",
] as const

export type FallacyTaxonomyId = (typeof FALLACY_TAXONOMY_IDS)[number]
export type FallacyTaxonomyCategory = "logical_fallacy" | "rhetoric" | "misleading_or_incomplete"

export type FallacyTaxonomyEntry = Readonly<{
  id: FallacyTaxonomyId
  category: FallacyTaxonomyCategory
  label: string
  why: string
}>

export const FALLACY_TAXONOMY: Readonly<Record<FallacyTaxonomyId, FallacyTaxonomyEntry>> = {
  LF_STRAW_MAN: {
    id: "LF_STRAW_MAN",
    category: "logical_fallacy",
    label: "straw man",
    why: "The span may replace a position with a materially easier version to answer.",
  },
  LF_FALSE_DILEMMA: {
    id: "LF_FALSE_DILEMMA",
    category: "logical_fallacy",
    label: "false dilemma",
    why: "The span may present limited alternatives while leaving other relevant options unaddressed.",
  },
  LF_HASTY_GENERALIZATION: {
    id: "LF_HASTY_GENERALIZATION",
    category: "logical_fallacy",
    label: "hasty generalization",
    why: "The span may draw a broad conclusion from evidence that is limited in scope.",
  },
  LF_FALSE_CAUSE: {
    id: "LF_FALSE_CAUSE",
    category: "logical_fallacy",
    label: "false cause",
    why: "The span may treat an association or sequence as sufficient evidence of causation.",
  },

  RT_APPEAL_TO_EMOTION: {
    id: "RT_APPEAL_TO_EMOTION",
    category: "rhetoric",
    label: "appeal to emotion",
    why: "The span may use an emotional response in place of support for the conclusion.",
  },
  RT_LOADED_LANGUAGE: {
    id: "RT_LOADED_LANGUAGE",
    category: "rhetoric",
    label: "loaded language",
    why: "The span may use strongly evaluative wording to steer judgment without adding support.",
  },
  RT_RED_HERRING: {
    id: "RT_RED_HERRING",
    category: "rhetoric",
    label: "red herring",
    why: "The span may redirect attention from the issue under discussion to a different issue.",
  },
  MI_CHERRY_PICKING: {
    id: "MI_CHERRY_PICKING",
    category: "misleading_or_incomplete",
    label: "cherry-picking pattern",
    why: "The span may rely on selected examples while leaving relevant contrary context unaddressed.",
  },
  MI_MISSING_CONTEXT: {
    id: "MI_MISSING_CONTEXT",
    category: "misleading_or_incomplete",
    label: "missing-context pattern",
    why: "The span may omit context needed to interpret the statement at its stated scope.",
  },
  MI_VAGUE_ATTRIBUTION: {
    id: "MI_VAGUE_ATTRIBUTION",
    category: "misleading_or_incomplete",
    label: "vague attribution",
    why: "The span may attribute a claim to an unspecified source that cannot be evaluated from the statement.",
  },
}

export function isFallacyTaxonomyId(value: string): value is FallacyTaxonomyId {
  return Object.prototype.hasOwnProperty.call(FALLACY_TAXONOMY, value)
}

export function fallacyTaxonomyEntry(id: FallacyTaxonomyId): FallacyTaxonomyEntry {
  return FALLACY_TAXONOMY[id]
}
