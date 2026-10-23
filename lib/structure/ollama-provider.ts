import "server-only"

import { escapeSourceDelimiters } from "@/lib/ai/content-boundary"
import { extractJsonFromModelOutput } from "@/lib/ai/json-extractor"
import { pipelineElapsed, pipelineLog, pipelineNow } from "@/lib/observability/pipeline-logger"
import {
  StructureMappingError,
  type StructureMappingOutput,
  type StructureMappingProvider,
  type StructureMappingRequest,
} from "./contracts"

export type OllamaStructureProviderOptions = {
  baseUrl: string
  model: string
  numCtx: number
  numGpu: number
  timeoutMs: number
}

type OllamaChatResponse = {
  message?: { content?: string }
  eval_count?: number
  eval_duration?: number
  prompt_eval_count?: number
}

type SerializedSpan = {
  segment_id: string
  start_char: number
  end_char: number
  text?: string
}

type SerializedClaim = {
  claim_id: string
  text: string
  speaker_id: string | null
  span_refs: SerializedSpan[]
}

type SerializedSupport = {
  claim_id: string
  level: string | null
  state: string
  rationale: string
  anchor_role: string
  span_refs: SerializedSpan[]
}

type SerializedSegment = {
  segment_id: string
  segment_index: number
  speaker_id: string | null
  low_confidence: boolean
  text: string
}

type StructureSourcePayload = {
  claims?: SerializedClaim[]
  speaker_support?: SerializedSupport[]
  grounded_segments?: SerializedSegment[]
}

function parseSourceBlock(sourceBlock: string): StructureSourcePayload {
  try {
    const firstBrace = sourceBlock.indexOf("{")
    const lastBrace = sourceBlock.lastIndexOf("}")
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      const jsonStr = sourceBlock.slice(firstBrace, lastBrace + 1)
      return JSON.parse(jsonStr) as StructureSourcePayload
    }
  } catch {
    // fallback
  }
  return {}
}

function buildSystemPrompt(maxNodesPerClaim: number, maxEdgesPerClaim: number): string {
  return [
    "You are a Toulmin argument structure mapping system for debate analysis.",
    "For each provided claim, construct a Toulmin argument graph connecting evidence to the claim.",
    "",
    "Toulmin Model components:",
    "- 'claim': the central assertion being argued (the root node)",
    "- 'data': empirical facts, statistics, or evidence offered in support",
    "- 'warrant': underlying principle or reasoning connecting data to the claim",
    "- 'backing': additional support or verification for the warrant",
    "- 'qualifier': conditions of degree or reservation (e.g. 'likely', 'presumably')",
    "- 'rebuttal': counter-conditions or objections addressing the claim",
    "",
    "Allowed edge relations:",
    "- 'supports': from 'data' to 'claim'",
    "- 'warrants': from 'warrant' to 'claim'",
    "- 'backs': from 'backing' to 'warrant'",
    "- 'qualifies': from 'qualifier' to 'claim'",
    "- 'rebuts': from 'rebuttal' to 'claim'",
    "",
    "Rules:",
    "- Each graph must have exactly one root node with role='claim', matching the input claim.",
    "- For all non-inferred nodes, text must be verbatim transcript text and anchor_span must match.",
    "- Every non-claim node MUST have an outgoing edge connecting it toward the claim.",
    `- Maximum ${maxNodesPerClaim} nodes and ${maxEdgesPerClaim} edges per claim.`,
    "- If structure cannot be reliably determined, set state='insufficient', reason_code='unclear_structure', and empty nodes [] and edges [].",
    "",
    "Format: Return ONLY valid JSON matching this exact structure:",
    JSON.stringify({
      graphs: [
        {
          claim_id: "claim-uuid",
          state: "ok",
          reason_code: "mapped",
          nodes: [
            {
              node_id: "claim_node",
              role: "claim",
              inferred: false,
              text: "Exact claim text",
              anchor_span: {
                segment_id: "segment-uuid",
                text: "Exact claim text",
              },
              confidence: 0.95,
            },
            {
              node_id: "data_1",
              role: "data",
              inferred: false,
              text: "Supporting quote from transcript",
              anchor_span: {
                segment_id: "segment-uuid",
                text: "Supporting quote from transcript",
              },
              confidence: 0.85,
            },
          ],
          edges: [
            {
              from_node_id: "data_1",
              to_node_id: "claim_node",
              relation: "supports",
            },
          ],
        },
      ],
    }),
  ].join("\n")
}

