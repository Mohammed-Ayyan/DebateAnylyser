import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import { loadPublicAnalysisState } from "@/lib/analysis/public-analysis"
import { requireAuthenticated, resolvePrincipal } from "@/lib/auth/principal"
import { authorizeAnalysisOwner } from "@/lib/authz/analysis-policy"
import type { PipelineStage, StageStatus } from "@/lib/contracts/analysis"
import { AppError } from "@/lib/errors/app-error"
import { withApiRoute } from "@/lib/http/route"
import { enforceRateLimit, getRequestRateLimitSubject } from "@/lib/rate-limit/limiter"

type RouteContext = { params: Promise<{ id: string }> }

function parseFilter<T extends string>(
  request: NextRequest,
  name: string,
  allowed: readonly T[],
): T | undefined {
  const value = request.nextUrl.searchParams.get(name)
  if (value === null) return undefined
  if ((allowed as readonly string[]).includes(value)) return value as T
  throw new AppError({
    code: "INVALID_FINDING_FILTER",
    status: 400,
    message: `Unsupported ${name} filter.`,
    expose: true,
  })
}

export const GET = withApiRoute<RouteContext>(async (request: NextRequest, context) => {
  const { id: analysisId } = await context.params
  const principal = requireAuthenticated(await resolvePrincipal(request))
  await enforceRateLimit("C", getRequestRateLimitSubject(request, principal))
  await authorizeAnalysisOwner(principal, analysisId)

  const kind = parseFilter(request, "kind", [
    "claim",
    "support",
    "structure",
    "fallacy",
    "credibility",
  ] as const)
  const findingState = parseFilter(request, "state", ["ok", "insufficient", "contested"] as const)
  const state = await loadPublicAnalysisState(analysisId)
  const findings = (state.assembled?.findings ?? []).filter(
    (finding) =>
      (!kind || finding.kind === kind) && (!findingState || finding.state === findingState),
  )
  const returnedIds = new Set(findings.map((finding) => finding.id))
  const stageMap = new Map<PipelineStage, StageStatus>(
    state.stageRuns.map((run) => [run.stage, run.status]),
  )

  return NextResponse.json({
    stages: {
      S2: stageMap.get("S2") ?? "pending",
      S3: stageMap.get("S3") ?? "pending",
      S4: stageMap.get("S4") ?? "pending",
      S5: stageMap.get("S5") ?? "pending",
      S6: stageMap.get("S6") ?? "pending",
      S7: stageMap.get("S7") ?? "pending",
      S8: stageMap.get("S8") ?? "pending",
      S9: stageMap.get("S9") ?? "pending",
      S10: stageMap.get("S10") ?? "pending",
    },
    assembly_ready: state.assembled !== undefined,
    findings,
    structure_edges: (state.assembled?.structure_edges ?? []).filter(
      (edge) => returnedIds.has(edge.from_finding_id) && returnedIds.has(edge.to_finding_id),
    ),
  })
})
