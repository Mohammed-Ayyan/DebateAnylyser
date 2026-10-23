import { describe, expect, it, vi } from "vitest"
import { WhisperTranscriptionProvider } from "@/lib/transcription/whisper-adapter"

const defaultOptions = {
  apiUrl: "http://localhost:5001/transcribe",
  timeoutMs: 5000,
  asrLowConfidenceThreshold: 0.8,
  diarizationLowConfidenceThreshold: 0.8,
}

describe("WhisperTranscriptionProvider", () => {
  it("successfully parses valid Whisper response into transcriptionOutputSchema", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        language: "en",
        segments: [
          {
            start: 0.5,
            end: 2.1,
            text: "Welcome to the debate.",
            speaker: 0,
            confidence: 0.95,
            speaker_confidence: 0.9,
          },
          {
            start: 2.5,
            end: 4.8,
            text: "Thank you for having me.",
            speaker: 1,
            confidence: 0.92,
            speaker_confidence: 0.88,
          },
        ],
      }),
    })

    const provider = new WhisperTranscriptionProvider({
      ...defaultOptions,
      fetchImpl: mockFetch as unknown as typeof fetch,
    })

    const result = await provider.transcribe({ mediaUrl: "http://example.com/audio.mp3" })

    expect(result.source).toBe("asr")
    expect(result.language).toBe("en")
    expect(result.segments).toHaveLength(2)
    expect(result.segments[0]).toEqual({
      index: 0,
      startMs: 500,
      endMs: 2100,
      text: "Welcome to the debate.",
      speakerLabel: "Speaker 1",
      asrConfidence: 0.95,
      diarizationConfidence: 0.9,
      lowConfidence: false,
    })
    expect(result.segments[1]).toEqual({
      index: 1,
      startMs: 2500,
      endMs: 4800,
      text: "Thank you for having me.",
      speakerLabel: "Speaker 2",
      asrConfidence: 0.92,
      diarizationConfidence: 0.88,
      lowConfidence: false,
    })
  })

  it("identifies low confidence when asr or diarization confidence falls below threshold", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        language: "en",
        segments: [
          {
            start: 0.0,
            end: 1.0,
            text: "Muffled speech",
            speaker: 0,
            confidence: 0.65, // Below 0.8
            speaker_confidence: 0.9,
          },
          {
            start: 1.2,
            end: 2.5,
            text: "Unclear speaker",
            speaker: 0,
            confidence: 0.95,
            speaker_confidence: 0.7, // Below 0.8
          },
        ],
      }),
    })

    const provider = new WhisperTranscriptionProvider({
      ...defaultOptions,
      fetchImpl: mockFetch as unknown as typeof fetch,
    })

    const result = await provider.transcribe({ mediaUrl: "http://example.com/audio.mp3" })
    expect(result.segments[0].lowConfidence).toBe(true)
    expect(result.segments[1].lowConfidence).toBe(true)
  })

  it("throws ASR_EMPTY_TRANSCRIPT when no speech segments are returned", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        language: "en",
        segments: [],
      }),
    })

    const provider = new WhisperTranscriptionProvider({
      ...defaultOptions,
      fetchImpl: mockFetch as unknown as typeof fetch,
    })

    await expect(
      provider.transcribe({ mediaUrl: "http://example.com/silent.mp3" }),
    ).rejects.toThrow(
      expect.objectContaining({
        name: "TranscriptionError",
        code: "ASR_EMPTY_TRANSCRIPT",
        retryable: false,
      }),
    )
  })

  it("throws ASR_SOURCE_REJECTED on HTTP 400 or 422 errors", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ error: "Media file corrupt" }),
    })

    const provider = new WhisperTranscriptionProvider({
      ...defaultOptions,
      fetchImpl: mockFetch as unknown as typeof fetch,
    })

    await expect(
      provider.transcribe({ mediaUrl: "http://example.com/corrupt.bin" }),
    ).rejects.toThrow(
      expect.objectContaining({
        name: "TranscriptionError",
        code: "ASR_SOURCE_REJECTED",
        retryable: false,
      }),
    )
  })

  it("throws retryable ASR_PROVIDER_UNAVAILABLE on HTTP 500/503 errors", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: "Model loading" }),
    })

    const provider = new WhisperTranscriptionProvider({
      ...defaultOptions,
      fetchImpl: mockFetch as unknown as typeof fetch,
    })

    await expect(provider.transcribe({ mediaUrl: "http://example.com/audio.mp3" })).rejects.toThrow(
      expect.objectContaining({
        name: "TranscriptionError",
        code: "ASR_PROVIDER_UNAVAILABLE",
        retryable: true,
      }),
    )
  })

  it("throws ASR_INVALID_RESPONSE when response shape is malformed", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        not_segments: "invalid",
      }),
    })

    const provider = new WhisperTranscriptionProvider({
      ...defaultOptions,
      fetchImpl: mockFetch as unknown as typeof fetch,
    })

    await expect(provider.transcribe({ mediaUrl: "http://example.com/audio.mp3" })).rejects.toThrow(
      expect.objectContaining({
        name: "TranscriptionError",
        code: "ASR_INVALID_RESPONSE",
        retryable: true,
      }),
    )
  })

  it("throws ASR_ABORTED when signal is aborted externally", async () => {
    const abortController = new AbortController()
    const mockFetch = vi.fn().mockImplementation((_url, { signal }: { signal: AbortSignal }) => {
      return new Promise((_, reject) => {
        signal.addEventListener("abort", () => {
          reject(new Error("Request aborted"))
        })
      })
    })

    const provider = new WhisperTranscriptionProvider({
      ...defaultOptions,
      fetchImpl: mockFetch as unknown as typeof fetch,
    })

    const promise = provider.transcribe(
      { mediaUrl: "http://example.com/audio.mp3" },
      abortController.signal,
    )

    abortController.abort()

    await expect(promise).rejects.toThrow(
      expect.objectContaining({
        name: "TranscriptionError",
        code: "ASR_ABORTED",
        retryable: false,
      }),
    )
  })

  it("throws ASR_TIMEOUT when request exceeds configured timeoutMs", async () => {
    const mockFetch = vi.fn().mockImplementation((_url, { signal }: { signal: AbortSignal }) => {
      return new Promise((_, reject) => {
        signal.addEventListener("abort", () => {
          reject(new Error("Whisper transcription timed out"))
        })
      })
    })

    const provider = new WhisperTranscriptionProvider({
      ...defaultOptions,
      timeoutMs: 50,
      fetchImpl: mockFetch as unknown as typeof fetch,
    })

    await expect(provider.transcribe({ mediaUrl: "http://example.com/audio.mp3" })).rejects.toThrow(
      expect.objectContaining({
        name: "TranscriptionError",
        code: "ASR_TIMEOUT",
        retryable: true,
      }),
    )
  })
})