function buildUserContent(
  claims: SerializedClaim[],
  supports: SerializedSupport[],
  segments: SerializedSegment[],
  request: StructureMappingRequest,
): string {
  const supportByClaim = new Map(supports.map((s) => [s.claim_id, s]))
  const segmentLines = segments.map((s) => `[Segment ID: ${s.segment_id}]: "${s.text}"`).join("\n")

  const claimBlocks = claims
    .map((c) => {
      const sup = supportByClaim.get(c.claim_id)
      const supportLevel = sup?.level ?? "absent"
      const supportSpans =
        sup?.span_refs
          ?.map((s) => s.text)
          .filter(Boolean)
          .join(" | ") || "None"
      return [
        `Claim ID: ${c.claim_id}`,
        `Claim Text: "${c.text}"`,
        `Speaker Support Level: ${supportLevel}`,
        `Evidence Quotes: ${supportSpans}`,
      ].join("\n")
    })
    .join("\n\n")

  return [
    `Prompt version: ${request.promptVersion}. Schema version: ${request.schemaVersion}.`,
    `Map at most ${request.maxClaims} claims.`,
    "",
    "SPEAKER TRANSCRIPT SEGMENTS:",
    segmentLines,
    "",
    "CLAIMS TO MAP:",
    claimBlocks,
  ].join("\n")
}

export class OllamaStructureMappingProvider implements StructureMappingProvider {
  constructor(private readonly options: OllamaStructureProviderOptions) {}

