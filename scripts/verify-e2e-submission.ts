async function main() {
  console.log("=== 1. Authenticating Development Session ===")
  const authRes = await fetch("http://localhost:3000/api/v1/auth/development-session?return_to=/dashboard", {
    redirect: "manual",
  })
  const cookie = authRes.headers.get("set-cookie")
  if (!cookie) {
    throw new Error("Failed to get session cookie from development-session endpoint.")
  }
  console.log("Authenticated successfully.")

  console.log("\n=== 2. Submitting Fresh Transcript for Analysis ===")
  const transcriptText = `Speaker A: The local government spent 45 million dollars on city parks last year, which created 300 new municipal jobs.
Speaker B: According to the official audit, the actual park expenditure was 22 million dollars, and only 80 permanent jobs were established.
Speaker A: The remaining 23 million dollars was allocated to regional water conservation infrastructure.`

  const postRes = await fetch("http://localhost:3000/api/v1/analyses", {
    method: "POST",
    headers: {
      cookie,
      "content-type": "application/json",
      origin: "http://localhost:3000",
    },
    body: JSON.stringify({
      source_type: "paste",
      paste_text: transcriptText,
      rights_basis: "public_domain",
      intended_use: "research",
      title: "Live S2 Fix End-to-End Verification",
    }),
  })

  if (!postRes.ok) {
    const errText = await postRes.text()
    throw new Error(`Failed to create analysis (${postRes.status}): ${errText}`)
  }

  const analysisData = await postRes.json()
  const analysisId = analysisData.id
  console.log(`Created Analysis: ${analysisId} (status: ${analysisData.status})`)

  console.log("\n=== 3. Connecting to SSE Stream Endpoint ===")
  const streamUrl = `http://localhost:3000/api/v1/analyses/${analysisId}/stream`
  const streamRes = await fetch(streamUrl, {
    headers: {
      cookie,
      accept: "text/event-stream",
    },
  })

  console.log("Stream HTTP Status:", streamRes.status)
  console.log("Content-Type:", streamRes.headers.get("content-type"))

  if (streamRes.status !== 200) {
    const err = await streamRes.text()
    throw new Error(`Stream connection failed with status ${streamRes.status}: ${err}`)
  }

  const reader = streamRes.body?.getReader()
  if (!reader) throw new Error("No readable stream available on response body")

  const decoder = new TextDecoder()
  let isDone = false
  const stagesSeen = new Set<string>()
  const startMs = Date.now()

  // Concurrently poll the status endpoint just like our resilient UI does
  const pollTimer = setInterval(async () => {
    try {
      const statusRes = await fetch(`http://localhost:3000/api/v1/analyses/${analysisId}`, {
        headers: { cookie },
      })
      if (statusRes.ok) {
        const summary = await statusRes.json()
        const resolved = summary.stage_runs?.filter((r: any) => r.status === "complete").length ?? 0
        const active = summary.stage_runs?.find((r: any) => r.status === "running")?.stage ?? "none"
        const elapsed = ((Date.now() - startMs) / 1000).toFixed(1)
        console.log(`[POLL ${elapsed}s] Analysis status: ${summary.status} | Resolved: ${resolved}/11 | Active: ${active}`)
        if (summary.status === "complete") {
          isDone = true
        }
      }
    } catch {}
  }, 3000)

  console.log("\n=== 4. Listening for Real-time SSE Events ===")
  let buffer = ""
  while (!isDone && (Date.now() - startMs) < 180000) {
    const { done, value } = await reader.read()
    if (done) {
      console.log("SSE Stream closed by server.")
      break
    }
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n\n")
    buffer = lines.pop() || ""

    for (const rawMessage of lines) {
      const trimmed = rawMessage.trim()
      if (!trimmed || trimmed.startsWith(":")) continue // heartbeat
      console.log(`[SSE EVENT] ${trimmed.replace(/\n/g, " | ")}`)

      if (trimmed.includes('"type":"analysis.done"')) {
        isDone = true
        break
      }
      if (trimmed.includes('"stage":"S2"')) {
        stagesSeen.add("S2")
      }
    }
  }

  clearInterval(pollTimer)

  console.log("\n=== 5. Final Authoritative State Verification ===")
  const finalRes = await fetch(`http://localhost:3000/api/v1/analyses/${analysisId}`, {
    headers: { cookie },
  })
  const finalSummary = await finalRes.json()
  console.log("Final Analysis Status:", finalSummary.status)
  console.log("Assembly Ready:", finalSummary.assembly_ready)
  console.log("Stage Runs:")
  for (const r of finalSummary.stage_runs ?? []) {
    console.log(`  - Stage ${r.stage}: ${r.status}`)
  }

  // Fetch claims
  const claimsRes = await fetch(`http://localhost:3000/api/v1/analyses/${analysisId}/claims`, {
    headers: { cookie },
  })
  const claimsData = await claimsRes.json()
  console.log(`Extracted Claims Count: ${claimsData.findings?.length ?? 0}`)
  for (const c of claimsData.findings ?? []) {
    console.log(`  - [Claim] "${c.text}" (type: ${c.claim?.claim_type})`)
  }

  if (finalSummary.status === "complete") {
    console.log("\n>>> VERIFICATION SUCCESS: Analysis fully completed through all stages! <<<")
    process.exit(0)
  } else {
    console.error("\n>>> VERIFICATION FAILED: Analysis did not complete in expected time. <<<")
    process.exit(1)
  }
}

main().catch(err => {
  console.error("Verification execution error:", err)
  process.exit(1)
})
export {}
