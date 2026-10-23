import { describe, expect, it, vi } from "vitest"

import { wrapUntrustedSource } from "@/lib/ai/content-boundary"
import type { InternalClaimFinding } from "@/lib/contracts/analysis"
import { prepareSupportCalls, validateSupportAssessments } from "@/lib/support/assessment"
import { SupportAssessmentError } from "@/lib/support/contracts"
import { OllamaSupportAssessmentProvider } from "@/lib/support/ollama-provider"
import { prepareStructureCalls, validateStructureMappings } from "@/lib/structure/mapping"
import { StructureMappingError } from "@/lib/structure/contracts"
import { OllamaStructureMappingProvider } from "@/lib/structure/ollama-provider"
import { validateFallacyDetection } from "@/lib/fallacy/validation"
import { FallacyDetectionError } from "@/lib/fallacy/contracts"
import { OllamaFallacyDetectionProvider } from "@/lib/fallacy/ollama-provider"
import { FALLACY_TAXONOMY_VERSION } from "@/lib/fallacy/taxonomy"

describe("Phase 1: Ollama Pipeline Providers", () => {
  const analysisId = "00000000-0000-4000-8000-000000000001"
  const speakerId = "00000000-0000-4000-8000-000000000002"
  const segmentId = "00000000-0000-4000-8000-000000000003"
  const claimId = "00000000-0000-4000-8000-000000000004"
  const segmentText = "Solar costs declined 89% since 2010 according to the report."

  function sampleClaim(): InternalClaimFinding {
    return {
      id: claimId,
      analysis_id: analysisId,
      kind: "claim",
      text: "Solar costs declined 89%",
      paraphrase: false,
      confidence: { raw: 0.9, signals: { source_low_confidence: false } },
      confidence_band: null,
      state: "ok",
      person_involved: false,
      span_refs: [{ segment_id: segmentId, start_char: 0, end_char: 24 }],
      evidence_refs: [],
      produced_by_stage: "S2",
      claim: {
        claim_type: "factual",
        check_worthy: true,
        speaker_id: speakerId,
        speaker_label: "Speaker A",
      },
    }
  }

  describe("S3 — OllamaSupportAssessmentProvider", () => {
    it("evaluates explicit support with exact span grounding", async () => {
      const prepared = prepareSupportCalls(
        {
          analysisId,
          status: "analyzing",
          claims: [sampleClaim()],
          segments: [
            {
              id: segmentId,
              index: 0,
              text: segmentText,
              speakerId,
              lowConfidence: false,
            },
          ],
        },
        100_000,
        10,
      )
      expect(prepared.calls).toHaveLength(1)
      const call = prepared.calls[0]

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          message: {
            content: JSON.stringify({
              assessments: [
                {
                  claim_id: claimId,
                  state: "ok",
                  support_level: "present",
                  evidence_spans: [
                    {
                      segment_id: segmentId,
                      start_char: 0,
                      end_char: 24,
                      text: "Solar costs declined 89%",
                    },
                  ],
                  assessment_confidence: 0.92,
                  reason_code: "explicit_support",
                },
              ],
            }),
          },
        }),
      })
      vi.stubGlobal("fetch", mockFetch)

      const provider = new OllamaSupportAssessmentProvider({
        baseUrl: "http://127.0.0.1:11434",
        model: "phi3:mini",
        numCtx: 2048,
        numGpu: 99,
        timeoutMs: 5000,
      })

      const raw = await provider.assess({
        sourceBlock: wrapUntrustedSource(call.source).block,
        promptVersion: "s3-test",
        schemaVersion: "s3-schema",
        maxClaims: 10,
      })

      const validated = validateSupportAssessments(raw, call)
      expect(validated).toHaveLength(1)
      expect(validated[0].state).toBe("ok")
      expect(validated[0].supportLevel).toBe("present")
      expect(validated[0].reasonCode).toBe("explicit_support")
      expect(validated[0].spans).toHaveLength(1)
      expect(validated[0].spans[0].segment_id).toBe(segmentId)

      vi.unstubAllGlobals()
    })

    it("handles absent support and missing evidence gracefully", async () => {
      const prepared = prepareSupportCalls(
        {
          analysisId,
          status: "analyzing",
          claims: [sampleClaim()],
          segments: [
            {
              id: segmentId,
              index: 0,
              text: segmentText,
              speakerId,
              lowConfidence: false,
            },
          ],
        },
        100_000,
        10,
      )
      const call = prepared.calls[0]

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          message: {
            content: JSON.stringify({
              assessments: [
                {
                  claim_id: claimId,
                  state: "ok",
                  support_level: "absent",
                  evidence_spans: [],
                  assessment_confidence: 0.85,
                  reason_code: "no_support_found",
                },
              ],
            }),
          },
        }),
      })
      vi.stubGlobal("fetch", mockFetch)

      const provider = new OllamaSupportAssessmentProvider({
        baseUrl: "http://127.0.0.1:11434",
        model: "phi3:mini",
        numCtx: 2048,
        numGpu: 99,
        timeoutMs: 5000,
      })

      const raw = await provider.assess({
        sourceBlock: wrapUntrustedSource(call.source).block,
        promptVersion: "s3-test",
        schemaVersion: "s3-schema",
        maxClaims: 10,
      })

      const validated = validateSupportAssessments(raw, call)
      expect(validated).toHaveLength(1)
      expect(validated[0].state).toBe("ok")
      expect(validated[0].supportLevel).toBe("absent")
      expect(validated[0].reasonCode).toBe("no_support_found")

      vi.unstubAllGlobals()
    })

    it("handles insufficient evidence and model uncertainty cleanly", async () => {
      const prepared = prepareSupportCalls(
        {
          analysisId,
          status: "analyzing",
          claims: [sampleClaim()],
          segments: [
            { id: segmentId, index: 0, text: segmentText, speakerId, lowConfidence: false },
          ],
        },
        100_000,
        10,
      )
      const call = prepared.calls[0]

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          message: {
            content: JSON.stringify({
              assessments: [
                {
                  claim_id: claimId,
                  state: "insufficient",
                  support_level: null,
                  evidence_spans: [],
                  assessment_confidence: 0.5,
                  reason_code: "model_uncertain",
                },
              ],
            }),
          },
        }),
      })
      vi.stubGlobal("fetch", mockFetch)

      const provider = new OllamaSupportAssessmentProvider({
        baseUrl: "http://127.0.0.1:11434",
        model: "phi3:mini",
        numCtx: 2048,
        numGpu: 99,
        timeoutMs: 5000,
      })

      const raw = await provider.assess({
        sourceBlock: wrapUntrustedSource(call.source).block,
        promptVersion: "s3-test",
        schemaVersion: "s3-schema",
        maxClaims: 10,
      })

      const validated = validateSupportAssessments(raw, call)
      expect(validated).toHaveLength(1)
      expect(validated[0].state).toBe("insufficient")
      expect(validated[0].supportLevel).toBeNull()
      expect(validated[0].reasonCode).toBe("model_uncertain")

      vi.unstubAllGlobals()
    })

    it("deduplicates multiple identical evidence spans", async () => {
      const prepared = prepareSupportCalls(
        {
          analysisId,
          status: "analyzing",
          claims: [sampleClaim()],
          segments: [
            { id: segmentId, index: 0, text: segmentText, speakerId, lowConfidence: false },
          ],
        },
        100_000,
        10,
      )
      const call = prepared.calls[0]

      // Duplicate span in raw output
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          message: {
            content: JSON.stringify({
              assessments: [
                {
                  claim_id: claimId,
                  state: "ok",
                  support_level: "present",
                  evidence_spans: [
                    {
                      segment_id: segmentId,
                      text: "Solar costs declined 89%",
                    },
                    {
                      segment_id: segmentId,
                      text: "Solar costs declined 89%",
                    },
                  ],
                  assessment_confidence: 0.9,
                  reason_code: "explicit_support",
                },
              ],
            }),
          },
        }),
      })
      vi.stubGlobal("fetch", mockFetch)

      const provider = new OllamaSupportAssessmentProvider({
        baseUrl: "http://127.0.0.1:11434",
        model: "phi3:mini",
        numCtx: 2048,
        numGpu: 99,
        timeoutMs: 5000,
      })

      const raw = await provider.assess({
        sourceBlock: wrapUntrustedSource(call.source).block,
        promptVersion: "s3-test",
        schemaVersion: "s3-schema",
        maxClaims: 10,
      })

      const validated = validateSupportAssessments(raw, call)
      expect(validated).toHaveLength(1)
      expect(validated[0].spans).toHaveLength(1) // Successfully deduplicated

      vi.unstubAllGlobals()
    })

    it("safely throws SupportAssessmentError on malformed JSON", async () => {
      const prepared = prepareSupportCalls(
        {
          analysisId,
          status: "analyzing",
          claims: [sampleClaim()],
          segments: [
            { id: segmentId, index: 0, text: segmentText, speakerId, lowConfidence: false },
          ],
        },
        100_000,
        10,
      )
      const call = prepared.calls[0]

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          message: { content: "This is not valid JSON {{{" },
        }),
      })
      vi.stubGlobal("fetch", mockFetch)

      const provider = new OllamaSupportAssessmentProvider({
        baseUrl: "http://127.0.0.1:11434",
        model: "phi3:mini",
        numCtx: 2048,
        numGpu: 99,
        timeoutMs: 5000,
      })

      await expect(
        provider.assess({
          sourceBlock: wrapUntrustedSource(call.source).block,
          promptVersion: "s3-test",
          schemaVersion: "s3-schema",
          maxClaims: 10,
        }),
      ).rejects.toThrow(SupportAssessmentError)

      vi.unstubAllGlobals()
    })
  })

  describe("S4 — OllamaStructureMappingProvider", () => {
    it("maps Toulmin structure with grounded claim root and data nodes", async () => {
      const claimObj = sampleClaim()
      const supportFinding = {
        id: "support-finding-1",
        analysis_id: analysisId,
        kind: "support" as const,
        text: "Solar costs declined 89%",
        paraphrase: false,
        confidence: { raw: 0.9, signals: { source_low_confidence: false } },
        confidence_band: null,
        state: "ok" as const,
        person_involved: false,
        span_refs: [{ segment_id: segmentId, start_char: 0, end_char: 24 }],
        evidence_refs: [],
        produced_by_stage: "S3" as const,
        support: {
          claim_id: claimId,
          support_level: "present" as const,
          rationale: "Explicit support provided",
          reason_code: "explicit_support" as const,
          anchor_role: "support_evidence" as const,
        },
      }

      const prepared = prepareStructureCalls(
        {
          analysisId,
          status: "analyzing",
          claims: [claimObj],
          supports: [supportFinding],
          segments: [
            {
              id: segmentId,
              index: 0,
              text: segmentText,
              speakerId,
              lowConfidence: false,
            },
          ],
        },
        100_000,
        10,
      )
      expect(prepared.calls).toHaveLength(1)
      const call = prepared.calls[0]

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          message: {
            content: JSON.stringify({
              graphs: [
                {
                  claim_id: claimId,
                  state: "ok",
                  reason_code: "mapped",
                  nodes: [
                    {
                      node_id: "claim_node",
                      role: "claim",
                      inferred: false,
                      text: claimObj.text,
                      anchor_span: {
                        segment_id: segmentId,
                        start_char: 0,
                        end_char: 24,
                        text: "Solar costs declined 89%",
                      },
                      confidence: 0.95,
                    },
                  ],
                  edges: [],
                },
              ],
            }),
          },
        }),
      })
      vi.stubGlobal("fetch", mockFetch)

      const provider = new OllamaStructureMappingProvider({
        baseUrl: "http://127.0.0.1:11434",
        model: "phi3:mini",
        numCtx: 2048,
        numGpu: 99,
        timeoutMs: 5000,
      })

      const raw = await provider.map({
        sourceBlock: wrapUntrustedSource(call.source).block,
        promptVersion: "s4-test",
        schemaVersion: "s4-schema",
        maxClaims: 10,
        maxNodesPerClaim: 10,
        maxEdgesPerClaim: 20,
      })

      const validated = validateStructureMappings(raw, call, {
        maxNodesPerClaim: 10,
        maxEdgesPerClaim: 20,
      })
      expect(validated).toHaveLength(1)
      expect(validated[0].claimId).toBe(claimId)
      expect(validated[0].nodes).toHaveLength(1)
      expect(validated[0].nodes[0].role).toBe("claim")

      vi.unstubAllGlobals()
    })

    it("falls back to unclear structure when model cannot reliably map", async () => {
      const claimObj = sampleClaim()
      const supportFinding = {
        id: "support-finding-1",
        analysis_id: analysisId,
        kind: "support" as const,
        text: "Solar costs declined 89%",
        paraphrase: false,
        confidence: { raw: 0.9, signals: { source_low_confidence: false } },
        confidence_band: null,
        state: "ok" as const,
        person_involved: false,
        span_refs: [{ segment_id: segmentId, start_char: 0, end_char: 24 }],
        evidence_refs: [],
        produced_by_stage: "S3" as const,
        support: {
          claim_id: claimId,
          support_level: "absent" as const,
          rationale: "No support found",
          reason_code: "no_support_found" as const,
          anchor_role: "support_evidence" as const,
        },
      }

      const prepared = prepareStructureCalls(
        {
          analysisId,
          status: "analyzing",
          claims: [claimObj],
          supports: [supportFinding],
          segments: [
            { id: segmentId, index: 0, text: segmentText, speakerId, lowConfidence: false },
          ],
        },
        100_000,
        10,
      )
      const call = prepared.calls[0]

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          message: {
            content: JSON.stringify({
              graphs: [
                {
                  claim_id: claimId,
                  state: "insufficient",
                  reason_code: "unclear_structure",
                  nodes: [],
                  edges: [],
                },
              ],
            }),
          },
        }),
      })
      vi.stubGlobal("fetch", mockFetch)

      const provider = new OllamaStructureMappingProvider({
        baseUrl: "http://127.0.0.1:11434",
        model: "phi3:mini",
        numCtx: 2048,
        numGpu: 99,
        timeoutMs: 5000,
      })

      const raw = await provider.map({
        sourceBlock: wrapUntrustedSource(call.source).block,
        promptVersion: "s4-test",
        schemaVersion: "s4-schema",
        maxClaims: 10,
        maxNodesPerClaim: 10,
        maxEdgesPerClaim: 20,
      })

      const validated = validateStructureMappings(raw, call, {
        maxNodesPerClaim: 10,
        maxEdgesPerClaim: 20,
      })
      expect(validated).toHaveLength(1)
      expect(validated[0].claimId).toBe(claimId)
      expect(validated[0].nodes[0].state).toBe("insufficient")

      vi.unstubAllGlobals()
    })

    it("safely throws StructureMappingError on malformed JSON", async () => {
      const claimObj = sampleClaim()
      const supportFinding = {
        id: "support-finding-1",
        analysis_id: analysisId,
        kind: "support" as const,
        text: "Solar costs declined 89%",
        paraphrase: false,
        confidence: { raw: 0.9, signals: { source_low_confidence: false } },
        confidence_band: null,
        state: "ok" as const,
        person_involved: false,
        span_refs: [{ segment_id: segmentId, start_char: 0, end_char: 24 }],
        evidence_refs: [],
        produced_by_stage: "S3" as const,
        support: {
          claim_id: claimId,
          support_level: "present" as const,
          rationale: "Explicit support provided",
          reason_code: "explicit_support" as const,
          anchor_role: "support_evidence" as const,
        },
      }

      const prepared = prepareStructureCalls(
        {
          analysisId,
          status: "analyzing",
          claims: [claimObj],
          supports: [supportFinding],
          segments: [
            { id: segmentId, index: 0, text: segmentText, speakerId, lowConfidence: false },
          ],
        },
        100_000,
        10,
      )
      const call = prepared.calls[0]

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          message: { content: "Bad json output {" },
        }),
      })
      vi.stubGlobal("fetch", mockFetch)

      const provider = new OllamaStructureMappingProvider({
        baseUrl: "http://127.0.0.1:11434",
        model: "phi3:mini",
        numCtx: 2048,
        numGpu: 99,
        timeoutMs: 5000,
      })

      await expect(
        provider.map({
          sourceBlock: wrapUntrustedSource(call.source).block,
          promptVersion: "s4-test",
          schemaVersion: "s4-schema",
          maxClaims: 10,
          maxNodesPerClaim: 10,
          maxEdgesPerClaim: 20,
        }),
      ).rejects.toThrow(StructureMappingError)

      vi.unstubAllGlobals()
    })
  })

  describe("S5 — OllamaFallacyDetectionProvider", () => {
    it("detects genuine fallacy pattern with verified transcript span", async () => {
      const fallacySegmentText =
        "Either we bankrupt the economy chasing arbitrary timelines, or we maintain security."
      const segments = [
        {
          id: segmentId,
          text: fallacySegmentText,
          lowConfidence: false,
          personInvolved: false,
        },
      ]

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          message: {
            content: JSON.stringify({
              taxonomy_version: FALLACY_TAXONOMY_VERSION,
              findings: [
                {
                  taxonomy_id: "LF_FALSE_DILEMMA",
                  segment_id: segmentId,
                  start_char: 0,
                  end_char: fallacySegmentText.length,
                  text: fallacySegmentText,
                  framing: "possible",
                  person_involved: false,
                  confidence: 0.95,
                },
              ],
            }),
          },
        }),
      })
      vi.stubGlobal("fetch", mockFetch)

      const provider = new OllamaFallacyDetectionProvider({
        baseUrl: "http://127.0.0.1:11434",
        model: "phi3:mini",
        numCtx: 2048,
        numGpu: 99,
        timeoutMs: 5000,
      })

      const sourceBlock = JSON.stringify({
        task: "Identify only clearly present possible taxonomy patterns.",
        source_claim: { id: claimId, text: "Sample claim", spans: [] },
        structure: [],
        transcript_segments: segments,
      })

      const raw = await provider.detect({
        sourceBlock: wrapUntrustedSource(sourceBlock).block,
        promptVersion: "s5-test",
        schemaVersion: "s5-schema",
        maxFindings: 10,
      })

      const result = validateFallacyDetection(raw, segments, {
        precisionThreshold: 0.9,
      })
      expect(result.findings).toHaveLength(1)
      expect(result.findings[0].taxonomyId).toBe("LF_FALSE_DILEMMA")
      expect(result.findings[0].span.text).toBe(fallacySegmentText)

      vi.unstubAllGlobals()
    })

    it("negative control: abstains from flagging clean non-fallacious dialogue", async () => {
      const cleanText =
        "The 2024 Integration study found curtailment increases above 60% penetration."
      const segments = [
        {
          id: segmentId,
          text: cleanText,
          lowConfidence: false,
          personInvolved: false,
        },
      ]

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          message: {
            content: JSON.stringify({
              taxonomy_version: FALLACY_TAXONOMY_VERSION,
              findings: [],
            }),
          },
        }),
      })
      vi.stubGlobal("fetch", mockFetch)

      const provider = new OllamaFallacyDetectionProvider({
        baseUrl: "http://127.0.0.1:11434",
        model: "phi3:mini",
        numCtx: 2048,
        numGpu: 99,
        timeoutMs: 5000,
      })

      const sourceBlock = JSON.stringify({
        task: "Identify only clearly present possible taxonomy patterns.",
        source_claim: { id: claimId, text: "Curtailed power", spans: [] },
        structure: [],
        transcript_segments: segments,
      })

      const raw = await provider.detect({
        sourceBlock: wrapUntrustedSource(sourceBlock).block,
        promptVersion: "s5-test",
        schemaVersion: "s5-schema",
        maxFindings: 10,
      })

      const result = validateFallacyDetection(raw, segments, {
        precisionThreshold: 0.9,
      })
      expect(result.findings).toHaveLength(0)
      expect(result.message).toContain("No likely fallacies")

      vi.unstubAllGlobals()
    })

    it("negative control: filters false-cause false positives on scientific study citations", async () => {
      const studyCitationText =
        "According to the National Renewable Energy Laboratory 2024 study, curtailment increases above 60%."
      const segments = [
        {
          id: segmentId,
          text: studyCitationText,
          lowConfidence: false,
          personInvolved: false,
        },
      ]

      // Model mistakenly proposes LF_FALSE_CAUSE on study citation
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          message: {
            content: JSON.stringify({
              taxonomy_version: FALLACY_TAXONOMY_VERSION,
              findings: [
                {
                  taxonomy_id: "LF_FALSE_CAUSE",
                  segment_id: segmentId,
                  text: studyCitationText,
                  framing: "possible",
                  person_involved: false,
                  confidence: 0.92,
                },
              ],
            }),
          },
        }),
      })
      vi.stubGlobal("fetch", mockFetch)

      const provider = new OllamaFallacyDetectionProvider({
        baseUrl: "http://127.0.0.1:11434",
        model: "phi3:mini",
        numCtx: 2048,
        numGpu: 99,
        timeoutMs: 5000,
      })

      const sourceBlock = JSON.stringify({
        task: "Identify only clearly present possible taxonomy patterns.",
        source_claim: { id: claimId, text: "Curtailed power", spans: [] },
        structure: [],
        transcript_segments: segments,
      })

      const raw = await provider.detect({
        sourceBlock: wrapUntrustedSource(sourceBlock).block,
        promptVersion: "s5-test",
        schemaVersion: "s5-schema",
        maxFindings: 10,
      })

      const result = validateFallacyDetection(raw, segments, {
        precisionThreshold: 0.9,
      })
      // Provider correctly filtered out the false-positive study citation
      expect(result.findings).toHaveLength(0)

      vi.unstubAllGlobals()
    })

    it("safely throws FallacyDetectionError on malformed JSON", async () => {
      const segments = [
        { id: segmentId, text: "Some text", lowConfidence: false, personInvolved: false },
      ]

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          message: { content: "Not json {{" },
        }),
      })
      vi.stubGlobal("fetch", mockFetch)

      const provider = new OllamaFallacyDetectionProvider({
        baseUrl: "http://127.0.0.1:11434",
        model: "phi3:mini",
        numCtx: 2048,
        numGpu: 99,
        timeoutMs: 5000,
      })

      const sourceBlock = JSON.stringify({
        task: "Identify only clearly present possible taxonomy patterns.",
        source_claim: { id: claimId, text: "Sample", spans: [] },
        structure: [],
        transcript_segments: segments,
      })

      await expect(
        provider.detect({
          sourceBlock: wrapUntrustedSource(sourceBlock).block,
          promptVersion: "s5-test",
          schemaVersion: "s5-schema",
          maxFindings: 10,
        }),
      ).rejects.toThrow(FallacyDetectionError)

      vi.unstubAllGlobals()
    })
  })
})
