# Debate Analyzer V2 — Phase 2 Verification Report
**Local Audio and Video Transcription: Zero-Cost Whisper Integration**

**Date:** October 2026  
**Environment:** Windows Workstation  
**Hardware Profile:**  
- **GPU:** NVIDIA GeForce RTX 4050 Laptop GPU (6,141 MiB Dedicated VRAM, Driver 591.86, CUDA 13.1)  
- **Host CPU / Memory:** 13th Gen Intel Core Processor, 16.5 GB RAM  
- **ASR Engine:** `faster-whisper` (v1.2.1) + `PyAV` (v18.1.0)  
- **Model:** `base.en` (~140 MB weights, quantized int8 / float16)  
- **Endpoint:** `http://localhost:5001/transcribe` (local HTTP service)

---

## 1. Executive Summary

Phase 2 replaces the paid cloud ASR dependency (**Deepgram API**) with a completely local, zero-cost speech recognition service powered by `faster-whisper`.

Key Highlights:
- **$0.00 API Cost:** `DEEPGRAM_API_KEY` is completely eliminated from local analysis operations.
- **Unified Audio & Video Decoding:** Native container decoding via PyAV handles `.wav`, `.mp3`, `.m4a`, `.aac`, `.flac`, `.ogg`, `.mp4`, `.mkv`, `.avi`, and `.webm` without requiring external ffmpeg binaries on the host PATH.
- **Zero VRAM Contention:** Running `base.en` with `compute_type="int8"` utilizes host CPU memory (~150 MB footprint), leaving the entire 6 GB VRAM envelope free for Ollama's `phi3:mini` LLM inference, preventing out-of-memory crashes.
- **5.0x Real-time Processing:** Transcribes media at ~5x faster than real-time playback speed.
- **Contract Conformance:** 100% compliant with `transcriptionOutputSchema` in `lib/transcription/contracts.ts`, including contiguous zero-based indices, accurate millisecond timestamps, confidence scoring, and speaker attribution.

---

## 2. Architecture & Implementation

### 2.1 Whisper Local HTTP Service (`whisper-service/server.py`)
The local service runs as a lightweight, multi-threaded daemon on port 5001:
- **`ThreadingHTTPServer` Architecture:** Handles concurrent health probes and transcription requests without blocking or deadlocking.
- **Resilient Device Fallback:** Attempts CUDA GPU acceleration (`float16`); if CUDA DLLs (e.g. `cublas64_12.dll`) are missing in Windows user space, it automatically falls back to CPU `int8` with clear diagnostics.
- **Flexible Media Ingestion:**
  - `http://` and `https://` URLs are safely streamed to temporary files and cleaned up immediately in a `finally` block.
  - `file://` URIs and direct filesystem paths (`C:\...`) are accessed directly without redundant copying.
- **Multi-Format Container Support:** PyAV decodes raw audio packets from both standalone audio containers and video files containing audio streams.

### 2.2 Speaker Diarization & Attribution
- **Diarization Landscape Analysis:** State-of-the-art neural diarization models (such as `pyannote/speaker-diarization-3.1`) require gated Hugging Face account authentication, non-commercial license acceptances, and heavy Torch model downloads (~1.5 GB).
- **Lightweight Acoustic Clustering:** `server.py` implements an automated feature extraction step using zero-crossing rates and energy variance. When distinct speaker characteristics are present, it performs 2-cluster KMeans with silhouette validation:
  - If distinct voice separation is detected (silhouette score > 0.40), segments are classified into `Speaker 1` and `Speaker 2` with dynamic confidence (`0.85–0.95`).
  - For single-speaker audio, all segments are attributed to `Speaker 1` with default 0.90 confidence.
  - Guarantees `segment.speakerLabel !== null`, strictly satisfying the ASR contract requirement.

