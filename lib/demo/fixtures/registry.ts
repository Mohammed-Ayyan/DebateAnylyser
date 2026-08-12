import type { DemoFixture } from "./types"
import { DEMO_FIXTURE_1 } from "./demo-1"
import { DEMO_FIXTURE_2 } from "./demo-2"

/**
 * Registry of available demo transcripts.
 * Used by the demo API route to detect and serve precomputed results.
 */

export const DEMO_TRANSCRIPTS = [
  {
    slug: DEMO_FIXTURE_1.slug,
    title: "Policy Debate — Renewable Energy",
    description:
      "A balanced two-speaker debate with clear factual, causal, and policy claims. Demonstrates argument structure and one rhetorical pattern.",
    transcriptPath: DEMO_FIXTURE_1.transcriptPath,
  },
  {
    slug: DEMO_FIXTURE_2.slug,
    title: "Complex Debate — AI Regulation",
    description:
      "An adversarial debate with competing claims, unsupported assertions, and multiple rhetorical techniques (appeal to authority, slippery slope, false dichotomy).",
    transcriptPath: DEMO_FIXTURE_2.transcriptPath,
  },
] as const

const fixtureMap: Record<string, DemoFixture> = {
  [DEMO_FIXTURE_1.slug]: DEMO_FIXTURE_1,
  [DEMO_FIXTURE_2.slug]: DEMO_FIXTURE_2,
}

export function isDemoTranscript(slug: string): boolean {
  return slug in fixtureMap
}

export function getDemoFixture(slug: string): DemoFixture | undefined {
  return fixtureMap[slug]
}
