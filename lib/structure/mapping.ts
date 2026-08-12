import { escapeSourceDelimiters } from "@/lib/ai/content-boundary"
import type {
  InternalClaimFinding,
  InternalSupportFinding,
  SpanRef,
  StructureRelation,
  ToulminRole,
} from "@/lib/contracts/analysis"
import {
  StructureMappingError,
  structureMappingOutputSchema,
  type StructureCall,
  type StructureInput,
  type StructureMappingOutput,
  type StructureTranscriptSegment,
  type ValidatedStructureGraph,
} from "./contracts"

const UNCLEAR_TEXT = "The argument structure could not be mapped reliably from this transcript."

function sourceLowConfidence(claim: InternalClaimFinding): boolean {
  return claim.confidence?.signals?.source_low_confidence === true
}

function unclearGraph(claim: InternalClaimFinding): ValidatedStructureGraph {
  return {
    claimId: claim.id,
    nodes: [
      {
        tempId: `unclear-${claim.id}`,
        sourceClaimId: claim.id,
        role: "claim",
        inferred: false,
        text: UNCLEAR_TEXT,
        state: "insufficient",
        span: claim.span_refs[0],
        anchorRole: "claim_subject",
        confidence: null,
        personInvolved: claim.person_involved,
      },
    ],
    edges: [],
  }
}

function serializeCall(
  claims: InternalClaimFinding[],
  supports: InternalSupportFinding[],
  segments: StructureTranscriptSegment[],
): string {
  return JSON.stringify({
    claims: claims.map((claim) => ({
      claim_id: claim.id,
      text: claim.text,
      speaker_id: claim.claim.speaker_id,
      span_refs: claim.span_refs,
    })),
    speaker_support: supports.map((support) => ({
      claim_id: support.support.claim_id,
      level: support.support.support_level,
      state: support.state,
      rationale: support.support.rationale,
      anchor_role: support.support.anchor_role,
      span_refs: support.span_refs,
    })),
    grounded_segments: segments.map((segment) => ({
      segment_id: segment.id,
      segment_index: segment.index,
      speaker_id: segment.speakerId,
      low_confidence: segment.lowConfidence,
      text: segment.text,
    })),
  })
}

function relevantSegments(
  claims: InternalClaimFinding[],
  supports: InternalSupportFinding[],
  allSegments: StructureTranscriptSegment[],
): StructureTranscriptSegment[] {
  const ids = new Set([
    ...claims.flatMap((claim) => claim.span_refs.map((span) => span.segment_id)),
    ...supports.flatMap((support) => support.span_refs.map((span) => span.segment_id)),
  ])
  return allSegments.filter((segment) => ids.has(segment.id))
}

export function prepareStructureCalls(
  input: StructureInput,
  maxContextChars: number,
  maxClaimsPerCall: number,
): { calls: StructureCall[]; deterministic: ValidatedStructureGraph[] } {
  const deterministic: ValidatedStructureGraph[] = []
  const supportByClaim = new Map(
    input.supports.map((support) => [support.support.claim_id, support]),
  )
  const eligible: InternalClaimFinding[] = []
  for (const claim of input.claims) {
    const support = supportByClaim.get(claim.id)
    if (
      !claim.claim.speaker_id ||
      sourceLowConfidence(claim) ||
      !support ||
      support.state === "insufficient"
    ) {
      deterministic.push(unclearGraph(claim))
    } else {
      eligible.push(claim)
    }
  }

  const calls: StructureCall[] = []
  for (let offset = 0; offset < eligible.length; offset += maxClaimsPerCall) {
    const batch = eligible.slice(offset, offset + maxClaimsPerCall)
    const supports = batch.map((claim) => supportByClaim.get(claim.id)!)
    const segments = relevantSegments(batch, supports, input.segments)
    const source = serializeCall(batch, supports, segments)
    if (source.length > maxContextChars) {
      if (batch.length === 1) deterministic.push(unclearGraph(batch[0]))
      else {
        for (const claim of batch) {
          const support = supportByClaim.get(claim.id)!
          const claimSegments = relevantSegments([claim], [support], input.segments)
          const claimSource = serializeCall([claim], [support], claimSegments)
          if (claimSource.length > maxContextChars) deterministic.push(unclearGraph(claim))
          else
            calls.push({
              claims: [claim],
              supports: [support],
              segments: claimSegments,
              source: claimSource,
            })
        }
      }
    } else {
      calls.push({ claims: batch, supports, segments, source })
    }
  }
  return { calls, deterministic }
}

