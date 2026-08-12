import type { AssembledAnalysis, EvidenceSource } from "@/lib/contracts/analysis"

export type ReportAnnotationProjection = Readonly<{
  finding_id: string | null
  note: string | null
  visibility: "shown" | "hidden"
  highlighted: boolean
}>

export type ReportContestProjection = Readonly<{
  finding_id: string
  state: "open" | "acknowledged" | "resolved_valid" | "resolved_invalid"
  reason: string | null
  resolution: string | null
}>

export type RenderHtmlReportInput = Readonly<{
  analysis: AssembledAnalysis
  title: string
  analysis_id: string
  generated_at: string
  disclaimer_text: string
  disclaimer_version: string
  limitations_url: string
  annotations?: readonly ReportAnnotationProjection[]
  contests?: readonly ReportContestProjection[]
  curation_applied?: boolean
}>

const HTML_ESCAPES: Readonly<Record<string, string>> = Object.freeze({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
})

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character] ?? character)
}

function safeHttpsHref(value: string): string | null {
  try {
    const url = new URL(value)
    if (url.protocol !== "https:") return null
    return escapeHtml(url.href)
  } catch {
    return null
  }
}

function label(value: string): string {
  return escapeHtml(value.replaceAll("_", " "))
}

function renderSourceLink(source: EvidenceSource): string {
  const href = safeHttpsHref(source.url)
  if (!href) return '<span class="invalid-link">Link unavailable: invalid HTTPS URL</span>'
  return `<a href="${href}" rel="noopener noreferrer" target="_blank">Open verified source</a>`
}

function renderCredibility(source: EvidenceSource): string {
  const ratings = source.credibility_ratings ?? []
  if (ratings.length === 0 && !source.credibility_disagreement) return ""

  const items = ratings
    .map(
      (rating) => `<li>
        <strong>${label(rating.factor)}:</strong> ${label(rating.level)}
        <span>Method: ${escapeHtml(rating.method_provenance)}.</span>
        <span>Rater: ${escapeHtml(rating.rater_ref)}.</span>
        <span class="contest-note">Qualitative signal; contestable.</span>
      </li>`,
    )
    .join("")
  const disagreement = source.credibility_disagreement
    ? '<p class="contest-note">Credibility signals disagree.</p>'
    : ""

  return `<section class="credibility" aria-label="Qualitative credibility signals">
    <h4>Qualitative credibility signals</h4>
    ${items ? `<ul>${items}</ul>` : ""}
    ${disagreement}
  </section>`
}

function renderSource(source: EvidenceSource): string {
  return `<article class="source-card" id="source-${escapeHtml(source.id)}">
    <h3>Source <code>${escapeHtml(source.id)}</code></h3>
    <dl>
      <dt>Evidence relation</dt><dd>${label(source.supports_relation)}</dd>
      <dt>Provenance</dt><dd>${escapeHtml(source.provenance)}</dd>
      <dt>Retrieved at</dt><dd>${escapeHtml(source.retrieved_at)}</dd>
    </dl>
    <p><strong>Retrieved excerpt:</strong> ${escapeHtml(source.retrieved_snippet)}</p>
    <p>${renderSourceLink(source)}</p>
    ${renderCredibility(source)}
  </article>`
}

function renderAnchors(
  finding: AssembledAnalysis["findings"][number],
  sourceById: ReadonlyMap<string, EvidenceSource>,
): string {
  const spans = finding.span_refs
    .map(
      (span) =>
        `<li>Segment <code>${escapeHtml(span.segment_id)}</code>, characters ${span.start_char}–${span.end_char}</li>`,
    )
    .join("")
  const evidence = finding.evidence_refs
    .map((sourceId) => {
      const source = sourceById.get(sourceId)
      return source
        ? `<li><a href="#source-${escapeHtml(source.id)}">Source <code>${escapeHtml(source.id)}</code></a></li>`
        : `<li>Source reference <code>${escapeHtml(sourceId)}</code> (not included)</li>`
    })
    .join("")

  return `<section class="traceability" aria-label="Traceability">
    <h4>Traceability</h4>
    ${spans ? `<p>Transcript anchors</p><ul>${spans}</ul>` : "<p>No transcript anchor.</p>"}
    ${evidence ? `<p>Evidence references</p><ul>${evidence}</ul>` : "<p>No external evidence reference.</p>"}
  </section>`
}

function renderFinding(
  finding: AssembledAnalysis["findings"][number],
  annotations: readonly ReportAnnotationProjection[],
  contests: readonly ReportContestProjection[],
  sourceById: ReadonlyMap<string, EvidenceSource>,
): string {
  const findingAnnotations = annotations.filter(
    (annotation) => annotation.finding_id === finding.id && annotation.visibility === "shown",
  )
  const notes = findingAnnotations
    .filter((annotation) => annotation.note !== null)
    .map((annotation) => `<li>${escapeHtml(annotation.note ?? "")}</li>`)
    .join("")
  const highlighted = findingAnnotations.some((annotation) => annotation.highlighted)
  const findingContests = contests
    .filter((contest) => contest.finding_id === finding.id)
    .map(
      (contest) => `<li>
        <strong>${label(contest.state)}</strong>
        ${contest.reason === null ? "" : `<span>Reason: ${escapeHtml(contest.reason)}</span>`}
        ${contest.resolution === null ? "" : `<span>Resolution: ${escapeHtml(contest.resolution)}</span>`}
      </li>`,
    )
    .join("")

  return `<article class="finding${highlighted ? " highlighted" : ""}" id="finding-${escapeHtml(finding.id)}">
    <header><h3>${label(finding.kind)} finding</h3>${highlighted ? "<strong>Curator highlighted</strong>" : ""}</header>
    <p class="finding-text">${escapeHtml(finding.text)}</p>
    <dl>
      <dt>Finding state</dt><dd>${label(finding.state)}</dd>
      <dt>Confidence</dt><dd>${label(finding.confidence_band)}</dd>
      <dt>Produced by stage</dt><dd>${escapeHtml(finding.produced_by_stage)}</dd>
      <dt>Finding ID</dt><dd><code>${escapeHtml(finding.id)}</code></dd>
    </dl>
    ${renderAnchors(finding, sourceById)}
    ${findingContests ? `<section aria-label="Contests"><h4>Contest record</h4><ul>${findingContests}</ul></section>` : ""}
    ${notes ? `<section aria-label="Curator annotations"><h4>Curator annotations</h4><ul>${notes}</ul></section>` : ""}
  </article>`
}

