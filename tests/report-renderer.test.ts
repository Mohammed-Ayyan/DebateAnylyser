import { describe, expect, it } from "vitest"

import type { AssembledAnalysis } from "@/lib/contracts/analysis"
import { renderHtmlReport, type RenderHtmlReportInput } from "@/lib/exports/render-html"

const analysisId = "00000000-0000-4000-8000-000000000001"
const findingId = "00000000-0000-4000-8000-000000000002"
const hiddenFindingId = "00000000-0000-4000-8000-000000000003"
const segmentId = "00000000-0000-4000-8000-000000000004"
const sourceId = "00000000-0000-4000-8000-000000000005"

const analysis: AssembledAnalysis = {
  overview: {
    categorical_read: "external_evidence_available",
    distribution: {
      claims: 2,
      support_present: 0,
      support_weak: 0,
      support_absent: 0,
      support_insufficient: 0,
      verified_sources: 1,
      possible_patterns: 0,
    },
    top_insight: "Review the anchored claims and evidence.",
    explore_pointers: [{ finding_id: findingId, reason: "external_evidence" }],
  },
  findings: [
    {
      id: findingId,
      analysis_id: analysisId,
      kind: "claim",
      text: "A traceable finding.",
      paraphrase: false,
      confidence_band: "medium",
      state: "contested",
      person_involved: false,
      span_refs: [{ segment_id: segmentId, start_char: 4, end_char: 19 }],
      evidence_refs: [sourceId],
      produced_by_stage: "S2",
    },
    {
      id: hiddenFindingId,
      analysis_id: analysisId,
      kind: "fallacy",
      text: "CURATION_SECRET_FINDING",
      paraphrase: false,
      confidence_band: "low",
      state: "ok",
      person_involved: false,
      span_refs: [{ segment_id: segmentId, start_char: 20, end_char: 30 }],
      evidence_refs: [],
      produced_by_stage: "S5",
    },
  ],
  sources: [
    {
      id: sourceId,
      analysis_id: analysisId,
      url: "https://example.test/evidence?first=one&second=two",
      retrieved_snippet: "A retrieved excerpt.",
      provenance: "Publisher archive.",
      tier: "T1",
      resolves: true,
      supports_relation: "neutral",
      licensing_quote_verified: true,
      retrieved_at: "2026-04-01T11:00:00.000Z",
      credibility_ratings: [
        {
          id: "00000000-0000-4000-8000-000000000006",
          factor: "method_transparency",
          level: "mixed",
          method_provenance: "Published review method",
          rater_ref: "Independent rater",
          contested: true,
        },
      ],
      credibility_disagreement: true,
    },
  ],
  structure_edges: [],
  stage_runs: [{ stage: "S9", status: "complete", attempt: 1, error_class: null }],
}

function input(overrides: Partial<RenderHtmlReportInput> = {}): RenderHtmlReportInput {
  return {
    analysis,
    title: "Debate analysis",
    analysis_id: analysisId,
    generated_at: "2026-04-01T12:00:00.000Z",
    disclaimer_text: "This analysis is limited and should be reviewed.",
    disclaimer_version: "legal-2026-04",
    limitations_url: "https://example.test/legal/limitations?view=report&lang=en",
    annotations: [],
    contests: [],
    ...overrides,
  }
}

