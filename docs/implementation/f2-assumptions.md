# F2 Transcription and Speaker Diarization — implementation assumptions

Date: 2026-07-27

## Provider and source decisions

- The core transcription contract is vendor-neutral. The first production adapter uses Deepgram batch speech-to-text because its documented output supplies word timestamps, speaker labels, word confidence, and speaker confidence—the signals required by S1 and H4.
- The ASR model and diarization model are configuration, defaulting to `nova-3` and pinned diarization `v2`. Provider credentials are required only for audio/video processing; paste and text-document processing remain local.
- Uploaded media is shared with the configured ASR processor through a short-lived, read-only object URL. Deployment must approve the provider as a data processor and disclose that transfer because recordings can contain third-party voice data.
- TXT, PDF, and DOCX extraction is local and bounded to 25 MiB by default. Uploaded A/V remains subject to the F1 upload limit.
- Direct public-media URLs are rechecked against current host policy and public DNS before ASR handoff. Official API/caption URL methods fail closed until a provider-specific official integration is configured; scraping and access-control bypass are not fallback behavior.

## Transcript and confidence semantics

- Provider words are assembled into provider utterances or contiguous same-speaker groups. Segment timestamps are derived from provider word/utterance timestamps; generic labels such as `Speaker 1` never imply identity.
- Segment ASR confidence uses provider utterance confidence or mean word confidence. Diarization confidence uses the minimum word-level speaker confidence within the segment so one uncertain attribution marks the span for review.
- Provisional low-confidence thresholds are `0.80` for both signals and remain configurable pending calibration. Public APIs and UI expose categorical bands only; raw model confidence remains internal.
- Pasted and extracted text is marked `user_supplied`. It receives zero-valued untimed positions and `insufficient` model-confidence labels rather than fabricated timing, speakers, or model certainty.
- A/V segments missing either confidence signal are marked low confidence. Downstream stages must inherit the caveat; F2 does not implement those stages.

## Durability and lifecycle

- S1 persistence is idempotent under a PostgreSQL advisory lock: one transcript per analysis, unique speaker labels per transcript, and contiguous segment indexes.
- Worker leases renew during long provider calls. Expired running S1 attempts are marked failed before a new attempt starts. Retryable failures use bounded exponential retry; terminal or exhausted failures produce explicit stage/error events and fail honestly.
- F2 advances `queued → transcribing → analyzing`, publishes `stage.status` and `transcript.ready`, then atomically requeues the durable job with an `S2` stage cursor. It does not emit findings or claim that the overall analysis is complete. F3 owns claim extraction and completion of the job at the current pipeline boundary.
- Legacy URL analyses created before retrieval metadata existed are migrated to `none` and fail closed; they must be resubmitted with an explicit approved retrieval method.

## Operations and sources

Run the separate worker with `npm run worker`; use `npm run worker:once` for one claim. The service requires PostgreSQL, Redis, object storage for uploads, and `DEEPGRAM_API_KEY` for A/V.

Provider behavior was verified against [Deepgram speaker diarization documentation](https://developers.deepgram.com/docs/diarization) and its [2026 Batch Diarization V2 notice](https://developers.deepgram.com/changelog/2026/5/14). Content was rephrased for compliance with licensing restrictions.