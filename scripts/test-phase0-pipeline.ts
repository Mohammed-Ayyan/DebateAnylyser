import { readFileSync } from "node:fs"
import { join } from "node:path"

async function main() {
  console.log("=== Phase 0 End-to-End Verification ===")
  const baseUrl = "http://localhost:3000"

  // 1. Authenticate with dev session
  console.log("\n1. Authenticating via development session...")
  const authRes = await fetch(`${baseUrl}/api/v1/auth/development-session?return_to=/dashboard`, {
    method: "POST",
    headers: {
      Origin: baseUrl,
    },
    redirect: "manual",
  })

  console.log("Auth status:", authRes.status)
  const setCookie = authRes.headers.get("set-cookie")
  if (!setCookie) {
    throw new Error("Failed to obtain session cookie from development-session endpoint")
  }
  const cookieMatch = setCookie.match(/debate_session=([^;]+)/)
  if (!cookieMatch) {
    throw new Error("debate_session cookie not found in response headers")
  }
  const sessionCookie = `debate_session=${cookieMatch[1]}`
  console.log("Session cookie acquired.")

  // 1b. Fetch current legal policy and consent
  console.log("\n1b. Fetching current legal policy version...")
  const policyRes = await fetch(`${baseUrl}/api/v1/legal/policy`, {
    headers: { Cookie: sessionCookie },
  })
  const policyData = (await policyRes.json()) as { version?: string }
  console.log("Current policy version:", policyData.version)

  if (policyData.version) {
    console.log("Accepting acceptable-use policy via POST /api/v1/me/consent...")
    const consentRes = await fetch(`${baseUrl}/api/v1/me/consent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: baseUrl,
        Cookie: sessionCookie,
      },
      body: JSON.stringify({ acceptable_use_version: policyData.version }),
    })
    console.log("Consent response status:", consentRes.status)
  }

  // 2. Read representative debate transcript
  const transcriptPath = join(process.cwd(), "public", "test-transcripts", "debate-demo-1.txt")
  const transcriptText = readFileSync(transcriptPath, "utf-8")
  console.log(`\n2. Loaded representative transcript (${transcriptText.length} chars).`)

  // 3. Submit analysis via POST /api/v1/analyses
  console.log("\n3. Submitting debate transcript to POST /api/v1/analyses...")
  const submitRes = await fetch(`${baseUrl}/api/v1/analyses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: baseUrl,
      Cookie: sessionCookie,
    },
    body: JSON.stringify({
      source_type: "paste",
      paste_text: transcriptText,
      rights_basis: "public_domain",
      intended_use: "education",
      title: "Phase 0 Verification — Renewable Energy Debate",
      retention_setting: "keep",
    }),
  })

  console.log("Submission HTTP status:", submitRes.status)
  const submitData = (await submitRes.json()) as { id?: string; status?: string; error?: unknown }
  console.log("Submission response:", submitData)

  if (!submitData.id) {
    throw new Error(`Analysis submission failed: ${JSON.stringify(submitData)}`)
  }

  const analysisId = submitData.id
  console.log(`Created Analysis ID: ${analysisId}`)

  // 4. Poll GET /api/v1/analyses/{id} until status reaches complete or failed
  console.log("\n4. Polling analysis progress...")
  let attempts = 0
  let finalStatus = ""
  let analysisResult: any = null

  while (attempts < 60) {
    attempts++
    await new Promise((resolve) => setTimeout(resolve, 3000))

    const pollRes = await fetch(`${baseUrl}/api/v1/analyses/${analysisId}`, {
      headers: {
        Cookie: sessionCookie,
      },
    })

    if (!pollRes.ok) {
      console.log(`Poll HTTP error: ${pollRes.status}`)
      continue
    }

    analysisResult = await pollRes.json()
    const status = analysisResult.analysis?.status ?? analysisResult.status
    const stage = analysisResult.analysis?.current_stage ?? analysisResult.current_stage
    console.log(`[${attempts * 3}s] Status: ${status} | Stage: ${stage ?? "N/A"}`)

    if (status === "complete" || status === "failed" || status === "partial") {
      finalStatus = status
      break
    }
  }

  console.log("\n5. Verification Results:")
  console.log(`Final Status: ${finalStatus}`)
  console.log(JSON.stringify(analysisResult, null, 2))
}

main().catch((err) => {
  console.error("Verification error:", err)
  process.exit(1)
})