describe("F12 safe HTML report renderer", () => {
  it("escapes malicious HTML, script, and template text in every untrusted text surface", () => {
    const payload = `<script>alert("x")</script><img src=x onerror=alert(1)>{{template}}\${globalThis}`
    const maliciousAnalysis: AssembledAnalysis = {
      ...analysis,
      overview: { ...analysis.overview, top_insight: payload },
      findings: analysis.findings.map((finding, index) => ({
        ...finding,
        text: index === 0 ? payload : finding.text,
      })),
      sources: analysis.sources.map((source) => ({
        ...source,
        retrieved_snippet: payload,
        provenance: payload,
        credibility_ratings: source.credibility_ratings?.map((rating) => ({
          ...rating,
          method_provenance: payload,
          rater_ref: payload,
        })),
      })),
    }

    const html = renderHtmlReport(
      input({
        analysis: maliciousAnalysis,
        title: payload,
        disclaimer_text: payload,
        annotations: [
          { finding_id: findingId, note: payload, visibility: "shown", highlighted: false },
        ],
        contests: [{ finding_id: findingId, state: "open", reason: payload, resolution: null }],
      }),
    )

    expect(html).toContain("<!doctype html>")
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;")
    expect(html).not.toContain("<script>")
    expect(html).not.toContain("<img src=x")
    expect(html).toContain("{{template}}${globalThis}")
    expect(html).toContain("first=one&amp;second=two")
    expect(html).toContain("view=report&amp;lang=en")
  })

  it("omits curated-hidden findings and their annotations while disclosing curation", () => {
    const html = renderHtmlReport(
      input({
        annotations: [
          {
            finding_id: hiddenFindingId,
            note: "CURATION_SECRET_NOTE",
            visibility: "hidden",
            highlighted: false,
          },
        ],
      }),
    )

    expect(html).not.toContain("CURATION_SECRET_FINDING")
    expect(html).not.toContain("CURATION_SECRET_NOTE")
    expect(html).toContain("Curation was applied to this report.")
    expect(html).toContain("1 finding omitted by the curator.")
    expect(analysis.findings).toHaveLength(2)
  })

  it("preserves disclosure, curation notes, categorical states, and contest records", () => {
    const html = renderHtmlReport(
      input({
        curation_applied: true,
        annotations: [
          {
            finding_id: null,
            note: "Use as a discussion prompt.",
            visibility: "shown",
            highlighted: false,
          },
          {
            finding_id: findingId,
            note: "Compare the cited context.",
            visibility: "shown",
            highlighted: true,
          },
        ],
        contests: [
          {
            finding_id: findingId,
            state: "acknowledged",
            reason: "The cited span may omit context.",
            resolution: null,
          },
        ],
      }),
    )

    expect(html).toContain("This analysis is limited and should be reviewed.")
    expect(html).toContain("Disclaimer version: legal-2026-04")
    expect(html).toContain("Read the analysis limitations")
    expect(html).toContain("Use as a discussion prompt.")
    expect(html).toContain("Compare the cited context.")
    expect(html).toContain("Curator highlighted")
    expect(html).toContain("Finding state</dt><dd>contested")
    expect(html).toContain("Confidence</dt><dd>medium")
    expect(html).toContain("acknowledged")
    expect(html).toContain("The cited span may omit context.")
  })

  it("renders an auditable finding-to-anchor-to-source provenance trail", () => {
    const html = renderHtmlReport(input())

    expect(html).toContain(`finding-${findingId}`)
    expect(html).toContain(`Segment <code>${segmentId}</code>, characters 4–19`)
    expect(html).toContain(`href="#source-${sourceId}"`)
    expect(html).toContain("Publisher archive.")
    expect(html).toContain("Evidence relation</dt><dd>neutral")
    expect(html).toContain("Produced by stage</dt><dd>S2")
    expect(html).toContain("method transparency:</strong> mixed")
    expect(html).toContain("Qualitative signal; contestable.")
    expect(html).toContain("Credibility signals disagree.")
  })

  it("deep-allow-lists fields and never emits raw confidence, numeric credibility, or verdict fields", () => {
    const tainted = {
      ...analysis,
      findings: [
        {
          ...analysis.findings[0],
          confidence: { raw: 0.987654321 },
          score: 73.2468,
          winner: "FORBIDDEN_SPEAKER_VALUE",
          truth_verdict: "FORBIDDEN_VERDICT_VALUE",
        },
      ],
      sources: [
        {
          ...analysis.sources[0],
          credibility_score: 9.87654321,
          rank: 42.4242,
        },
      ],
    } as unknown as AssembledAnalysis

    const html = renderHtmlReport(input({ analysis: tainted }))

    expect(html).not.toContain("0.987654321")
    expect(html).not.toContain("73.2468")
    expect(html).not.toContain("9.87654321")
    expect(html).not.toContain("42.4242")
    expect(html).not.toContain("FORBIDDEN_SPEAKER_VALUE")
    expect(html).not.toContain("FORBIDDEN_VERDICT_VALUE")
    expect(html).not.toMatch(/\b(?:winner|score|truth verdict|raw confidence)\b/i)
  })

  it("creates links only from validated HTTPS URLs", () => {
    const invalidSourceAnalysis = {
      ...analysis,
      sources: [{ ...analysis.sources[0], url: "javascript:alert(document.domain)" }],
    } as unknown as AssembledAnalysis
    const html = renderHtmlReport(input({ analysis: invalidSourceAnalysis }))

    expect(html).toContain("Link unavailable: invalid HTTPS URL")
    expect(html).not.toContain("javascript:")
    expect(() => renderHtmlReport(input({ limitations_url: "http://example.test/legal" }))).toThrow(
      /valid HTTPS URL/,
    )
    expect(() => renderHtmlReport(input({ limitations_url: "javascript:alert(1)" }))).toThrow(
      /valid HTTPS URL/,
    )
  })
})
