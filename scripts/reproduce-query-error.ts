const Module = require("module")
const origRequire = Module.prototype.require
Module.prototype.require = function (id: string) {
  if (id === "server-only") return {}
  return origRequire.apply(this, arguments)
}

async function main() {
  const { replayAnalysisEvents } = await import("../lib/events/repository")
  const analysisId = "5fcdf5a6-7470-40a0-9bab-6059c6aec972"
  try {
    const result = await replayAnalysisEvents(analysisId, 0n)
    console.log("Result:", result)
  } catch (err: any) {
    console.error("Caught error:", err)
    console.error("Cause message:", err.cause?.message)
    console.error("Cause stack:", err.cause?.stack)
    console.error("Cause code:", err.cause?.code)
    console.error("Detail:", err.detail || err.cause?.detail)
    console.error("Hint:", err.hint || err.cause?.hint)
    console.error("Cause props:", Object.getOwnPropertyNames(err.cause || {}))
    console.error("Err props:", Object.getOwnPropertyNames(err))
  }
  process.exit(0)
}

main()
export {}
