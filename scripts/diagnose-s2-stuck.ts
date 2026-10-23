const Module = require("module")
const origRequire = Module.prototype.require
Module.prototype.require = function (id: string) {
  if (id === "server-only") return {}
  return origRequire.apply(this, arguments)
}

async function main() {
  const { getDatabase } = await import("../lib/db/client")
  const { analyses, analysisJobs, analysisStageRuns, analysisEvents } = await import("../lib/db/schema")
  const { findings } = await import("../lib/db/schema/findings")
  const { eq } = await import("drizzle-orm")

  const db = getDatabase()
  const ids = [
    "45da3aac-cb7c-4c06-910b-798fdc02887e",
    "5fcdf5a6-7470-40a0-9bab-6059c6aec972",
    "cad6f1f0-2f65-44a8-be59-1128564e221f"
  ]
  
  for (const id of ids) {
    console.log(`\n=================== ANALYSIS: ${id} ===================`)
    const [a] = await db.select().from(analyses).where(eq(analyses.id, id))
    if (!a) {
      console.log("Analysis record not found.")
      continue
    }
    console.log("Status:", a.status, "| Title:", a.title, "| Created:", a.createdAt, "| Updated:", a.updatedAt)

    const stageRuns = await db.select().from(analysisStageRuns).where(eq(analysisStageRuns.analysisId, id))
    console.log(`Stage Runs Count: ${stageRuns.length}`)
    for (const s of stageRuns) {
      console.log(`  Stage ${s.stage}: status=${s.status}, startedAt=${s.startedAt}, finishedAt=${s.finishedAt}, attempt=${s.attempt}, error=${s.errorClass}`)
    }

    const jobs = await db.select().from(analysisJobs).where(eq(analysisJobs.analysisId, id))
    console.log(`Jobs Count: ${jobs.length}`)
    for (const j of jobs) {
      console.log(`  Job ${j.id}: stage=${j.stage}, status=${j.status}, attempts=${j.attempts}, lockedAt=${j.lockedAt}, availableAt=${j.availableAt}`)
    }

    const events = await db.select().from(analysisEvents).where(eq(analysisEvents.analysisId, id))
    console.log(`Events Count: ${events.length}`)
    for (const e of events.slice(-5)) {
      console.log(`  Event ${e.sequence}: type=${e.eventType}, ts=${e.createdAt}`)
    }

    const f = await db.select().from(findings).where(eq(findings.analysisId, id))
    console.log(`Findings Count: ${f.length}`)
    const fByStage: Record<string, number> = {}
    for (const item of f) {
      fByStage[item.producedByStage] = (fByStage[item.producedByStage] || 0) + 1
    }
    console.log("Findings breakdown:", fByStage)
  }

  process.exit(0)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})

export {}