function spanKey(span: SpanRef): string {
  return `${span.segment_id}:${span.start_char}:${span.end_char}`
}

function spanWithin(span: SpanRef, anchors: SpanRef[]): boolean {
  return anchors.some(
    (anchor) =>
      anchor.segment_id === span.segment_id &&
      span.start_char >= anchor.start_char &&
      span.end_char <= anchor.end_char,
  )
}

function relationAllowed(
  relation: StructureRelation,
  fromRole: ToulminRole,
  toRole: ToulminRole,
): boolean {
  const pairs: Record<StructureRelation, [ToulminRole, ToulminRole]> = {
    supports: ["data", "claim"],
    warrants: ["warrant", "claim"],
    backs: ["backing", "warrant"],
    qualifies: ["qualifier", "claim"],
    rebuts: ["rebuttal", "claim"],
  }
  return pairs[relation][0] === fromRole && pairs[relation][1] === toRole
}

function requireExactClaimCoverage(
  output: StructureMappingOutput,
  call: StructureCall,
): Map<string, InternalClaimFinding> {
  const claims = new Map(call.claims.map((claim) => [claim.id, claim]))
  if (output.graphs.length !== claims.size) {
    throw new StructureMappingError(
      "STRUCTURE_CLAIM_COVERAGE_INVALID",
      "Structure output must map every requested claim exactly once.",
      true,
    )
  }
  const seen = new Set<string>()
  for (const graph of output.graphs) {
    if (!claims.has(graph.claim_id) || seen.has(graph.claim_id)) {
      throw new StructureMappingError(
        "STRUCTURE_CLAIM_REFERENCE_INVALID",
        "Structure output referenced an unknown or duplicate claim.",
        true,
      )
    }
    seen.add(graph.claim_id)
  }
  return claims
}