  async map(request: StructureMappingRequest, signal?: AbortSignal): Promise<unknown> {
    const controller = new AbortController()
    let timedOut = false
    const abort = () => controller.abort(signal?.reason)
    signal?.addEventListener("abort", abort, { once: true })
    const timeout = setTimeout(() => {
      timedOut = true
      controller.abort(new Error("Ollama structure mapping timed out"))
    }, this.options.timeoutMs)

    try {
      const _reqStart = pipelineNow()
      pipelineLog("S4", "PROVIDER", "Sending Ollama request", {
        model: this.options.model,
        numCtx: this.options.numCtx,
        numGpu: this.options.numGpu,
      })

      const payload = parseSourceBlock(request.sourceBlock)
      const inputClaims = payload.claims ?? []
      const inputSupports = payload.speaker_support ?? []
      const inputSegments = payload.grounded_segments ?? []
      const supportByClaim = new Map(inputSupports.map((s) => [s.claim_id, s]))
      const segmentMap = new Map(inputSegments.map((s) => [s.segment_id, s]))

      const systemPrompt = buildSystemPrompt(request.maxNodesPerClaim, request.maxEdgesPerClaim)
      const userContent = buildUserContent(inputClaims, inputSupports, inputSegments, request)

      const url = `${this.options.baseUrl}/api/chat`
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: this.options.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent },
          ],
          format: "json",
          stream: false,
          options: {
            num_ctx: this.options.numCtx,
            num_gpu: this.options.numGpu,
            num_predict: 2048,
            temperature: 0.1,
            repeat_penalty: 1.15,
          },
        }),
        signal: controller.signal,
      })

      pipelineLog("S4", "PROVIDER", "Ollama response received", {
        status: response.status,
        elapsed: pipelineElapsed(_reqStart),
      })

      if (!response.ok) {
        const errorText = await response.text().catch(() => "")
        if (response.status === 404) {
          throw new StructureMappingError(
            "STRUCTURE_PROVIDER_REQUEST_REJECTED",
            `Ollama model "${this.options.model}" not found. Pull it with: ollama pull ${this.options.model}`,
            false,
          )
        }
        throw new StructureMappingError(
          "STRUCTURE_PROVIDER_UNAVAILABLE",
          `Ollama returned HTTP ${response.status}: ${errorText}`,
          response.status >= 500,
        )
      }

      const body = (await response.json()) as OllamaChatResponse
      const outputText = body.message?.content?.trim() ?? ""

      pipelineLog("S4", "PROVIDER", "Ollama inference stats", {
        promptTokens: body.prompt_eval_count,
        evalTokens: body.eval_count,
        elapsed: pipelineElapsed(_reqStart),
      })

      if (!outputText) {
        throw new StructureMappingError(
          "STRUCTURE_PROVIDER_INCOMPLETE",
          "Ollama returned an empty response.",
          true,
        )
      }

      let parsed: unknown
      try {
        const jsonStr = extractJsonFromModelOutput(outputText)
        parsed = JSON.parse(jsonStr)
      } catch (error) {
        throw new StructureMappingError(
          "STRUCTURE_PROVIDER_INVALID_JSON",
          "Ollama returned invalid JSON.",
          true,
          error,
        )
      }

      // Reconcile model output to satisfy strict contract:
      // Every claim must have exactly one graph.
      const rawGraphs =
        typeof parsed === "object" &&
        parsed !== null &&
        "graphs" in parsed &&
        Array.isArray((parsed as Record<string, unknown>).graphs)
          ? ((parsed as Record<string, unknown>).graphs as Array<Record<string, unknown>>)
          : []

      const rawByClaimId = new Map(
        rawGraphs
          .filter((g) => typeof g.claim_id === "string")
          .map((g) => [g.claim_id as string, g]),
      )

      const finalGraphs: StructureMappingOutput["graphs"] = []

      for (const [claimIndex, claim] of inputClaims.entries()) {
        let raw = rawByClaimId.get(claim.claim_id)
        if (!raw && rawGraphs[claimIndex]) {
          raw = rawGraphs[claimIndex]
        }
        const support = supportByClaim.get(claim.claim_id)

        // If raw output is missing or marked insufficient, emit clean insufficient graph
        if (!raw || raw.state === "insufficient" || raw.reason_code !== "mapped") {
          finalGraphs.push({
            claim_id: claim.claim_id,
            state: "insufficient",
            reason_code: "unclear_structure",
            nodes: [],
            edges: [],
          })
          continue
        }

        // Validate root anchor: must be exact claim span
        const rootAnchor = claim.span_refs[0]
        if (!rootAnchor) {
          finalGraphs.push({
            claim_id: claim.claim_id,
            state: "insufficient",
            reason_code: "unclear_structure",
            nodes: [],
            edges: [],
          })
          continue
        }

        const rootSegment = segmentMap.get(rootAnchor.segment_id)
        if (!rootSegment) {
          finalGraphs.push({
            claim_id: claim.claim_id,
            state: "insufficient",
            reason_code: "unclear_structure",
            nodes: [],
            edges: [],
          })
          continue
        }

        const rootNodeId = `claim_${claim.claim_id.slice(0, 8)}`
        type StructureNode = StructureMappingOutput["graphs"][number]["nodes"][number]
        const rootNode: StructureNode = {
          node_id: rootNodeId,
          role: "claim",
          inferred: false,
          text: claim.text,
          anchor_span: {
            segment_id: rootAnchor.segment_id,
            start_char: rootAnchor.start_char,
            end_char: rootAnchor.end_char,
            text: claim.text,
          },
          confidence: 0.95,
        }

        const allowedAnchors = [...claim.span_refs, ...(support?.span_refs ?? [])]
        const validOtherNodes: StructureNode[] = []
        const validNodeIds = new Set<string>([rootNode.node_id])
        const connectedFrom = new Set<string>()
        const validEdges: Array<{
          from_node_id: string
          to_node_id: string
          relation: "supports" | "warrants" | "backs" | "qualifies" | "rebuts"
        }> = []

        // If model provided raw nodes and edges, check them
        const rawNodes = Array.isArray(raw?.nodes)
          ? (raw!.nodes as Array<Record<string, unknown>>)
          : []
        const rawEdges = Array.isArray(raw?.edges)
          ? (raw!.edges as Array<Record<string, unknown>>)
          : []

        for (const rn of rawNodes) {
          if (typeof rn !== "object" || rn === null) continue
          const role = rn.role as string
          if (role === "claim") continue // root already handled

          const validRoles = ["data", "warrant", "backing", "qualifier", "rebuttal"] as const
          if (!validRoles.includes(role as (typeof validRoles)[number])) continue

          const nodeId = String(rn.node_id ?? `node_${validOtherNodes.length + 1}`)
          if (validNodeIds.has(nodeId)) continue

          const rawAnchor =
            typeof rn.anchor_span === "object" && rn.anchor_span !== null
              ? (rn.anchor_span as Record<string, unknown>)
              : null
          if (!rawAnchor) continue

          let segId = String(rawAnchor.segment_id ?? "")
          let segment = segmentMap.get(segId)
          let text = String(rawAnchor.text ?? "")

          if (!segment && text.trim().length > 0) {
            for (const s of inputSegments) {
              if (s.text.includes(text.trim())) {
                segment = s
                segId = s.segment_id
                break
              }
            }
          }

          if (!segment) continue

          const escaped = escapeSourceDelimiters(segment.text).escapedSource
          let start = Number(rawAnchor.start_char ?? -1)
          let end = Number(rawAnchor.end_char ?? -1)

          if (
            !(
              start >= 0 &&
              end > start &&
              end <= segment.text.length &&
              escaped.slice(start, end) === text
            )
          ) {
            const idx = escaped.indexOf(text)
            if (idx >= 0 && idx + text.length <= segment.text.length) {
              start = idx
              end = idx + text.length
            } else {
              continue
            }
          }

          // Check anchor validity within allowed anchors
          const isAllowedAnchor = allowedAnchors.some(
            (a) => a.segment_id === segId && start >= a.start_char && end <= a.end_char,
          )

          if (isAllowedAnchor) {
            validNodeIds.add(nodeId)
            validOtherNodes.push({
              node_id: nodeId,
              role: role as (typeof validRoles)[number],
              inferred: Boolean(rn.inferred),
              text: rn.inferred ? String(rn.text ?? text) : text,
              anchor_span: {
                segment_id: segId,
                start_char: start,
                end_char: end,
                text,
              },
              confidence: Math.max(0, Math.min(1, Number(rn.confidence ?? 0.85))),
            })
          }
        }

        // Validate edges from model
        for (const re of rawEdges) {
          if (typeof re !== "object" || re === null) continue
          const from = String(re.from_node_id ?? "")
          const to = String(re.to_node_id ?? "")
          const relation = re.relation as string

          const validRelations = ["supports", "warrants", "backs", "qualifies", "rebuts"] as const
          if (!validRelations.includes(relation as (typeof validRelations)[number])) continue

          // Target node matching root claim
          const resolvedTo = validNodeIds.has(to) ? to : rootNodeId

          if (validNodeIds.has(from) && validNodeIds.has(resolvedTo) && from !== resolvedTo) {
            validEdges.push({
              from_node_id: from,
              to_node_id: resolvedTo,
              relation: relation as (typeof validRelations)[number],
            })
            connectedFrom.add(from)
          }
        }

        // Fallback: If raw had no nodes at all and S3 support provided evidence spans
        if (
          rawNodes.length === 0 &&
          validOtherNodes.length === 0 &&
          support &&
          support.level !== "absent" &&
          support.span_refs.length > 0
        ) {
          const suppSpan = support.span_refs[0]
          const suppSeg = segmentMap.get(suppSpan.segment_id)
          if (suppSeg) {
            const escaped = escapeSourceDelimiters(suppSeg.text).escapedSource
            const suppText = suppSpan.text ?? escaped.slice(suppSpan.start_char, suppSpan.end_char)
            if (suppText && suppSpan.start_char >= 0 && suppSpan.end_char <= suppSeg.text.length) {
              const dataNodeId = `data_${claim.claim_id.slice(0, 8)}`
              validNodeIds.add(dataNodeId)
              validOtherNodes.push({
                node_id: dataNodeId,
                role: "data",
                inferred: false,
                text: suppText,
                anchor_span: {
                  segment_id: suppSpan.segment_id,
                  start_char: suppSpan.start_char,
                  end_char: suppSpan.end_char,
                  text: suppText,
                },
                confidence: 0.9,
              })
              validEdges.push({
                from_node_id: dataNodeId,
                to_node_id: rootNodeId,
                relation: "supports",
              })
              connectedFrom.add(dataNodeId)
            }
          }
        }

        // Check if all non-claim nodes participate in edges
        const allConnected =
          validOtherNodes.length === 0 || validOtherNodes.every((n) => connectedFrom.has(n.node_id))

        if (allConnected && (validOtherNodes.length === 0 || validEdges.length > 0)) {
          finalGraphs.push({
            claim_id: claim.claim_id,
            state: "ok",
            reason_code: "mapped",
            nodes: [rootNode, ...validOtherNodes],
            edges: validEdges,
          })
        } else {
          finalGraphs.push({
            claim_id: claim.claim_id,
            state: "insufficient",
            reason_code: "unclear_structure",
            nodes: [],
            edges: [],
          })
        }
      }

      return { graphs: finalGraphs }
    } catch (error) {
      if (error instanceof StructureMappingError) throw error
      if (controller.signal.aborted) {
        throw new StructureMappingError(
          timedOut ? "STRUCTURE_PROVIDER_TIMEOUT" : "STRUCTURE_PROVIDER_ABORTED",
          timedOut ? "Structure mapping timed out." : "Structure mapping was interrupted.",
          true,
          error,
        )
      }
      throw new StructureMappingError(
        "STRUCTURE_PROVIDER_NETWORK_ERROR",
        "Ollama could not be reached.",
        true,
        error,
      )
    } finally {
      clearTimeout(timeout)
      signal?.removeEventListener("abort", abort)
    }
  }
}
