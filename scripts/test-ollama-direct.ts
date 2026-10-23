import { OllamaSupportAssessmentProvider } from "../lib/support/ollama-provider"
import { OllamaStructureMappingProvider } from "../lib/structure/ollama-provider"
import { OllamaFallacyDetectionProvider } from "../lib/fallacy/ollama-provider"
import { wrapUntrustedSource } from "../lib/ai/content-boundary"
import { validateSupportAssessments, prepareSupportCalls } from "../lib/support/assessment"
import { validateStructureMappings, prepareStructureCalls } from "../lib/structure/mapping"
import { validateFallacyDetection } from "../lib/fallacy/validation"
import type { InternalClaimFinding, InternalSupportFinding } from "../lib/contracts/analysis"

async function runBenchmark() {
  console.log("=== OLLAMA LOCAL BENCHMARK ON RTX 4050 ===")
  const baseUrl = "http://127.0.0.1:11434"
  const model = "phi3:mini"
  const numCtx = 4096
  const numGpu = 99
  const timeoutMs = 60000

  const speakerId = "11111111-1111-4111-8111-111111111111"
  const seg1Id = "22222222-2222-4222-8222-222222222221"
  const seg2Id = "22222222-2222-4222-8222-222222222222"
  const claim1Id = "33333333-3333-4333-8333-333333333331"
  const claim2Id = "33333333-3333-4333-8333-333333333332"

  const seg1Text =
    "The International Energy Agency reported that solar power became the cheapest source of electricity in history in 2023, with costs declining 89% since 2010."
  const seg2Text =
    "We should mandate that 80% of electricity generation come from renewable sources by 2035."

  const claim1: InternalClaimFinding = {
    id: claim1Id,
    analysis_id: "00000000-0000-4000-8000-000000000000",
    kind: "claim",
    text: "solar power became the cheapest source of electricity in history in 2023",
    paraphrase: false,
    confidence: { raw: 0.95, signals: { source_low_confidence: false } },
    confidence_band: "high",
    state: "ok",
    person_involved: false,
    span_refs: [{ segment_id: seg1Id, start_char: 46, end_char: 118 }],
    evidence_refs: [],
    produced_by_stage: "S2",
    claim: {
      claim_type: "factual",
      check_worthy: true,
      speaker_id: speakerId,
      speaker_label: "Speaker A",
    },
  }

  const claim2: InternalClaimFinding = {
    id: claim2Id,
    analysis_id: "00000000-0000-4000-8000-000000000000",
    kind: "claim",
    text: "We should mandate that 80% of electricity generation come from renewable sources by 2035",
    paraphrase: false,
    confidence: { raw: 0.9, signals: { source_low_confidence: false } },
    confidence_band: "high",
    state: "ok",
    person_involved: false,
    span_refs: [{ segment_id: seg2Id, start_char: 0, end_char: 89 }],
    evidence_refs: [],
    produced_by_stage: "S2",
    claim: {
      claim_type: "policy",
      check_worthy: false,
      speaker_id: speakerId,
      speaker_label: "Speaker A",
    },
  }

  // 1. S3 Benchmark
  console.log("\n--- Benchmarking S3: Support Assessment ---")
  const supportProvider = new OllamaSupportAssessmentProvider({
    baseUrl,
    model,
    numCtx,
    numGpu,
    timeoutMs,
  })

  const supportInput = {
    analysisId: "00000000-0000-4000-8000-000000000000",
    status: "analyzing" as const,
    claims: [claim1, claim2],
    segments: [
      { id: seg1Id, index: 0, text: seg1Text, speakerId, lowConfidence: false },
      { id: seg2Id, index: 1, text: seg2Text, speakerId, lowConfidence: false },
    ],
  }

  const { calls: supportCalls } = prepareSupportCalls(supportInput, 50000, 10)
  console.log(`Prepared ${supportCalls.length} support call(s)`)

  const t0 = Date.now()
  const supportRaw = await supportProvider.assess({
    sourceBlock: wrapUntrustedSource(supportCalls[0].source).block,
    promptVersion: "s3-test",
    schemaVersion: "s3-support-schema-v1",
    maxClaims: 10,
  })
  const s3Duration = Date.now() - t0
  console.log(`S3 Raw Response received in ${s3Duration}ms:`, JSON.stringify(supportRaw, null, 2))

  const validatedSupport = validateSupportAssessments(supportRaw, supportCalls[0])
  console.log(`S3 Validated Assessments (${validatedSupport.length}):`)
  for (const v of validatedSupport) {
    console.log(
      `  Claim ${v.claimId}: state=${v.state}, level=${v.supportLevel}, reason=${v.reasonCode}, spans=${v.spans.length}`,
    )
  }

  // 2. S4 Benchmark
  console.log("\n--- Benchmarking S4: Argument Structure ---")
  const structureProvider = new OllamaStructureMappingProvider({
    baseUrl,
    model,
    numCtx,
    numGpu,
    timeoutMs,
  })

  const sampleSupportFinding: InternalSupportFinding = {
    id: "44444444-4444-4444-8444-444444444441",
    analysis_id: "00000000-0000-4000-8000-000000000000",
    kind: "support",
    text: claim1.text,
    paraphrase: false,
    confidence: { raw: 0.9, signals: { source_low_confidence: false } },
    confidence_band: "high",
    state: "ok",
    person_involved: false,
    span_refs: [{ segment_id: seg1Id, start_char: 0, end_char: seg1Text.length }],
    evidence_refs: [],
    produced_by_stage: "S3",
    support: {
      claim_id: claim1Id,
      support_level: "present",
      rationale: "Explicit support in transcript",
      reason_code: "explicit_support",
      anchor_role: "support_evidence",
    },
  }

  const structureInput = {
    analysisId: "00000000-0000-4000-8000-000000000000",
    status: "analyzing" as const,
    claims: [claim1],
    supports: [sampleSupportFinding],
    segments: [{ id: seg1Id, index: 0, text: seg1Text, speakerId, lowConfidence: false }],
  }

  const { calls: structureCalls } = prepareStructureCalls(structureInput, 50000, 10)
  console.log(`Prepared ${structureCalls.length} structure call(s)`)

  const t1 = Date.now()
  const structureRaw = await structureProvider.map({
    sourceBlock: wrapUntrustedSource(structureCalls[0].source).block,
    promptVersion: "s4-test",
    schemaVersion: "s4-toulmin-schema-v1",
    maxClaims: 10,
    maxNodesPerClaim: 10,
    maxEdgesPerClaim: 20,
  })
  const s4Duration = Date.now() - t1
  console.log(`S4 Raw Response received in ${s4Duration}ms:`, JSON.stringify(structureRaw, null, 2))

  const validatedStructure = validateStructureMappings(structureRaw, structureCalls[0], {
    maxNodesPerClaim: 10,
    maxEdgesPerClaim: 20,
  })
  console.log(`S4 Validated Graphs (${validatedStructure.length}):`)
  for (const g of validatedStructure) {
    console.log(`  Claim ${g.claimId}: nodes=${g.nodes.length}, edges=${g.edges.length}`)
  }

  // 3. S5 Benchmark: Fallacy Detection (Positive + Negative Control)
  console.log("\n--- Benchmarking S5: Fallacy Detection ---")
  const fallacyProvider = new OllamaFallacyDetectionProvider({
    baseUrl,
    model,
    numCtx,
    numGpu,
    timeoutMs,
  })

  // Positive Case: False dilemma
  const fallacySegId = "55555555-5555-4555-8555-555555555551"
  const fallacySegText =
    "Either we bankrupt the economy chasing arbitrary timelines, or we maintain energy security. There is no middle path on grid physics."
  const fallacySegments = [
    { id: fallacySegId, text: fallacySegText, lowConfidence: false, personInvolved: false },
  ]

  const positiveSource = JSON.stringify({
    task: "Identify only clearly present possible taxonomy patterns.",
    source_claim: { id: claim2Id, text: "Renewable transition debate", spans: [] },
    structure: [],
    transcript_segments: fallacySegments,
  })

  const t2 = Date.now()
  const fallacyRaw = await fallacyProvider.detect({
    sourceBlock: wrapUntrustedSource(positiveSource).block,
    promptVersion: "s5-test",
    schemaVersion: "s5-fallacy-schema-v1",
    maxFindings: 10,
  })
  const s5PositiveDuration = Date.now() - t2
  console.log(
    `S5 Positive Test Raw Response in ${s5PositiveDuration}ms:`,
    JSON.stringify(fallacyRaw, null, 2),
  )
  const validatedFallacy = validateFallacyDetection(fallacyRaw, fallacySegments, {
    precisionThreshold: 0.9,
  })
  console.log(`S5 Validated Findings (${validatedFallacy.findings.length}):`)
  for (const f of validatedFallacy.findings) {
    console.log(`  Found: ${f.taxonomyId} (${f.possibleType}) on text: "${f.span.text}"`)
  }

  // Negative Case: Non-fallacious factual argument
  const cleanSegId = "66666666-6666-4666-8666-666666666661"
  const cleanSegText =
    "The National Renewable Energy Laboratory 2024 study found that above 60% variable renewable penetration, curtailment rates increase, wasting 15 to 20% of generated power."
  const cleanSegments = [
    { id: cleanSegId, text: cleanSegText, lowConfidence: false, personInvolved: false },
  ]

  const negativeSource = JSON.stringify({
    task: "Identify only clearly present possible taxonomy patterns.",
    source_claim: { id: claim2Id, text: "Grid reliability concern", spans: [] },
    structure: [],
    transcript_segments: cleanSegments,
  })

  const t3 = Date.now()
  const negativeRaw = await fallacyProvider.detect({
    sourceBlock: wrapUntrustedSource(negativeSource).block,
    promptVersion: "s5-test",
    schemaVersion: "s5-fallacy-schema-v1",
    maxFindings: 10,
  })
  const s5NegativeDuration = Date.now() - t3
  console.log(
    `S5 Negative Test Raw Response in ${s5NegativeDuration}ms:`,
    JSON.stringify(negativeRaw, null, 2),
  )
  const validatedNegative = validateFallacyDetection(negativeRaw, cleanSegments, {
    precisionThreshold: 0.9,
  })
  console.log(`S5 Negative Control Findings: ${validatedNegative.findings.length} (Expected 0)`)
  console.log(`Negative Control Message: "${validatedNegative.message}"`)

  console.log("\n=== ALL DIRECT OLLAMA BENCHMARKS COMPLETED ===")
}

runBenchmark().catch(console.error)
