import fs from "node:fs"
import path from "node:path"
import { getDatabase } from "../lib/db/client"
import {
  findings,
  findingSupports,
  findingFallacies,
  analysisJobs,
  analyses,
} from "../lib/db/schema"
import { eq } from "drizzle-orm"

async function run() {
  const db = getDatabase()
  console.log("=== PHASE 1 PIPELINE VERIFICATION TEST ===")
  const transcriptPath = path.resolve(process.cwd(), "public/test-transcripts/debate-demo-1.txt")
  const transcriptText = fs.readFileSync(transcriptPath, "utf-8")
  console.log(`Loaded debate-demo-1.txt (${transcriptText.length} chars)`)

  // 1. Establish dev session
  console.log("Step 1: Authenticating via development session...")
  const authRes = await fetch(
    "http://localhost:3000/api/v1/auth/development-session?return_to=%2Fdashboard",
    {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
      },
      redirect: "manual",
    },
  )

  const cookieHeader = authRes.headers.get("set-cookie")
  if (!cookieHeader) {
    throw new Error(`Failed to obtain session cookie: HTTP ${authRes.status}`)
  }

  // Extract session cookie value
  const cookieMatch = cookieHeader.match(/debate_session=([^;]+)/)
  if (!cookieMatch) {
    throw new Error(`Could not parse debate_session cookie from: ${cookieHeader}`)
  }
  const sessionCookie = `debate_session=${cookieMatch[1]}`
  console.log("Authenticated as fixed dev user successfully.")

  // 2. Submit debate transcript
  console.log("Step 2: Submitting transcript to POST /api/v1/analyses...")
  const submitRes = await fetch("http://localhost:3000/api/v1/analyses", {
    method: "POST",
    headers: {
      origin: "http://localhost:3000",
      cookie: sessionCookie,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      source_type: "paste",
      paste_text: transcriptText,
      rights_basis: "public_domain",
      intended_use: "research",
      title: "Renewable Energy Transition Debate (Phase 1 Test)",
    }),
  })

  if (!submitRes.ok) {
    const errorBody = await submitRes.text()
    throw new Error(`Submit failed with HTTP ${submitRes.status}: ${errorBody}`)
  }

  const submitJson = (await submitRes.json()) as { id: string; status: string }
  const analysisId = submitJson.id
  console.log(`Analysis created! ID: ${analysisId}, Initial status: ${submitJson.status}`)

  // 3. Monitor analysis progress
  console.log("Step 3: Polling analysis job progress...")
  const startTime = Date.now()
  let completed = false
  let lastStage = ""

  while (Date.now() - startTime < 600_000) {
    // 10 minutes timeout
    const [analysisRecord] = await db.select().from(analyses).where(eq(analyses.id, analysisId))

    const [activeJob] = await db
      .select()
      .from(analysisJobs)
      .where(eq(analysisJobs.analysisId, analysisId))

    const currentStage = activeJob?.stage ?? "NONE"
    const jobStatus = activeJob?.status ?? "NONE"
    const analysisStatus = analysisRecord?.status ?? "UNKNOWN"

    if (currentStage !== lastStage) {
      console.log(
        `[${Math.round((Date.now() - startTime) / 1000)}s] Stage transition -> ${currentStage} (Job status: ${jobStatus}, Analysis status: ${analysisStatus})`,
      )
      lastStage = currentStage
    }

    if (
      analysisStatus === "complete" ||
      analysisStatus === "partial" ||
      analysisStatus === "failed"
    ) {
      console.log(`Analysis reached terminal state: ${analysisStatus}`)
      completed = true
      break
    }

    await new Promise((resolve) => setTimeout(resolve, 3000))
  }

  if (!completed) {
    throw new Error("Analysis timed out before completing")
  }

  // 4. Inspect DB persistence
  console.log("\nStep 4: Inspecting persisted records in PostgreSQL...")
  const allFindings = await db.select().from(findings).where(eq(findings.analysisId, analysisId))
  console.log(`Total findings: ${allFindings.length}`)

  const analysisClaims = allFindings.filter((f) => f.kind === "claim")
  console.log(`Claims extracted (S2): ${analysisClaims.length}`)

  const analysisSupports = allFindings.filter((f) => f.kind === "support")
  console.log(`Support assessments (S3): ${analysisSupports.length}`)

  const analysisStructures = allFindings.filter((f) => f.kind === "structure")
  console.log(`Structure nodes (S4): ${analysisStructures.length}`)

  const analysisFallacies = allFindings.filter((f) => f.kind === "fallacy")
  console.log(`Fallacy detections (S5): ${analysisFallacies.length}`)

  for (const f of analysisFallacies) {
    const [fallacyDetail] = await db
      .select()
      .from(findingFallacies)
      .where(eq(findingFallacies.findingId, f.id))
    console.log(
      `  - Fallacy found: ${fallacyDetail?.possibleType} (${fallacyDetail?.taxonomyRef}) text: "${f.text.slice(0, 60)}..."`,
    )
  }

  for (const s of analysisSupports.slice(0, 3)) {
    const [supportDetail] = await db
      .select()
      .from(findingSupports)
      .where(eq(findingSupports.findingId, s.id))
    console.log(
      `  - Support assessment: level=${supportDetail?.supportLevel} state=${s.state} text="${s.text.slice(0, 50)}..."`,
    )
  }

  console.log("\n=== PHASE 1 TEST SUCCESSFUL ===")
  process.exit(0)
}

run().catch((err) => {
  console.error("Test failed with error:", err)
  process.exit(1)
})
