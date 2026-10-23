import { beforeEach, describe, expect, it, vi } from "vitest"
import { checkReadiness } from "@/lib/health/readiness"

vi.mock("@/lib/db/client", () => ({
  getDatabase: () => ({
    execute: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
  }),
}))

vi.mock("@/lib/cache/redis", () => ({
  getRedis: () => ({
    ping: vi.fn().mockResolvedValue("PONG"),
  }),
}))

describe("checkReadiness", () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env = { ...originalEnv }
    vi.restoreAllMocks()
  })

  it("reports whisper and ollama as skipped when not configured as active providers", async () => {
    delete process.env.ASR_PROVIDER
    delete process.env.CLAIM_PROVIDER
    delete process.env.SUPPORT_PROVIDER
    delete process.env.STRUCTURE_PROVIDER
    delete process.env.FALLACY_PROVIDER
    delete process.env.EVIDENCE_VERIFIER_PROVIDER
    const result = await checkReadiness()
    expect(result.checks.whisper).toBe("skipped")
    expect(result.checks.ollama).toBe("skipped")
  })

  it("probes whisper when ASR_PROVIDER is whisper and reports ok on success", async () => {
    process.env.ASR_PROVIDER = "whisper"
    const mockFetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "ok" }), { status: 200 }))
    const result = await checkReadiness()
    expect(mockFetch).toHaveBeenCalled()
    expect(result.checks.whisper).toBe("ok")
  })

  it("reports error when whisper probe fails", async () => {
    process.env.ASR_PROVIDER = "whisper"
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Connection refused"))
    const result = await checkReadiness()
    expect(result.checks.whisper).toBe("error")
  })

  it("probes ollama when an ollama provider is active", async () => {
    process.env.CLAIM_PROVIDER = "ollama"
    const mockFetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ version: "0.40.4" }), { status: 200 }))
    const result = await checkReadiness()
    expect(mockFetch).toHaveBeenCalled()
    expect(result.checks.ollama).toBe("ok")
  })
})
