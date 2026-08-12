import { checkReadiness } from "@/lib/health/readiness"

export const dynamic = "force-dynamic"

export async function GET(): Promise<Response> {
  const result = await checkReadiness()
  return Response.json(
    {
      status: result.ready ? "ready" : "not_ready",
      checks: result.checks,
      providers: result.providers,
    },
    {
      status: result.ready ? 200 : 503,
      headers: { "cache-control": "no-store" },
    },
  )
}
