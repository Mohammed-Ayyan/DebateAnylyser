import { getDatabase } from "../lib/db/client"
import {
  findings,
  findingClaims,
  findingSupports,
  findingStructures,
  findingFallacies,
  analyses,
  analysisStageRuns,
} from "../lib/db/schema"
import { eq } from "drizzle-orm"

async function run() {
  const analysisId = process.argv[2] ?? "fc86f716-fc53-4124-8766-3ec4cd056f05"
  const db = getDatabase()

  console.log(`=== INSPECTING ANALYSIS: ${analysisId} ===`)

  const [analysis] = await db.select().from(analyses).where(eq(analyses.id, analysisId))
  console.log(`Status: ${analysis?.status}, Title: ${analysis?.title}`)

  const stages = await db
    .select()
    .from(analysisStageRuns)
    .where(eq(analysisStageRuns.analysisId, analysisId))
  console.log("\nStage Runs:")
  for (const s of stages) {
    console.log(
      `  - Stage ${s.stage}: status=${s.status}, attempt=${s.attempt}, errorClass=${s.errorClass ?? "none"}`,
    )
  }

  const allFindings = await db.select().from(findings).where(eq(findings.analysisId, analysisId))
  console.log(`\nTotal Findings: ${allFindings.length}`)

  const claims = allFindings.filter((f) => f.kind === "claim")
  console.log(`\nClaims (S2): ${claims.length}`)
  for (const c of claims) {
    const [detail] = await db.select().from(findingClaims).where(eq(findingClaims.findingId, c.id))
    console.log(
      `  - [Claim] type=${detail?.claimType} checkWorthy=${detail?.checkWorthy}: "${c.text.slice(0, 60)}..."`,
    )
  }

  const supports = allFindings.filter((f) => f.kind === "support")
  console.log(`\nSupport Assessments (S3): ${supports.length}`)
  for (const s of supports) {
    const [detail] = await db
      .select()
      .from(findingSupports)
      .where(eq(findingSupports.findingId, s.id))
    console.log(
      `  - [Support] level=${detail?.supportLevel} reason=${detail?.reasonCode} state=${s.state}: "${s.text.slice(0, 60)}..."`,
    )
  }

  const structures = allFindings.filter((f) => f.kind === "structure")
  console.log(`\nStructure Nodes (S4): ${structures.length}`)
  for (const st of structures) {
    const [detail] = await db
      .select()
      .from(findingStructures)
      .where(eq(findingStructures.findingId, st.id))
    console.log(
      `  - [Structure] role=${detail?.role} inferred=${detail?.inferred}: "${st.text.slice(0, 60)}..."`,
    )
  }

  const fallacies = allFindings.filter((f) => f.kind === "fallacy")
  console.log(`\nFallacies Detected (S5): ${fallacies.length}`)
  for (const f of fallacies) {
    const [detail] = await db
      .select()
      .from(findingFallacies)
      .where(eq(findingFallacies.findingId, f.id))
    console.log(
      `  - [Fallacy] type="${detail?.possibleType}" taxonomyRef="${detail?.taxonomyRef}" span="${f.text}"`,
    )
  }

  console.log("\n=== INSPECTION COMPLETE ===")
  process.exit(0)
}

run().catch(console.error)
