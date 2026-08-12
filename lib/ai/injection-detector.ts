export type InjectionSignal = {
  code:
    | "delimiter_collision"
    | "instruction_override"
    | "prompt_exfiltration"
    | "role_impersonation"
  start: number
  end: number
}

const patterns: ReadonlyArray<{ code: InjectionSignal["code"]; pattern: RegExp }> = [
  {
    code: "instruction_override",
    pattern: /\b(?:ignore|disregard|override)\b.{0,40}\b(?:instructions?|prompt|rules?)\b/gi,
  },
  {
    code: "prompt_exfiltration",
    pattern:
      /\b(?:reveal|print|show|leak|repeat)\b.{0,40}\b(?:system prompt|hidden instructions?)\b/gi,
  },
  {
    code: "role_impersonation",
    pattern: /(?:^|\n)\s*(?:system|assistant|developer)\s*:/gi,
  },
  { code: "delimiter_collision", pattern: /<<<(?:SOURCE|END)>>>/g },
]

export function detectInjectionSignals(source: string): InjectionSignal[] {
  const signals: InjectionSignal[] = []
  for (const { code, pattern } of patterns) {
    pattern.lastIndex = 0
    for (const match of source.matchAll(pattern)) {
      const start = match.index
      signals.push({ code, start, end: start + match[0].length })
    }
  }
  return signals.sort(
    (left, right) => left.start - right.start || left.code.localeCompare(right.code),
  )
}
