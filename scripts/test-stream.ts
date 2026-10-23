async function main() {
  const analysisId = process.argv[2] || "5fcdf5a6-7470-40a0-9bab-6059c6aec972"
  
  // 1. Authenticate to get session cookie
  const authRes = await fetch("http://localhost:3000/api/v1/auth/development-session?return_to=/dashboard", {
    redirect: "manual",
  })
  const cookie = authRes.headers.get("set-cookie")
  console.log("Auth cookie:", cookie ? "received" : "MISSING")

  // 2. Query stream endpoint
  const url = `http://localhost:3000/api/v1/analyses/${analysisId}/stream`
  console.log("Connecting to:", url)
  const res = await fetch(url, {
    headers: {
      cookie: cookie || "",
      accept: "text/event-stream",
    },
  })

  console.log("Response status:", res.status)
  console.log("Response headers:", Object.fromEntries(res.headers.entries()))

  if (!res.body) {
    console.log("No response body")
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let chunks = 0

  while (chunks < 10) {
    const { done, value } = await reader.read()
    if (done) {
      console.log("Stream closed by server.")
      break
    }
    chunks++
    console.log(`--- CHUNK ${chunks} ---`)
    console.log(decoder.decode(value))
  }

  process.exit(0)
}

main().catch(err => {
  console.error("Stream test error:", err)
  process.exit(1)
})
export {}
