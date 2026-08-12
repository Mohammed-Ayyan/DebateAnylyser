/**
 * Demo fixture index — precomputed analysis results for demo transcripts.
 * These fixtures conform to the existing application contracts and represent
 * what the S1–S10 pipeline would produce for each demo transcript.
 */

export { DEMO_FIXTURE_1 } from "./demo-1"
export { DEMO_FIXTURE_2 } from "./demo-2"
export type { DemoFixture, DemoSegment, DemoSpeaker, DemoFinding, DemoStructureEdge } from "./types"
export { DEMO_TRANSCRIPTS, isDemoTranscript, getDemoFixture } from "./registry"