const DOCUMENT_STYLE = `
  :root { color-scheme: light; font-family: system-ui, sans-serif; line-height: 1.5; }
  body { margin: 0 auto; max-width: 72rem; padding: 2rem; color: #171717; background: #fff; }
  header, footer, section, article { break-inside: avoid; }
  .metadata, .disclosure, .finding, .source-card { border: 1px solid #bbb; padding: 1rem; margin: 1rem 0; }
  .disclosure { border-width: 2px; }
  .highlighted { border-left: 0.5rem solid #6b4f00; }
  dl { display: grid; grid-template-columns: minmax(9rem, auto) 1fr; gap: 0.25rem 1rem; }
  dt { font-weight: 700; }
  dd { margin: 0; overflow-wrap: anywhere; }
  code { overflow-wrap: anywhere; }
  a { color: #0645ad; }
  .contest-note, .invalid-link { font-weight: 700; }
  @media print { a { color: inherit; } body { max-width: none; } }
`

export function renderHtmlReport(input: RenderHtmlReportInput): string {
  const limitationsHref = safeHttpsHref(input.limitations_url)
  if (!limitationsHref) throw new TypeError("limitations_url must be a valid HTTPS URL")

  const annotations = input.annotations ?? []
  const contests = input.contests ?? []
  const hiddenFindingIds = new Set(
    annotations
      .filter((annotation) => annotation.finding_id !== null && annotation.visibility === "hidden")
      .map((annotation) => annotation.finding_id as string),
  )
  const visibleFindings = input.analysis.findings.filter(
    (finding) => !hiddenFindingIds.has(finding.id),
  )
  const curationApplied =
    input.curation_applied === true ||
    annotations.some(
      (annotation) =>
        annotation.visibility === "hidden" || annotation.highlighted || annotation.note !== null,
    )
  const sourceById = new Map(input.analysis.sources.map((source) => [source.id, source]))
  const analysisNotes = annotations
    .filter(
      (annotation) =>
        annotation.finding_id === null &&
        annotation.visibility === "shown" &&
        annotation.note !== null,
    )
    .map((annotation) => `<li>${escapeHtml(annotation.note ?? "")}</li>`)
    .join("")
  const findings = visibleFindings
    .map((finding) => renderFinding(finding, annotations, contests, sourceById))
    .join("")
  const sources = input.analysis.sources.map(renderSource).join("")

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
  <meta name="referrer" content="no-referrer">
  <title>${escapeHtml(input.title)} — Analysis report</title>
  <style>${DOCUMENT_STYLE}</style>
</head>
<body>
  <header>
    <h1>${escapeHtml(input.title)}</h1>
    <p>Read-only analysis report</p>
  </header>
  <main>
    <section class="metadata" aria-labelledby="report-metadata">
      <h2 id="report-metadata">Report metadata</h2>
      <dl>
        <dt>Analysis ID</dt><dd><code>${escapeHtml(input.analysis_id)}</code></dd>
        <dt>Generated at</dt><dd>${escapeHtml(input.generated_at)}</dd>
        <dt>Categorical overview</dt><dd>${label(input.analysis.overview.categorical_read)}</dd>
      </dl>
      <p>${escapeHtml(input.analysis.overview.top_insight)}</p>
    </section>
    <section class="disclosure" aria-labelledby="report-disclaimer">
      <h2 id="report-disclaimer">Disclaimer and limitations</h2>
      <p>${escapeHtml(input.disclaimer_text)}</p>
      <p>Disclaimer version: ${escapeHtml(input.disclaimer_version)}</p>
      <p><a href="${limitationsHref}" rel="noopener noreferrer" target="_blank">Read the analysis limitations</a></p>
    </section>
    <section class="disclosure" aria-labelledby="curation-disclosure">
      <h2 id="curation-disclosure">Curation disclosure</h2>
      <p>${curationApplied ? "Curation was applied to this report." : "No curation was applied to this report."}</p>
      ${hiddenFindingIds.size > 0 ? `<p>${hiddenFindingIds.size} finding${hiddenFindingIds.size === 1 ? "" : "s"} omitted by the curator.</p>` : ""}
      ${analysisNotes ? `<h3>Report annotations</h3><ul>${analysisNotes}</ul>` : ""}
    </section>
    <section aria-labelledby="findings-heading">
      <h2 id="findings-heading">Findings</h2>
      ${findings || "<p>No findings are included in this projection.</p>"}
    </section>
    <section aria-labelledby="sources-heading">
      <h2 id="sources-heading">Evidence sources and provenance</h2>
      ${sources || "<p>No external sources are included.</p>"}
    </section>
  </main>
  <footer><p>End of immutable read-only report.</p></footer>
</body>
</html>`
}
