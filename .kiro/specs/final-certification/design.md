# Design Document: Final Certification

## Overview

Final Certification is an evidence-producing, secret-safe workflow for the currently supported Debate Analyser surface. It certifies real Groq S2–S5 in strict dependency order, preserves the certified Deepgram S1 baseline, verifies PostgreSQL, Redis, and the immutable Drizzle migration chain, gates full desktop/mobile Playwright on reachable infrastructure, runs the complete Node 24 regression/build set, and emits an exact factual report.

The workflow is fail-honest rather than fail-fast: every check receives an independent `PASS`, `FAIL`, `BLOCKED`, or `DEFERRED` status. A failed dependency blocks only downstream nodes; unrelated branches continue. Specification work does not execute certification, inspect secret values, modify application code, modify `drizzle/`, or claim production readiness.

S6, S7, Auth0, Live Debate, and PDF are explicit deferred boundaries. UI/UX and Driver.js changes are prohibited unless full E2E evidence identifies a reproducible application regression; any authorized correction is minimal and followed by targeted and downstream reruns.

## Architecture

```mermaid
flowchart TD
    A[Spec approved] --> B[Node 24 preflight]
    B --> C[Secret presence checks]
    C --> S1[Real Deepgram S1]
    C --> S2[Real Groq S2]
    S2 -->|validated output| S3[Real Groq S3]
    S3 -->|validated output| S4[Real Groq S4]
    S4 -->|validated output| S5[Real Groq S5]
    C --> DB[PostgreSQL connectivity]
    C --> R[Redis PING]
    DB --> MV[Drizzle check and optional migration verification]
    DB --> E2E{Database PASS?}
    R --> E2E
    E2E -->|both PASS| PW[Full Playwright: desktop + mobile]
    E2E -->|either not PASS| PWB[E2E BLOCKED]
    B --> REG[Node 24 regression checks]
    PW --> TRIAGE[E2E failure classification]
    TRIAGE --> FIX{Genuine UI/Tour regression?}
    FIX -->|yes| REM[Minimal correction and rerun]
    FIX -->|no| KEEP[Preserve UI and Driver.js]
    S1 --> REPORT[Exact report assembler]
    S2 --> REPORT
    S3 --> REPORT
    S4 --> REPORT
    S5 --> REPORT
    MV --> REPORT
    PWB --> REPORT
    PW --> REPORT
    REG --> REPORT
    REM --> REPORT
    KEEP --> REPORT
    D[Deferred: S6, S7, Auth0, Live Debate, PDF] --> REPORT
```

The orchestration graph has no cycles. Remediation creates a new evidence attempt rather than mutating prior evidence, so historical failures remain auditable.