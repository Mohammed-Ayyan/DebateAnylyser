import { DatasetCredibilityProvider } from "@/lib/credibility/dataset-provider"
import { OllamaEvidenceVerifier } from "@/lib/evidence/ollama-verifier"
import { HttpsEvidenceSourceResolver } from "@/lib/evidence/source-resolver"
import { validateEvidenceVerification } from "@/lib/evidence/verification"
import { WikipediaEvidenceRetriever } from "@/lib/evidence/wikipedia-retriever"
import type { InternalClaimFinding } from "@/lib/contracts/analysis"

async function runPhase3Verification() {
  console.log("============================================================")
  console.log("Debate Analyzer V2 — Phase 3 Live Pipeline Verification")
  console.log("============================================================\n")

  const retriever = new WikipediaEvidenceRetriever({
    timeoutMs: 15000,
  })

  const resolver = new HttpsEvidenceSourceResolver({
    timeoutMs: 15000,
    maxBytes: 2097152,
    maxRedirects: 3,
  })

  const verifier = new OllamaEvidenceVerifier({
    baseUrl: "http://127.0.0.1:11434",
    model: "phi3:mini",
    timeoutMs: 60000,
    maxOutputTokens: 2048,
  })

  const credibilityProvider = new DatasetCredibilityProvider()

  // Test cases covering all required criteria:
  const testClaims = [
    {
      type: "supporting",
      claimText: "Apollo 11 landed humans on the Moon in July 1969.",
      expectRelation: "supports",
    },
    {
      type: "contradictory",
      claimText: "Alan Turing was born in Paris, France.",
      expectRelation: "refutes",
    },
    {
      type: "neutral/ambiguous",
      claimText: "The Turing test considers whether machines can exhibit intelligent behavior.",
      expectRelation: "supports", // or neutral
    },
    {
      type: "no_results",
      claimText: "Xylophonic purple dragons live in Martian underground tunnels.",
      expectRelation: "none",
    },
  ]

  for (const testCase of testClaims) {
    console.log(`\n--- Test Case: ${testCase.type.toUpperCase()} ---`)
    console.log(`Claim: "${testCase.claimText}"`)

    const claimFinding: InternalClaimFinding = {
      id: "00000000-0000-4000-8000-000000000001",
      analysis_id: "00000000-0000-4000-8000-000000000002",
      kind: "claim",
      text: testCase.claimText,
      paraphrase: false,
      confidence: { raw: 0.9 },
      confidence_band: null,
      state: "ok",
      person_involved: false,
      span_refs: [],
      evidence_refs: [],
      produced_by_stage: "S2",
      claim: {
        claim_type: "factual",
        check_worthy: true,
        speaker_id: null,
        speaker_label: null,
      },
    }

    const t0 = Date.now()
    const retrieval = (await retriever.retrieve({
      claimId: claimFinding.id,
      claimText: testCase.claimText,
      maxCandidates: 2,
    })) as {
      candidates: Array<{
        url: string
        passage: string
        provenance: string
        tier: "T1" | "T2" | "T3"
        retrieved_at: string
      }>
    }

    console.log(`Retrieved ${retrieval.candidates.length} candidate(s) in ${Date.now() - t0}ms`)

    if (testCase.type === "no_results") {
      if (retrieval.candidates.length === 0) {
        console.log(
          "PASS: Zero candidates returned for ungrounded/nonsense claim. (No false verdict)",
        )
      } else {
        console.log(`Candidates returned: ${retrieval.candidates.length}`)
      }
      continue
    }

    for (const candidate of retrieval.candidates) {
      console.log(`  Source: ${candidate.provenance} (${candidate.url})`)
      console.log(`  Passage slice: "${candidate.passage.slice(0, 100)}..."`)

      // 1. Resolve source
      let resolved
      try {
        resolved = await resolver.resolve(candidate)
        console.log("  Resolution: PASS (Verbatim match verified in live HTTPS HTML)")
      } catch (err: any) {
        console.error("  Resolution failed:", err.message)
        continue
      }

      // 2. Verify with Ollama
      const sourceBlock = JSON.stringify({
        claim: { id: claimFinding.id, text: claimFinding.text, person_involved: false },
        source: {
          url: resolved.finalUrl,
          passage: resolved.passage,
          provenance: resolved.provenance,
          tier: resolved.tier,
        },
      })

      const tVerify = Date.now()
      const verificationRaw = (await verifier.verify({
        sourceBlock,
        promptVersion: "s6-v1",
        schemaVersion: "s6-v1",
      })) as { relation: string; licensing_quote: string | null; confidence: number }

      console.log(`  Ollama Verification took ${Date.now() - tVerify}ms:`)
      console.log(`    Relation: ${verificationRaw.relation}`)
      console.log(`    Quote: "${verificationRaw.licensing_quote}"`)
      console.log(`    Confidence: ${verificationRaw.confidence}`)

      // 3. Grounding check
      const verified = validateEvidenceVerification(verificationRaw, claimFinding, resolved)
      if (verified) {
        console.log("  Grounding check: PASS (Verbatim licensing quote verified)")
        console.log(`    Final snippet: "${verified.snippet}"`)
      } else {
        console.log("  Grounding check: Dropped cleanly (insufficient relation or ungrounded)")
      }

      // 4. Source Credibility Assessment
      const credOutput = await credibilityProvider.assess({ source_url: candidate.url })
      console.log(`  Credibility assessment for ${candidate.url}:`)
      console.log(`    Total factors rated: ${credOutput.ratings.length}`)
      for (const r of credOutput.ratings) {
        console.log(
          `    - [${r.factor.toUpperCase()}]: ${r.level} (${r.provenance.rater_reference})`,
        )
      }
      const hasDigits = /\d/.test(JSON.stringify(credOutput))
      console.log(
        `    Numeric leakage check: ${hasDigits ? "FAIL (contains digits)" : "PASS (zero digits)"}`,
      )
    }
  }

  console.log("\n============================================================")
  console.log("Phase 3 Pipeline Verification Complete!")
  console.log("============================================================")
}

runPhase3Verification().catch((err) => {
  console.error("Pipeline test failed:", err)
  process.exit(1)
})
