import { describe, expect, it, vi } from "vitest"

import { StageSchemaRegistry } from "@/lib/ai/schema-registry"
import { runValidatedStage } from "@/lib/ai/stage-runner"
import { buildStructureViewModel } from "@/components/analysis/argument-structure-view"
import type {
  InternalClaimFinding,
  InternalSupportFinding,
  PublicStructureFinding,
  StructureEdge,
} from "@/lib/contracts/analysis"
import { prepareStructureCalls, validateStructureMappings } from "@/lib/structure/mapping"
import { structureMappingJsonSchema } from "@/lib/structure/contracts"
import { OpenAIStructureMappingProvider } from "@/lib/structure/openai-provider"

const analysisId = "00000000-0000-4000-8000-000000000001"
const speakerId = "00000000-0000-4000-8000-000000000002"
const segmentId = "00000000-0000-4000-8000-000000000003"
const claimId = "00000000-0000-4000-8000-000000000004"
const supportId = "00000000-0000-4000-8000-000000000005"
const claimText = "The city should expand transit."
const dataText = "A survey supports the plan."
const segmentText = `${claimText} ${dataText}`
const dataStart = segmentText.indexOf(dataText)

const claim: InternalClaimFinding = {
  id: claimId,
  analysis_id: analysisId,
  kind: "claim",
  text: claimText,
  paraphrase: false,
  confidence: { raw: 0.88, signals: { source_low_confidence: false } },
  confidence_band: null,
  state: "ok",
  person_involved: false,
  span_refs: [{ segment_id: segmentId, start_char: 0, end_char: claimText.length }],
  evidence_refs: [],
  produced_by_stage: "S2",
  claim: {
    claim_type: "policy",
    check_worthy: false,
    speaker_id: speakerId,
    speaker_label: "Speaker 1",
  },
}

const support: InternalSupportFinding = {
  id: supportId,
  analysis_id: analysisId,
  kind: "support",
  text: "The speaker provided explicit support for this claim in the transcript.",
  paraphrase: false,
  confidence: { raw: 0.8 },
  confidence_band: null,
  state: "ok",
  person_involved: false,
  span_refs: [
    { segment_id: segmentId, start_char: dataStart, end_char: dataStart + dataText.length },
  ],
  evidence_refs: [],
  produced_by_stage: "S3",
  support: {
    claim_id: claimId,
    support_level: "present",
    rationale: "The speaker provided explicit support for this claim in the transcript.",
    reason_code: "explicit_support",
    anchor_role: "support_evidence",
  },
}

function call() {
  return prepareStructureCalls(
    {
      analysisId,
      status: "analyzing",
      claims: [claim],
      supports: [support],
      segments: [{ id: segmentId, index: 0, text: segmentText, speakerId, lowConfidence: false }],
    },
    100_000,
    10,
  ).calls[0]
}

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    graphs: [
      {
        claim_id: claimId,
        state: "ok",
        reason_code: "mapped",
        nodes: [
          {
            node_id: "claim-root",
            role: "claim",
            inferred: false,
            text: claimText,
            anchor_span: {
              segment_id: segmentId,
              start_char: 0,
              end_char: claimText.length,
              text: claimText,
            },
            confidence: 0.9,
          },
          {
            node_id: "data-1",
            role: "data",
            inferred: false,
            text: dataText,
            anchor_span: {
              segment_id: segmentId,
              start_char: dataStart,
              end_char: dataStart + dataText.length,
              text: dataText,
            },
            confidence: 0.8,
          },
          {
            node_id: "warrant-1",
            role: "warrant",
            inferred: true,
            text: "Public support is a reason to expand transit.",
            anchor_span: {
              segment_id: segmentId,
              start_char: 0,
              end_char: claimText.length,
              text: claimText,
            },
            confidence: 0.8,
          },
        ],
        edges: [
          { from_node_id: "data-1", to_node_id: "claim-root", relation: "supports" },
          { from_node_id: "warrant-1", to_node_id: "claim-root", relation: "warrants" },
        ],
        ...overrides,
      },
    ],
  }
}

