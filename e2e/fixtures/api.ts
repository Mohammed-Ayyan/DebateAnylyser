import type { Page, Route } from "@playwright/test"

const e2eOrigin = "http://127.0.0.1:3107"

export const IDS = {
  analysis: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  speaker: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  segment: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  claim: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  source: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  export: "ffffffff-ffff-4fff-8fff-ffffffffffff",
  share: "11111111-1111-4111-8111-111111111111",
  user: "22222222-2222-4222-8222-222222222222",
} as const

const now = "2026-02-12T10:00:00.000Z"
const segmentText = "The municipal pilot expanded evening bus service."

export const transcriptFixture = {
  transcript: {
    id: "33333333-3333-4333-8333-333333333333",
    source: "user_supplied",
    language: "en",
    created_at: now,
  },
  speakers: [{ id: IDS.speaker, label: "Speaker A", display_name: null }],
  segments: [
    {
      id: IDS.segment,
      index: 0,
      start_ms: 0,
      end_ms: 4_000,
      text: segmentText,
      speaker_id: IDS.speaker,
      speaker_label: "Speaker A",
      asr_confidence: "insufficient",
      diarization_confidence: "insufficient",
      low_confidence: false,
    },
  ],
}

export const claimFixture = {
  id: IDS.claim,
  analysis_id: IDS.analysis,
  kind: "claim",
  text: segmentText,
  paraphrase: false,
  confidence_band: "medium",
  state: "ok",
  span_refs: [{ segment_id: IDS.segment, start_char: 0, end_char: 24 }],
  evidence_refs: [IDS.source],
  produced_by_stage: "S2",
  claim: {
    claim_type: "factual",
    check_worthy: true,
    speaker_id: IDS.speaker,
    speaker_label: "Speaker A",
  },
}

export const sourceFixture = {
  id: IDS.source,
  analysis_id: IDS.analysis,
  url: "https://records.example.test/pilot-schedule",
  retrieved_snippet: "The published schedule lists added evening routes during the pilot period.",
  provenance: "Municipal transport schedule archive",
  tier: "T1",
  resolves: true,
  supports_relation: "supports",
  licensing_quote_verified: true,
  retrieved_at: now,
}

const completedStages = Array.from({ length: 11 }, (_, index) => ({
  stage: `S${index}`,
  status: "complete",
  attempt: 1,
  error_class: null,
}))

export const analysisFixture = {
  id: IDS.analysis,
  title: "Municipal Transit Pilot Discussion",
  status: "complete",
  source_type: "paste",
  language: "en",
  created_at: now,
  updated_at: now,
  assembly_ready: true,
  overview: {
    categorical_read: "external_evidence_available",
    distribution: {
      claims: 1,
      support_present: 0,
      support_weak: 0,
      support_absent: 0,
      support_insufficient: 0,
      verified_sources: 1,
      possible_patterns: 0,
    },
    top_insight:
      "One transcript-anchored claim has a verified source relationship available for review.",
    explore_pointers: [{ finding_id: IDS.claim, reason: "external_evidence" }],
  },
  findings: [claimFixture],
  sources: [sourceFixture],
  structure_edges: [],
  stage_runs: completedStages,
}
export type ApiScenario = {
  history?: "populated" | "empty" | "error"
  submission?: "success" | "rights-blocked"
  evidence?: "populated" | "empty"
  analysis?: "success" | "error"
}

const meFixture = {
  user: {
    id: IDS.user,
    email: "researcher@example.test",
    acceptable_use_accepted_at: now,
    acceptable_use_version: "e2e-policy",
    default_retention_setting: "keep",
    created_at: now,
  },
  preferences: {
    confidence_display: "categorical",
    jargon_plain_language: true,
    reading_density: "comfortable",
    accessibility_prefs: { reduced_motion: true },
  },
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) })
}

function errorBody(message: string, code = "REQUEST_REJECTED") {
  return { error: { code, message } }
}

