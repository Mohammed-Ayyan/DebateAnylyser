import { getDatabase } from "../lib/db/client"
import { findings } from "../lib/db/schema/findings"
import { eq } from "drizzle-orm"

async function main() {
  const db = getDatabase()
  const analysisId = process.argv[2] || "cad6f1f0-2f65-44a8-be59-1128564e221f"
  const f = await db.select().from(findings).where(eq(findings.analysisId, analysisId))
  console.log(`=== FINDINGS FOR ${analysisId} (Total: ${f.length}) ===`)
  for (const item of f) {
    console.log(`[${item.producedByStage}] (${item.kind}, state=${item.state}, conf=${item.confidenceRaw}): ${item.text}`)
  }
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