describe("F5 grounded Toulmin mapping", () => {
  it("validates grounded nodes, directed role edges, and lowers inferred confidence", () => {
    const graph = validateStructureMappings(candidate(), call(), {
      maxNodesPerClaim: 20,
      maxEdgesPerClaim: 40,
    })[0]
    expect(graph.nodes.find((node) => node.tempId === "warrant-1")).toMatchObject({
      inferred: true,
      anchorRole: "inference_context",
      confidence: 0.4,
    })
    expect(graph.edges).toHaveLength(2)
  })

  it("rejects missing claim coverage, dangling edges, invalid roles, and ungrounded text", () => {
    const limits = { maxNodesPerClaim: 20, maxEdgesPerClaim: 40 }
    expect(() => validateStructureMappings({ graphs: [] }, call(), limits)).toThrow()
    expect(() =>
      validateStructureMappings(
        candidate({
          edges: [{ from_node_id: "missing", to_node_id: "claim-root", relation: "supports" }],
        }),
        call(),
        limits,
      ),
    ).toThrow()
    expect(() =>
      validateStructureMappings(
        candidate({
          edges: [{ from_node_id: "data-1", to_node_id: "claim-root", relation: "backs" }],
        }),
        call(),
        limits,
      ),
    ).toThrow()
    const altered = candidate()
    altered.graphs[0].nodes[1].text = "Invented data"
    expect(() => validateStructureMappings(altered, call(), limits)).toThrow()
  })

  it("turns provider abstention into one server-owned unclear node", () => {
    const result = validateStructureMappings(
      {
        graphs: [
          {
            claim_id: claimId,
            state: "insufficient",
            reason_code: "unclear_structure",
            nodes: [],
            edges: [],
          },
        ],
      },
      call(),
      { maxNodesPerClaim: 20, maxEdgesPerClaim: 40 },
    )[0]
    expect(result.nodes).toHaveLength(1)
    expect(result.nodes[0]).toMatchObject({
      role: "claim",
      state: "insufficient",
      anchorRole: "claim_subject",
      confidence: null,
    })
    expect(result.nodes[0].text).toContain("could not be mapped reliably")
  })

  it("deterministically abstains for uncertain source attribution and oversized context", () => {
    const uncertain = prepareStructureCalls(
      {
        analysisId,
        status: "analyzing",
        claims: [
          {
            ...claim,
            confidence: { raw: 0.8, signals: { source_low_confidence: true } },
          },
        ],
        supports: [support],
        segments: [{ id: segmentId, index: 0, text: segmentText, speakerId, lowConfidence: false }],
      },
      100_000,
      10,
    )
    expect(uncertain.calls).toHaveLength(0)
    expect(uncertain.deterministic[0].nodes[0].state).toBe("insufficient")

    const oversized = prepareStructureCalls(
      {
        analysisId,
        status: "analyzing",
        claims: [claim],
        supports: [support],
        segments: [{ id: segmentId, index: 0, text: segmentText, speakerId, lowConfidence: false }],
      },
      10,
      10,
    )
    expect(oversized.calls).toHaveLength(0)
    expect(oversized.deterministic).toHaveLength(1)
  })

  it("retries semantically invalid structured output", async () => {
    const registry = new StageSchemaRegistry()
    registry.register("structure", structureMappingJsonSchema)
    const invoke = vi
      .fn()
      .mockResolvedValueOnce(candidate({ nodes: [] }))
      .mockResolvedValueOnce(candidate())
    const result = await runValidatedStage({
      stage: "S4",
      schemaKey: "structure",
      source: call().source,
      registry,
      invoke,
      transformValidated: (value) =>
        validateStructureMappings(value, call(), {
          maxNodesPerClaim: 20,
          maxEdgesPerClaim: 40,
        }),
    })
    expect(result.attempts).toBe(2)
    expect(result.output[0].nodes).toHaveLength(3)
  })
})

describe("F5 OpenAI adapter and Map/List parity model", () => {
  it("uses strict schema without tools or storage", async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            status: "completed",
            output: [
              {
                type: "message",
                content: [{ type: "output_text", text: JSON.stringify(candidate()) }],
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    )
    const provider = new OpenAIStructureMappingProvider({
      apiKey: "secret",
      apiUrl: "https://api.openai.com/v1/responses",
      model: "gpt-5.6",
      timeoutMs: 5_000,
      maxOutputTokens: 8_000,
      fetchImpl,
    })
    await expect(
      provider.map({
        sourceBlock: "<<<SOURCE>>>data<<<END>>>",
        promptVersion: "p1",
        schemaVersion: "s1",
        maxClaims: 10,
        maxNodesPerClaim: 20,
        maxEdgesPerClaim: 40,
      }),
    ).resolves.toEqual(candidate())
    const body = JSON.parse(String(fetchImpl.mock.calls[0][1]?.body)) as Record<string, unknown>
    expect(body).not.toHaveProperty("tools")
    expect(body).toMatchObject({
      store: false,
      text: { format: { type: "json_schema", strict: true } },
    })
  })

  it("handles explicit refusal without inventing structure", async () => {
    const provider = new OpenAIStructureMappingProvider({
      apiKey: "secret",
      apiUrl: "https://api.openai.com/v1/responses",
      model: "gpt-5.6",
      timeoutMs: 5_000,
      maxOutputTokens: 8_000,
      fetchImpl: vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              status: "completed",
              output: [{ type: "message", content: [{ type: "refusal", refusal: "declined" }] }],
            }),
            { status: 200 },
          ),
      ),
    })
    await expect(
      provider.map({
        sourceBlock: "data",
        promptVersion: "p1",
        schemaVersion: "s1",
        maxClaims: 10,
        maxNodesPerClaim: 20,
        maxEdgesPerClaim: 40,
      }),
    ).rejects.toMatchObject({ code: "STRUCTURE_PROVIDER_REFUSAL", retryable: false })
  })

  it("builds map and accessible-list data from the identical node and edge set", () => {
    const rootId = "00000000-0000-4000-8000-000000000010"
    const dataId = "00000000-0000-4000-8000-000000000011"
    const base = {
      analysis_id: analysisId,
      kind: "structure" as const,
      paraphrase: false,
      confidence_band: null,
      state: "ok" as const,
      person_involved: false,
      evidence_refs: [],
      produced_by_stage: "S4" as const,
    }
    const findings: PublicStructureFinding[] = [
      {
        ...base,
        id: rootId,
        text: claimText,
        span_refs: claim.span_refs,
        structure: {
          source_claim_id: claimId,
          role: "claim",
          inferred: false,
          anchor_role: "asserted_content",
        },
      },
      {
        ...base,
        id: dataId,
        text: dataText,
        span_refs: support.span_refs,
        structure: {
          source_claim_id: claimId,
          role: "data",
          inferred: false,
          anchor_role: "asserted_content",
        },
      },
    ]
    const edges: StructureEdge[] = [
      {
        id: "00000000-0000-4000-8000-000000000012",
        analysis_id: analysisId,
        from_finding_id: dataId,
        to_finding_id: rootId,
        relation: "supports",
      },
    ]
    const view = buildStructureViewModel(findings, edges)
    expect(view.nodes.map((node) => node.id)).toEqual([rootId, dataId])
    expect(view.edges).toHaveLength(1)
    expect(view.edges[0]).toMatchObject({ from: { id: dataId }, to: { id: rootId } })
  })
})
