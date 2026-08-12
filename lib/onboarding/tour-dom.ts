import type { DriveStep } from "driver.js"

export function requiredTourSelectors(steps: DriveStep[]): string[] {
  return [
    ...new Set(steps.flatMap((step) => (typeof step.element === "string" ? [step.element] : []))),
  ]
}

export function tourTargetsExist(selectors: readonly string[]): boolean {
  return selectors.every((selector) => document.querySelector(selector))
}

export function waitForTourTargets(
  selectors: readonly string[],
  signal: AbortSignal,
): Promise<boolean> {
  if (tourTargetsExist(selectors)) return Promise.resolve(true)
  return new Promise((resolve) => {
    const finish = (ready: boolean) => {
      observer.disconnect()
      signal.removeEventListener("abort", abort)
      resolve(ready)
    }
    const abort = () => finish(false)
    const observer = new MutationObserver(() => {
      if (tourTargetsExist(selectors)) finish(true)
    })
    signal.addEventListener("abort", abort, { once: true })
    observer.observe(document.documentElement, { childList: true, subtree: true })
    if (signal.aborted) finish(false)
  })
}
