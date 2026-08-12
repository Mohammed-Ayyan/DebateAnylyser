import { loadEnvFile } from "node:process"

async function main(): Promise<void> {
  for (const path of [".env.local", ".env"]) {
    try {
      loadEnvFile(path)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    }
  }

  const { assertRuntimeRole } = await import("../lib/env/runtime-validation")
  assertRuntimeRole("analysis-worker", process.env)

  const controller = new AbortController()
  process.once("SIGINT", () => controller.abort())
  process.once("SIGTERM", () => controller.abort())

  const { processNextAnalysisJob, runAnalysisWorker } = await import("../lib/analysis/worker")
  if (process.argv.includes("--once")) await processNextAnalysisJob()
  else await runAnalysisWorker(controller.signal)
}

void main().catch((error: unknown) => {
  console.error("Analysis worker stopped after an unrecoverable error.", error)
  process.exitCode = 1
})
