async function verify(claim: string, passage: string) {
  const prompt = `You are a strict, objective factual verifier.
Judge ONLY the relationship between the supplied claim and the source passage.
Use no external knowledge and never produce a truth or person-level verdict.
Output a JSON object with:
- "relation": "supports" | "refutes" | "neutral" | "insufficient"
- "licensing_quote": an EXACT verbatim sentence copied from the passage that justifies the relation, or null if relation is "insufficient"
- "confidence": number between 0 and 1

Claim: ${claim}
Passage: ${passage}

Output JSON only:`

  const res = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: "phi3:mini",
      prompt,
      format: "json",
      stream: false,
      options: { temperature: 0.1 },
    }),
  })
  const data = await res.json()
  return JSON.parse(data.response)
}

async function run() {
  console.log("1. Supports:")
  console.log(
    await verify(
      "Alan Turing formalised the concepts of algorithm and computation.",
      "He formalised the concepts of algorithm and computation with the Turing machine, a model of a general-purpose computer.",
    ),
  )

  console.log("\n2. Refutes:")
  console.log(
    await verify(
      "Alan Turing was born in France.",
      "Alan Turing was born in Maida Vale, London, England on 23 June 1912.",
    ),
  )

  console.log("\n3. Insufficient:")
  console.log(
    await verify(
      "Alan Turing had three cats.",
      "Turing was a talented mathematician and logician who worked at Bletchley Park.",
    ),
  )
}

run().catch(console.error)
