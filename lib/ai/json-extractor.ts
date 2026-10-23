export function extractJsonFromModelOutput(raw: string): string {
  const trimmed = raw.trim()
  // 1. Strip markdown code fences if present
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed

  // 2. Locate outermost JSON object { ... } or array [ ... ]
  const firstBrace = candidate.indexOf("{")
  const firstBracket = candidate.indexOf("[")
  let startIdx = -1
  let endIdx = -1

  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    startIdx = firstBrace
    endIdx = candidate.lastIndexOf("}")
  } else if (firstBracket !== -1) {
    startIdx = firstBracket
    endIdx = candidate.lastIndexOf("]")
  }

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    return candidate.slice(startIdx, endIdx + 1)
  }
  return candidate
}