export async function mockApi(page: Page, scenario: ApiScenario = {}) {
  const sessionResponse = await page.request.post(
    "/api/v1/auth/development-session?return_to=%2Fdashboard",
    { headers: { origin: e2eOrigin }, maxRedirects: 0 },
  )
  if (sessionResponse.status() !== 303) {
    throw new Error(`Development session setup failed (${sessionResponse.status()}).`)
  }
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    const method = request.method()

    if (path === "/api/v1/auth/session") {
      if (method === "DELETE") return route.fulfill({ status: 204, body: "" })
      return json(route, {
        user: { id: IDS.user, email: meFixture.user.email, created_at: now },
        session: { expires_at: "2026-02-12T12:00:00.000Z" },
      })
    }
    if (path === "/api/v1/legal/policy") {
      return json(route, {
        active: true,
        mode: "counsel_approved",
        version: "e2e-policy",
        sources: { upload: true, paste: true, url: true },
      })
    }
    if (path === "/api/v1/me/data-export") {
      const accountExport = {
        id: IDS.export,
        analysis_id: null,
        kind: "account_data_json",
        status: "complete",
        content_type: "application/json",
        created_at: now,
        completed_at: now,
        download_url: `${e2eOrigin}/e2e-download/account.json`,
        download_expires_at: "2026-02-12T11:00:00.000Z",
      }
      return method === "POST"
        ? json(route, accountExport, 202)
        : json(route, { enabled: true, export: null })
    }
    if (path === "/api/v1/me/settings") return json(route, { saved: true })
    if (path === "/api/v1/me") {
      if (method === "DELETE") return json(route, { status: "accepted" }, 202)
      return json(route, meFixture)
    }
    if (path === "/api/v1/uploads") {
      return json(route, {
        upload_url: `${url.origin}/e2e-upload/source`,
        media_key: "e2e/authorized-transcript.txt",
      })
    }
    if (path === "/api/v1/analyses" && method === "POST") {
      if (scenario.submission === "rights-blocked") {
        return json(
          route,
          errorBody("This source cannot be queued under the selected authorization."),
          403,
        )
      }
      return json(route, { id: IDS.analysis, status: "queued" }, 201)
    }
    if (path === "/api/v1/analyses" && method === "GET") {
      if (scenario.history === "error") {
        return json(route, errorBody("Analysis history is unavailable."), 503)
      }
      const items =
        scenario.history === "empty"
          ? []
          : [
              {
                id: IDS.analysis,
                title: analysisFixture.title,
                status: "complete",
                source_type: "paste",
                retention_setting: "keep",
                created_at: now,
                updated_at: now,
              },
            ]
      return json(route, { items, next_cursor: null })
    }
    const analysisBase = `/api/v1/analyses/${IDS.analysis}`
    if (path === `${analysisBase}/stream`) {
      const events = [
        `event: stage.status\ndata: ${JSON.stringify({ type: "stage.status", stage: "S2", status: "complete", attempt: 1 })}`,
        `event: transcript.ready\ndata: ${JSON.stringify({ type: "transcript.ready", transcript_id: transcriptFixture.transcript.id })}`,
        `event: analysis.done\ndata: ${JSON.stringify({ type: "analysis.done", status: "complete" })}`,
      ].join("\n\n")
      return route.fulfill({
        status: 200,
        headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
        body: `${events}\n\n`,
      })
    }
    if (path === `${analysisBase}/transcript`) return json(route, transcriptFixture)
    if (path === `${analysisBase}/claims`) {
      return json(route, { stage_status: "complete", findings: [claimFixture] })
    }
    if (path === `${analysisBase}/timeline`) {
      return json(route, { points: [{ time_ms: 0, finding_id: IDS.claim }] })
    }
    if (path === `${analysisBase}/annotations`) return json(route, { annotations: [] })
    if (path === `${analysisBase}/shares` && method === "POST") {
      return json(
        route,
        {
          share: {
            id: IDS.share,
            analysis_id: IDS.analysis,
            status: "active",
            expires_at: null,
            revoked_at: null,
            created_at: now,
          },
          token: "abcdefghijklmnopqrstuvwxyzABCDEFGH123456789",
        },
        201,
      )
    }
    if (path === `${analysisBase}/shares`) return json(route, { shares: [] })
    if (path === `${analysisBase}/shares/${IDS.share}`) return route.fulfill({ status: 204 })
    if (path === `${analysisBase}/exports` && method === "POST") {
      return json(
        route,
        {
          id: IDS.export,
          analysis_id: IDS.analysis,
          kind: "report_html",
          status: "queued",
          content_type: null,
          created_at: now,
          completed_at: null,
        },
        202,
      )
    }
    if (path === `${analysisBase}/exports/${IDS.export}`) {
      return json(route, {
        id: IDS.export,
        analysis_id: IDS.analysis,
        kind: "report_html",
        status: "complete",
        content_type: "text/html; charset=utf-8",
        created_at: now,
        completed_at: now,
        download_url: `${e2eOrigin}/e2e-download/report.html`,
        download_expires_at: "2026-02-12T11:00:00.000Z",
      })
    }
    if (path === `${analysisBase}/findings/${IDS.claim}/evidence`) {
      const sources = scenario.evidence === "empty" ? [] : [sourceFixture]
      return json(route, {
        finding_id: IDS.claim,
        verification_state: sources.length ? "verified" : "unverified",
        claim_spans: claimFixture.span_refs,
        sources,
      })
    }
    if (path === `${analysisBase}/findings`) {
      return json(route, {
        stages: {
          S2: "complete",
          S3: "complete",
          S4: "complete",
          S5: "complete",
          S6: "complete",
          S7: "complete",
          S8: "complete",
          S9: "complete",
          S10: "complete",
        },
        findings: [],
        structure_edges: [],
      })
    }
    if (path === analysisBase) {
      if (scenario.analysis === "error") {
        return json(route, errorBody("The assembled analysis is unavailable."), 503)
      }
      return json(route, analysisFixture)
    }
    return json(route, errorBody(`No E2E fixture for ${method} ${path}`), 501)
  })

  await page.route("**/e2e-upload/source", (route) => route.fulfill({ status: 200, body: "" }))
  await page.route("**/e2e-download/report.html", (route) =>
    route.fulfill({
      status: 200,
      headers: {
        "content-type": "text/html",
        "content-disposition": "attachment; filename=analysis-report.html",
      },
      body: "<!doctype html><title>Analysis report</title>",
    }),
  )
  await page.route("**/e2e-download/account.json", (route) =>
    route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json",
        "content-disposition": "attachment; filename=account-data.json",
      },
      body: JSON.stringify({ analyses: [] }),
    }),
  )
}
