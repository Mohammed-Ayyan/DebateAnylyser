import fs from "node:fs"
import path from "node:path"
import { wrapUntrustedSource } from "../lib/ai/content-boundary"
import { OllamaClaimExtractionProvider } from "../lib/claims/ollama-provider"
import {
  buildTranscriptWindows,
  validateWindowClaims,
  deduplicateClaims,
} from "../lib/claims/transcript-windows"
import type { ClaimTranscriptSegment } from "../lib/claims/contracts"
import { OllamaSupportAssessmentProvider } from "../lib/support/ollama-provider"
import { prepareSupportCalls, validateSupportAssessments } from "../lib/support/assessment"
import type { InternalClaimFinding, InternalSupportFinding } from "../lib/contracts/analysis"
import { OllamaStructureMappingProvider } from "../lib/structure/ollama-provider"
import { prepareStructureCalls, validateStructureMappings } from "../lib/structure/mapping"
import { OllamaFallacyDetectionProvider } from "../lib/fallacy/ollama-provider"
import { validateFallacyDetection } from "../lib/fallacy/validation"

async function runRepresentativeDebate() {
  console.log("================================================================================")
  console.log("       DEBATE ANALYZER V2 — PHASE 1 LOCAL ANALYSIS PIPELINE PIPELINE DEMO       ")
  console.log("================================================================================")
  console.log("Hardware: RTX 4050 6GB GPU | Inference: Local Ollama (phi3:mini)")
  console.log("Stages: S2 (Claims) -> S3 (Support) -> S4 (Structure) -> S5 (Fallacies)")
  console.log("================================================================================\n")

  const debatePath = path.resolve(process.cwd(), "public/test-transcripts/debate-demo-1.txt")
  const rawText = fs.readFileSync(debatePath, "utf-8")
  console.log(`Loaded transcript: debate-demo-1.txt (${rawText.length} characters)`)

  // Parse lines into segments
  const lines = rawText.split("\n").filter((l) => l.trim().length > 0)
  const segments: ClaimTranscriptSegment[] = []
  const speakerIdMap = new Map<string, string>([
    ["MODERATOR", "00000000-0000-4000-8000-000000000001"],
    ["SPEAKER A", "00000000-0000-4000-8000-000000000002"],
    ["SPEAKER B", "00000000-0000-4000-8000-000000000003"],
  ])

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    let speakerLabel = "MODERATOR"
    let text = line
    if (line.startsWith("SPEAKER A:")) {
      speakerLabel = "SPEAKER A"
      text = line.replace("SPEAKER A:", "").trim()
    } else if (line.startsWith("SPEAKER B:")) {
      speakerLabel = "SPEAKER B"
      text = line.replace("SPEAKER B:", "").trim()
    } else if (line.startsWith("MODERATOR:")) {
      speakerLabel = "MODERATOR"
      text = line.replace("MODERATOR:", "").trim()
    }

    segments.push({
      id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
      index: i,
      speakerId: speakerIdMap.get(speakerLabel) ?? null,
      speakerLabel,
      speakerIsNamedPerson: false,
      lowConfidence: false,
      text,
    })
  }

  console.log(`Parsed ${segments.length} dialogue turns/segments across 3 speakers.\n`)

  const ollamaOptions = {
    baseUrl: "http://127.0.0.1:11434",
    model: "phi3:mini",
    numCtx: 4096,
    numGpu: 99,
    timeoutMs: 120000,
  }

  // -------------------------------------------------------------------------
  // STAGE 2: Claim Extraction
  // -------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------")
  console.log("STAGE 2 (S2): Claim Extraction via Ollama Claim Provider")
  console.log("--------------------------------------------------------------------------------")
  const s2Provider = new OllamaClaimExtractionProvider(ollamaOptions)
  const windows = buildTranscriptWindows(segments, 10000, 2)
  console.log(`Built ${windows.length} transcript extraction window(s)`)

  const s2Start = Date.now()
  const rawWindowClaims: any[] = []

  for (const win of windows) {
    const raw = await s2Provider.extract({
      sourceBlock: wrapUntrustedSource(win.source).block,
      promptVersion: "s2-claim-extraction-v1",
      schemaVersion: "s2-claim-schema-v1",
      maxClaims: 20,
    })
    const validated = validateWindowClaims(raw, win, 20)
    rawWindowClaims.push(...validated)
  }

  const s2Duration = Date.now() - s2Start
  const deduplicatedClaims = deduplicateClaims(rawWindowClaims)
  console.log(
    `S2 Complete in ${s2Duration}ms. Extracted ${deduplicatedClaims.length} distinct claims:`,
  )

  for (let idx = 0; idx < deduplicatedClaims.length; idx++) {
    const c = deduplicatedClaims[idx]
    console.log(
      `  [Claim ${idx + 1}] (${c.claimType}, check_worthy=${c.checkWorthy}, conf=${c.extractionConfidence})`,
    )
    console.log(`    Speaker: ${c.speakerLabel ?? "Unknown"} (${c.speakerId ?? "None"})`)
    console.log(`    Text: "${c.text}"`)
  }

  // Convert to InternalClaimFinding for downstream stages
  const internalClaims: InternalClaimFinding[] = deduplicatedClaims.map((c, i) => ({
    id: `c0000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    analysis_id: "a0000000-0000-4000-8000-000000000001",
    kind: "claim",
    text: c.text,
    paraphrase: false,
    confidence: { raw: c.extractionConfidence, signals: { source_low_confidence: false } },
    confidence_band: c.extractionConfidence >= 0.8 ? "high" : "medium",
    state: "ok",
    person_involved: false,
    span_refs: [
      {
        segment_id: c.segmentId,
        start_char: c.startChar,
        end_char: c.endChar,
        text: c.text,
      },
    ],
    evidence_refs: [],
    produced_by_stage: "S2",
    claim: {
      claim_type: c.claimType as any,
      check_worthy: c.checkWorthy,
      speaker_id: c.speakerId,
      speaker_label: c.speakerLabel,
    },
  }))

  // -------------------------------------------------------------------------
  // STAGE 3: Support Assessment
  // -------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------")
  console.log("STAGE 3 (S3): Support Assessment via Ollama Support Provider")
  console.log("--------------------------------------------------------------------------------")
  const s3Provider = new OllamaSupportAssessmentProvider(ollamaOptions)

  const supportInput = {
    analysisId: "a0000000-0000-4000-8000-000000000001",
    status: "analyzing" as const,
    claims: internalClaims,
    segments: segments.map((s) => ({
      id: s.id,
      index: s.index,
      text: s.text,
      speakerId: s.speakerId,
      lowConfidence: s.lowConfidence,
    })),
  }

  const { calls: supportCalls, deterministic: supportDeterministic } = prepareSupportCalls(
    supportInput,
    50000,
    2,
  )
  console.log(
    `Prepared ${supportCalls.length} support call batch(es) (deterministic: ${supportDeterministic.length})`,
  )

  const s3Start = Date.now()
  const validatedSupports: any[] = [...supportDeterministic]

  for (const call of supportCalls) {
    const raw = await s3Provider.assess({
      sourceBlock: wrapUntrustedSource(call.source).block,
      promptVersion: "s3-support-assessment-v1",
      schemaVersion: "s3-support-schema-v1",
      maxClaims: 2,
    })
    const validated = validateSupportAssessments(raw, call)
    validatedSupports.push(...validated)
  }

  const s3Duration = Date.now() - s3Start
  console.log(
    `S3 Complete in ${s3Duration}ms. Evaluated ${validatedSupports.length} claim support assessments:`,
  )

  for (const s of validatedSupports) {
    const claim = internalClaims.find((c) => c.id === s.claimId)
    console.log(`  [Support] Claim: "${claim?.text.slice(0, 50)}..."`)
    console.log(
      `    Level: ${s.supportLevel ?? "none"} | State: ${s.state} | Reason: ${s.reasonCode}`,
    )
    if (s.spans && s.spans.length > 0) {
      console.log(`    Evidence: ${s.spans.length} grounded span(s)`)
    }
  }

  // Convert to InternalSupportFinding for S4
  const internalSupports: InternalSupportFinding[] = validatedSupports.map((s, i) => {
    const claim = internalClaims.find((c) => c.id === s.claimId)!
    return {
      id: `s0000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
      analysis_id: "a0000000-0000-4000-8000-000000000001",
      kind: "support",
      text: claim.text,
      paraphrase: false,
      confidence: { raw: s.assessmentConfidence ?? 0.8, signals: { source_low_confidence: false } },
      confidence_band: "high",
      state: s.state,
      person_involved: false,
      span_refs: s.spans ?? [],
      evidence_refs: [],
      produced_by_stage: "S3",
      support: {
        claim_id: s.claimId,
        support_level: s.supportLevel,
        rationale: s.rationale,
        reason_code: s.reasonCode,
        anchor_role: "support_evidence",
      },
    }
  })

  // -------------------------------------------------------------------------
  // STAGE 4: Argument Structure
  // -------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------")
  console.log("STAGE 4 (S4): Argument Structure via Ollama Structure Provider")
  console.log("--------------------------------------------------------------------------------")
  const s4Provider = new OllamaStructureMappingProvider(ollamaOptions)

  const structureInput = {
    analysisId: "a0000000-0000-4000-8000-000000000001",
    status: "analyzing" as const,
    claims: internalClaims,
    supports: internalSupports,
    segments: segments.map((s) => ({
      id: s.id,
      index: s.index,
      text: s.text,
      speakerId: s.speakerId,
      lowConfidence: s.lowConfidence,
    })),
  }

  const { calls: structureCalls, deterministic: structureDeterministic } = prepareStructureCalls(
    structureInput,
    50000,
    2,
  )
  console.log(
    `Prepared ${structureCalls.length} structure call(s) (deterministic: ${structureDeterministic.length})`,
  )

  const s4Start = Date.now()
  const validatedStructures: any[] = [...structureDeterministic]

  for (const call of structureCalls) {
    const raw = await s4Provider.map({
      sourceBlock: wrapUntrustedSource(call.source).block,
      promptVersion: "s4-toulmin-structure-v1",
      schemaVersion: "s4-toulmin-schema-v1",
      maxClaims: 2,
      maxNodesPerClaim: 10,
      maxEdgesPerClaim: 20,
    })
    const validated = validateStructureMappings(raw, call, {
      maxNodesPerClaim: 10,
      maxEdgesPerClaim: 20,
    })
    validatedStructures.push(...validated)
  }

  const s4Duration = Date.now() - s4Start
  console.log(
    `S4 Complete in ${s4Duration}ms. Mapped ${validatedStructures.length} argument graphs:`,
  )

  for (const g of validatedStructures) {
    const claim = internalClaims.find((c) => c.id === g.claimId)
    console.log(`  [Graph] Claim: "${claim?.text.slice(0, 50)}..."`)
    console.log(`    Nodes: ${g.nodes.length} | Edges: ${g.edges.length}`)
    for (const n of g.nodes) {
      console.log(`      Node [${n.role}]: "${n.text.slice(0, 60)}..."`)
    }
    for (const e of g.edges) {
      console.log(`      Edge: ${e.fromTempId} -[${e.relation}]-> ${e.toTempId}`)
    }
  }

  // -------------------------------------------------------------------------
  // STAGE 5: Fallacy Detection
  // -------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------")
  console.log("STAGE 5 (S5): Fallacy Detection via Ollama Fallacy Provider")
  console.log("--------------------------------------------------------------------------------")
  const s5Provider = new OllamaFallacyDetectionProvider(ollamaOptions)

  const s5Start = Date.now()
  const fallacyFindings: any[] = []

  const segmentsById = new Map(segments.map((segment) => [segment.id, segment]))

  // Check each claim's context using only its relevant segments (matching prepareCalls in worker.ts)
  for (const claim of internalClaims.slice(0, 5)) {
    const relevantSegs = claim.span_refs
      .map((span) => segmentsById.get(span.segment_id))
      .filter((s): s is ClaimTranscriptSegment => Boolean(s))

    if (relevantSegs.length === 0) continue

    const sourceBlock = JSON.stringify({
      task: "Identify only clearly present possible taxonomy patterns for this claim.",
      source_claim: {
        id: claim.id,
        text: claim.text,
        claim_type: claim.claim.claim_type,
        spans: claim.span_refs,
      },
      structure: [],
      transcript_segments: relevantSegs.map((s) => ({
        id: s.id,
        text: s.text,
        low_confidence: s.lowConfidence,
        person_involved: false,
      })),
    })

    const raw = await s5Provider.detect({
      sourceBlock: wrapUntrustedSource(sourceBlock).block,
      promptVersion: "s5-fallacy-detection-v1",
      schemaVersion: "s5-fallacy-schema-v1",
      maxFindings: 10,
    })

    const validated = validateFallacyDetection(
      raw,
      relevantSegs.map((s) => ({
        id: s.id,
        text: s.text,
        lowConfidence: s.lowConfidence,
        personInvolved: false,
      })),
      { precisionThreshold: 0.9 },
    )
    fallacyFindings.push(...validated.findings)
  }

  const s5Duration = Date.now() - s5Start
  console.log(
    `S5 Complete in ${s5Duration}ms. Fallacy Findings Detected: ${fallacyFindings.length}`,
  )

  for (const f of fallacyFindings) {
    console.log(`  [Fallacy] ${f.taxonomyId} (${f.possibleType})`)
    console.log(`    Why: ${f.why}`)
    console.log(`    Quotation: "${f.span.text}"`)
  }

  console.log("\n================================================================================")
  console.log("                           PIPELINE SUMMARY                                     ")
  console.log("================================================================================")
  console.log(
    `S2 Claim Extraction Duration:    ${(s2Duration / 1000).toFixed(2)}s (${deduplicatedClaims.length} claims)`,
  )
  console.log(
    `S3 Support Assessment Duration:   ${(s3Duration / 1000).toFixed(2)}s (${validatedSupports.length} assessed)`,
  )
  console.log(
    `S4 Argument Structure Duration:   ${(s4Duration / 1000).toFixed(2)}s (${validatedStructures.length} graphs)`,
  )
  console.log(
    `S5 Fallacy Detection Duration:    ${(s5Duration / 1000).toFixed(2)}s (${fallacyFindings.length} findings)`,
  )
  console.log(
    `Total Pipeline Processing Time:   ${((s2Duration + s3Duration + s4Duration + s5Duration) / 1000).toFixed(2)}s`,
  )
  console.log("Paid API Calls Invoked:           0 (100% Local Inference)")
  console.log("================================================================================\n")
}

runRepresentativeDebate().catch((err) => {
  console.error("Pipeline run failed:", err)
  process.exit(1)
})
