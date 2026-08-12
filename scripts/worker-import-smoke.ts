async function main(): Promise<void> {
  const [{ processNextAnalysisJob }, { processNextOperationJob }] = await Promise.all([
    import("../lib/analysis/worker"),
    import("../lib/operations/worker"),
  ])

  if (
    typeof processNextAnalysisJob !== "function" ||
    typeof processNextOperationJob !== "function"
  ) {
    throw new Error("Worker entry points did not import correctly.")
  }

  console.log("Analysis and M10 worker imports succeeded.")
}

void main().catch((error: unknown) => {
  console.error("Worker import smoke failed.", error)
  process.exitCode = 1
})
