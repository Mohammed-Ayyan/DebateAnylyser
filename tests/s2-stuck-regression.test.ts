import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"

import { wrapUntrustedSource } from "@/lib/ai/content-boundary"
import { ClaimExtractionError } from "@/lib/claims/contracts"
import { OllamaClaimExtractionProvider } from "@/lib/claims/ollama-provider"
import { processClaimedClaimJob } from "@/lib/claims/worker"
import { assessReplayWindow } from "@/lib/events/replay-window"
import { encodeSseEvent, parseEventCursor, shouldEmitPublicAnalysisEvent } from "@/lib/events/sse"

describe("S2 Stuck Regression & Recovery Test Suite", () => {
  const analysisId = "00000000-0000-4000-8000-000000000001"
  const segmentId = "00000000-0000-4000-8000-000000000002"
  const findingId = "00000000-0000-4000-8000-000000000005"
  const segmentText = "The proposed infrastructure bill allocates $50 billion for bridges."

  const sampleSourceBlock = wrapUntrustedSource(
    JSON.stringify({
      segments: [
        {
          segment_id: segmentId,
          segment_index: 0,
          speaker_label: "Speaker 1",
          text: segmentText,
        },
      ],
    }),
  ).block

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("1. Successful S2 extraction and exact span grounding", () => {
    it("extracts explicit claims and validates character spans against segment text", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          message: {
            content: JSON.stringify({
              claims: [
                {
                  segment_index: 0,
                  claim_text: "The proposed infrastructure bill allocates $50 billion for bridges.",
                  claim_type: "factual",
                  check_worthy: true,
                  extraction_confidence: 0.95,
                },
              ],
            }),
          },
        }),
      })
      vi.stubGlobal("fetch", mockFetch)

      const provider = new OllamaClaimExtractionProvider({
        baseUrl: "http://127.0.0.1:11434",
        model: "phi3:mini",
        numCtx: 4096,
        numGpu: 99,
        timeoutMs: 5000,
      })

      const result = (await provider.extract({
        sourceBlock: sampleSourceBlock,
        promptVersion: "v1",
        schemaVersion: "v1",
        maxClaims: 10,
      })) as { claims: Array<{ text: string; start_char: number; end_char: number; claim_type: string }> }

      expect(result.claims).toHaveLength(1)
      expect(result.claims[0].text).toBe(segmentText)
      expect(result.claims[0].start_char).toBe(0)
      expect(result.claims[0].end_char).toBe(segmentText.length)
      expect(result.claims[0].claim_type).toBe("factual")
    })
  })

  describe("2. Ollama unavailable", () => {
    it("throws retryable CLAIM_PROVIDER_UNAVAILABLE on 503", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => "Service Unavailable",
      })
      vi.stubGlobal("fetch", mockFetch)

      const provider = new OllamaClaimExtractionProvider({
        baseUrl: "http://127.0.0.1:11434",
        model: "phi3:mini",
        numCtx: 4096,
        numGpu: 99,
        timeoutMs: 5000,
      })

      await expect(
        provider.extract({
          sourceBlock: sampleSourceBlock,
          promptVersion: "v1",
          schemaVersion: "v1",
          maxClaims: 10,
        }),
      ).rejects.toThrowError(ClaimExtractionError)
    })

    it("throws retryable CLAIM_PROVIDER_NETWORK_ERROR on fetch connection failure", async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error("fetch failed: ECONNREFUSED"))
      vi.stubGlobal("fetch", mockFetch)

      const provider = new OllamaClaimExtractionProvider({
        baseUrl: "http://127.0.0.1:11434",
        model: "phi3:mini",
        numCtx: 4096,
        numGpu: 99,
        timeoutMs: 5000,
      })

      await expect(
        provider.extract({
          sourceBlock: sampleSourceBlock,
          promptVersion: "v1",
          schemaVersion: "v1",
          maxClaims: 10,
        }),
      ).rejects.toThrowError(ClaimExtractionError)
    })
  })

  describe("3. Ollama timeout", () => {
    it("aborts and throws CLAIM_PROVIDER_TIMEOUT when inference exceeds timeoutMs", async () => {
      const mockFetch = vi.fn().mockImplementation((_url, init) => {
        return new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () => {
            reject(new Error("The operation was aborted"))
          })
        })
      })
      vi.stubGlobal("fetch", mockFetch)

      const provider = new OllamaClaimExtractionProvider({
        baseUrl: "http://127.0.0.1:11434",
        model: "phi3:mini",
        numCtx: 4096,
        numGpu: 99,
        timeoutMs: 50, // Short timeout
      })

      await expect(
        provider.extract({
          sourceBlock: sampleSourceBlock,
          promptVersion: "v1",
          schemaVersion: "v1",
          maxClaims: 10,
        }),
      ).rejects.toThrowError(/timed out/)
    })
  })

  describe("4. Malformed or empty model output", () => {
    it("throws CLAIM_PROVIDER_INCOMPLETE on empty message content", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ message: { content: "" } }),
      })
      vi.stubGlobal("fetch", mockFetch)

      const provider = new OllamaClaimExtractionProvider({
        baseUrl: "http://127.0.0.1:11434",
        model: "phi3:mini",
        numCtx: 4096,
        numGpu: 99,
        timeoutMs: 5000,
      })

      await expect(
        provider.extract({
          sourceBlock: sampleSourceBlock,
          promptVersion: "v1",
          schemaVersion: "v1",
          maxClaims: 10,
        }),
      ).rejects.toThrowError(/empty response/)
    })

    it("throws CLAIM_PROVIDER_INVALID_JSON on non-JSON content", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ message: { content: "I am unable to parse this transcript." } }),
      })
      vi.stubGlobal("fetch", mockFetch)

      const provider = new OllamaClaimExtractionProvider({
        baseUrl: "http://127.0.0.1:11434",
        model: "phi3:mini",
        numCtx: 4096,
        numGpu: 99,
        timeoutMs: 5000,
      })

      await expect(
        provider.extract({
          sourceBlock: sampleSourceBlock,
          promptVersion: "v1",
          schemaVersion: "v1",
          maxClaims: 10,
        }),
      ).rejects.toThrowError(/invalid JSON/i)
    })
  })

  describe("5. Worker failure during S2", () => {
    it("safely retries retryable extraction error", async () => {
      const calls: string[] = []
      const dependencies = {
        providerFactory: vi.fn(() => ({
          extract: vi.fn(async () => {
            throw new ClaimExtractionError("CLAIM_PROVIDER_UNAVAILABLE", "Ollama down", true)
          }),
        })),
        renewJob: vi.fn(async () => true),
        advanceJob: vi.fn(async () => true),
        completeJob: vi.fn(async () => true),
        retryJob: vi.fn(async () => {
          calls.push("retry")
          return true
        }),
        failJob: vi.fn(async () => {
          calls.push("fail")
          return true
        }),
        loadTranscript: vi.fn(async () => ({
          analysisId,
          transcriptId: "00000000-0000-4000-8000-000000000004",
          segments: [{ id: segmentId, index: 0, text: segmentText, speakerId: null, speakerLabel: null, speakerIsNamedPerson: false, lowConfidence: false }],
        })),
        getSnapshot: vi.fn(async () => undefined),
        persist: vi.fn(async () => ({ created: true, findings: [] })),
        failRunningAttempts: vi.fn(async () => {}),
        createAttempt: vi.fn(async () => ({ id: "00000000-0000-4000-8000-000000000006", stage: "S2" as const, attempt: 1, startedAt: new Date() })),
        transitionStage: vi.fn(async () => {}),
        transitionAnalysis: vi.fn(async () => {}),
        appendEvent: vi.fn(async () => ({ sequence: 1n, event: { type: "stage.status" as const, stage: "S2" as const, status: "running" as const, attempt: 1 } })),
        recordInjection: vi.fn(async () => {}),
        supportAssessmentEnabled: false,
        evidenceRetrievalEnabled: false,
        now: () => new Date(),
      } as unknown as import("@/lib/claims/worker").ClaimWorkerDependencies

      await processClaimedClaimJob(
        {
          id: "job-1",
          analysisId,
          stage: "S2",
          attempts: 1,
          lockToken: "token-1",
          lockedAt: new Date(),
        },
        dependencies,
      )

      expect(calls).toContain("retry")
    })
  })

  describe("6. Stale job recovery & Idempotency", () => {
    it("skips duplicate extraction and reuses snapshot when already persisted", async () => {
      const calls: string[] = []
      const existingFindings = [
        {
          id: findingId,
          analysis_id: analysisId,
          kind: "claim" as const,
          text: segmentText,
          paraphrase: false,
          confidence: { raw: 0.9 },
          confidence_band: null,
          state: "ok" as const,
          person_involved: false,
          span_refs: [{ segment_id: segmentId, start_char: 0, end_char: segmentText.length }],
          evidence_refs: [],
          produced_by_stage: "S2" as const,
          claim: { claim_type: "factual" as const, check_worthy: true, speaker_id: null, speaker_label: null },
        },
      ]

      const dependencies = {
        providerFactory: vi.fn(() => ({
          extract: vi.fn(async () => {
            calls.push("extracted")
            return { claims: [] }
          }),
        })),
        renewJob: vi.fn(async () => true),
        advanceJob: vi.fn(async (_id, _token, _expected, next) => {
          calls.push(`advance.${next}`)
          return true
        }),
        completeJob: vi.fn(async () => {
          calls.push("complete")
          return true
        }),
        retryJob: vi.fn(async () => true),
        failJob: vi.fn(async () => true),
        loadTranscript: vi.fn(async () => ({
          analysisId,
          transcriptId: "00000000-0000-4000-8000-000000000004",
          segments: [{ id: segmentId, index: 0, text: segmentText, speakerId: null, speakerLabel: null, speakerIsNamedPerson: false, lowConfidence: false }],
        })),
        getSnapshot: vi.fn(async () => ({
          status: "complete" as const,
          attempt: 1,
          findings: existingFindings,
        })),
        persist: vi.fn(async () => {
          calls.push("persisted")
          return { created: false, findings: existingFindings }
        }),
        failRunningAttempts: vi.fn(async () => {}),
        createAttempt: vi.fn(async () => ({ id: "00000000-0000-4000-8000-000000000006", stage: "S2" as const, attempt: 1, startedAt: new Date() })),
        transitionStage: vi.fn(async () => {}),
        transitionAnalysis: vi.fn(async () => {}),
        appendEvent: vi.fn(async () => ({ sequence: 1n, event: { type: "stage.status" as const, stage: "S2" as const, status: "complete" as const, attempt: 1 } })),
        recordInjection: vi.fn(async () => {}),
        supportAssessmentEnabled: false,
        evidenceRetrievalEnabled: false,
        now: () => new Date(),
      } as unknown as import("@/lib/claims/worker").ClaimWorkerDependencies

      await processClaimedClaimJob(
        {
          id: "job-1",
          analysisId,
          stage: "S2",
          attempts: 1,
          lockToken: "token-1",
          lockedAt: new Date(),
        },
        dependencies,
      )

      // When snapshot exists, LLM extraction is skipped!
      expect(calls).not.toContain("extracted")
      expect(calls).toContain("advance.S8")
    })
  })

  describe("7. SSE replay decisions and stream encoding", () => {
    it("handles replay window assessment correctly", () => {
      // Normal contiguous replay
      expect(
        assessReplayWindow({
          cursor: 2n,
          latestSequence: 5n,
          retainedSequences: [3n, 4n, 5n],
          replayLimit: 100,
        }),
      ).toBe("replay")

      // Gapped / pruned events
      expect(
        assessReplayWindow({
          cursor: 1n,
          latestSequence: 10n,
          retainedSequences: [5n, 6n, 7n],
          replayLimit: 100,
        }),
      ).toBe("reconcile-required")
    })

    it("encodes valid SSE messages with id, event, and data", () => {
      const sseString = encodeSseEvent(42n, {
        type: "stage.status",
        stage: "S2",
        status: "complete",
        attempt: 1,
      })

      expect(sseString).toBe(
        'id: 42\nevent: stage.status\ndata: {"type":"stage.status","stage":"S2","status":"complete","attempt":1}\n\n',
      )
    })

    it("parses event cursors robustly", () => {
      expect(parseEventCursor(null)).toBe(0n)
      expect(parseEventCursor("")).toBe(0n)
      expect(parseEventCursor("15")).toBe(15n)
      expect(() => parseEventCursor("-5")).toThrow()
      expect(() => parseEventCursor("abc")).toThrow()
    })
  })
})