### 2.3 TypeScript Provider Adapter (`lib/transcription/whisper-adapter.ts`)
- Implements `TranscriptionProvider` interface (`MediaTranscriptionRequest -> Promise<TranscriptionOutput>`).
- Normalizes start and end timestamps into integer milliseconds (`startMs`, `endMs`), enforcing `endMs >= startMs + 1`.
- Evaluates low-confidence thresholds (`asrLowConfidenceThreshold: 0.8`, `diarizationLowConfidenceThreshold: 0.8`).
- Converts HTTP error statuses:
  - HTTP 400 / 422 $\rightarrow$ `ASR_SOURCE_REJECTED` (non-retryable)
  - HTTP 500 / 503 $\rightarrow$ `ASR_PROVIDER_UNAVAILABLE` (retryable)
  - Empty transcripts $\rightarrow$ `ASR_EMPTY_TRANSCRIPT`
  - Timeout / Abort $\rightarrow$ `ASR_TIMEOUT` / `ASR_ABORTED`

---

## 3. Benchmark & Verification Results

### 3.1 Direct Media Transcription Benchmarks
Tested via `scripts/test-whisper-pipeline.ts`:
| Media File | Format | Duration | Transcription Time | Speedup Factor | Segments | Output Schema Conformance |
|---|---|---|---|---|---|---|
| `Bueller-Life-moves-pretty-fast.wav` | Audio (WAV) | 17.57s | 3.52s | **~5.0x** | 2 | **PASSED** (100% Validated) |
| `test-debate-video.mkv` | Video (MKV) | 17.57s | 1.94s | **~9.0x** | 2 | **PASSED** (100% Validated) |
| `test-debate-video.avi` | Video (AVI) | 17.57s | 2.05s | **~8.5x** | 2 | **PASSED** (100% Validated) |

### 3.2 Downstream Integration (S1 $\rightarrow$ S2 Claims)
The output of the local Whisper transcription was fed directly into Stage 2 (Claim Extraction via Ollama `phi3:mini`), confirming seamless end-to-end compatibility across stages.

### 3.3 Automated Test Suite
- Executed full Vitest suite:
  ```bash
  npm test
  ```
- **Result:** **42 test files passed, 242 tests passed** (0 failures).
- Includes 8 dedicated tests in `tests/whisper-adapter.test.ts` verifying:
  - Schema mapping and timestamp normalization
  - Low confidence detection
  - Empty transcript rejection (`ASR_EMPTY_TRANSCRIPT`)
  - Source rejection (`ASR_SOURCE_REJECTED`)
  - Provider unavailability (`ASR_PROVIDER_UNAVAILABLE`)
  - Timeout handling (`ASR_TIMEOUT`)
  - Abort signal propagation (`ASR_ABORTED`)

---

## 4. URL Ingestion & Media Retrieval Findings

1. **Direct Media URLs:**
   - Supported for direct `.mp3`, `.wav`, `.mp4`, `.webm`, `.m4a` file endpoints over HTTPS.
2. **Third-Party Video Platforms (e.g. YouTube):**
   - As mandated by project security and legal policies (`LEGAL_OFFICIAL_API_REQUIRED_HOSTS`), arbitrary streaming platform URLs require explicit official API integration or client-side extraction. The local Whisper server accepts pre-downloaded media or direct links, preserving the rights-gate security perimeter.
3. **Document Ingestion Bypass:**
   - Text, PDF, and DOCX inputs continue to bypass ASR entirely through `resolveTranscriptionInput`, extracting text directly with zero model overhead.

---

## 5. Acceptance Criteria Checklist

- [x] **Local Whisper provider implemented** (`faster-whisper` + `PyAV`).
- [x] **Produces exact output expected by existing transcription contract** (`transcriptionOutputSchema`).
- [x] **Valid timestamps, segment boundaries, language, and speaker labels** verified.
- [x] **Audio (.wav) and Video (.mkv, .avi) input formats tested and working**.
- [x] **Downstream compatibility with S2 Claim Extraction verified**.
- [x] **All 42 test files (242 tests) pass cleanly**.
- [x] **Zero paid API calls made**; `DEEPGRAM_API_KEY` uninvoked.

Phase 2 is complete. Dynamic evidence retrieval (S6), source credibility (S7), and public deployment remain deferred.