export function validateStructureMappings(
  candidate: unknown,
  call: StructureCall,
  limits: { maxNodesPerClaim: number; maxEdgesPerClaim: number },
): ValidatedStructureGraph[] {
  const output = structureMappingOutputSchema.parse(candidate)
  const claims = requireExactClaimCoverage(output, call)
  const supportByClaim = new Map(
    call.supports.map((support) => [support.support.claim_id, support]),
  )
  const segments = new Map(call.segments.map((segment) => [segment.id, segment]))

  return output.graphs.map((graph) => {
    const claim = claims.get(graph.claim_id)!
    if (graph.state === "insufficient") {
      if (graph.reason_code === "mapped" || graph.nodes.length > 0 || graph.edges.length > 0) {
        throw new StructureMappingError(
          "STRUCTURE_OUTPUT_INCONSISTENT",
          "An insufficient structure graph must abstain without model-authored nodes.",
          true,
        )
      }
      return unclearGraph(claim)
    }
    if (
      graph.reason_code !== "mapped" ||
      graph.nodes.length === 0 ||
      graph.nodes.length > limits.maxNodesPerClaim ||
      graph.edges.length > limits.maxEdgesPerClaim
    ) {
      throw new StructureMappingError(
        "STRUCTURE_OUTPUT_INCONSISTENT",
        "A mapped graph violated node or edge constraints.",
        true,
      )
    }

    const support = supportByClaim.get(claim.id)
    const allowedAnchors = [...claim.span_refs, ...(support?.span_refs ?? [])]
    const nodeIds = new Set<string>()
    const nodes = graph.nodes.map((node) => {
      if (nodeIds.has(node.node_id) || !node.anchor_span) {
        throw new StructureMappingError(
          "STRUCTURE_NODE_INVALID",
          "Structure nodes require unique IDs and grounded context anchors.",
          true,
        )
      }
      nodeIds.add(node.node_id)
      const segment = segments.get(node.anchor_span.segment_id)
      const span = {
        segment_id: node.anchor_span.segment_id,
        start_char: node.anchor_span.start_char,
        end_char: node.anchor_span.end_char,
      }
      if (
        !segment ||
        segment.speakerId !== claim.claim.speaker_id ||
        segment.lowConfidence ||
        span.end_char <= span.start_char ||
        span.end_char > segment.text.length ||
        !spanWithin(span, allowedAnchors)
      ) {
        throw new StructureMappingError(
          "STRUCTURE_SPAN_INVALID",
          "A structure node was not anchored to reliable claim-speaker context.",
          true,
        )
      }
      const escaped = escapeSourceDelimiters(segment.text).escapedSource
      if (escaped.slice(span.start_char, span.end_char) !== node.anchor_span.text) {
        throw new StructureMappingError(
          "STRUCTURE_TEXT_NOT_GROUNDED",
          "A structure anchor did not exactly match the transcript.",
          true,
        )
      }
      if (!node.inferred && node.text !== node.anchor_span.text) {
        throw new StructureMappingError(
          "STRUCTURE_ASSERTED_TEXT_INVALID",
          "A non-inferred structure node must be verbatim transcript text.",
          true,
        )
      }
      return {
        tempId: node.node_id,
        sourceClaimId: claim.id,
        role: node.role,
        inferred: node.inferred,
        text: node.inferred ? node.text : segment.text.slice(span.start_char, span.end_char),
        state: "ok" as const,
        span,
        anchorRole: node.inferred ? ("inference_context" as const) : ("asserted_content" as const),
        confidence: node.inferred ? node.confidence * 0.5 : node.confidence,
        personInvolved: claim.person_involved,
      }
    })

    const roots = nodes.filter((node) => node.role === "claim" && !node.inferred)
    if (
      roots.length !== 1 ||
      roots[0].text !== claim.text ||
      !claim.span_refs.some((span) => spanKey(span) === spanKey(roots[0].span))
    ) {
      throw new StructureMappingError(
        "STRUCTURE_ROOT_INVALID",
        "Each mapped graph requires one verbatim, non-inferred claim root.",
        true,
      )
    }

    const nodeById = new Map(nodes.map((node) => [node.tempId, node]))
    const edgeKeys = new Set<string>()
    const connectedFrom = new Set<string>()
    const edges = graph.edges.map((edge) => {
      const from = nodeById.get(edge.from_node_id)
      const to = nodeById.get(edge.to_node_id)
      const key = `${edge.from_node_id}:${edge.to_node_id}:${edge.relation}`
      if (
        !from ||
        !to ||
        from.tempId === to.tempId ||
        edgeKeys.has(key) ||
        !relationAllowed(edge.relation, from.role, to.role)
      ) {
        throw new StructureMappingError(
          "STRUCTURE_EDGE_INVALID",
          "A structure edge was dangling, duplicated, self-referential, or role-incompatible.",
          true,
        )
      }
      edgeKeys.add(key)
      connectedFrom.add(from.tempId)
      return {
        sourceClaimId: claim.id,
        fromTempId: from.tempId,
        toTempId: to.tempId,
        relation: edge.relation,
      }
    })
    if (nodes.some((node) => node.role !== "claim" && !connectedFrom.has(node.tempId))) {
      throw new StructureMappingError(
        "STRUCTURE_NODE_DISCONNECTED",
        "Every non-claim structure node must participate in the directed graph.",
        true,
      )
    }
    return { claimId: claim.id, nodes, edges }
  })
}
