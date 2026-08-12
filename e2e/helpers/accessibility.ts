import { expect, type Page } from "@playwright/test"

let axePath: string | undefined
try {
  axePath = require.resolve("axe-core/axe.min.js")
} catch {
  axePath = undefined
}

type AxeResult = {
  violations: Array<{
    id: string
    impact: string | null
    nodes: Array<{ target: string[] }>
  }>
}

export async function checkBasicAccessibility(page: Page) {
  const heading = page.locator("h1, h2").first()
  await expect(heading).toBeVisible()

  const mainCount = await page.locator("main, [role='main']").count()
  if (mainCount === 0) {
    await expect(page.locator("header").first()).toBeVisible()
    await expect(page.locator("footer").first()).toBeVisible()
  }

  await page.keyboard.press("Tab")
  const focusedTag = await page.evaluate(() => document.activeElement?.tagName ?? "")
  expect(["A", "BUTTON", "INPUT", "SELECT", "TEXTAREA"]).toContain(focusedTag)

  if (!axePath) return
  await page.addScriptTag({ path: axePath })
  const result = await page.evaluate(async () => {
    const axe = (
      window as unknown as {
        axe: { run: (root: Element, options: object) => Promise<AxeResult> }
      }
    ).axe
    const root = document.querySelector("main") ?? document.body
    return axe.run(root, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] },
      resultTypes: ["violations"],
    })
  })
  const serious = result.violations.filter(
    (violation) => violation.impact === "serious" || violation.impact === "critical",
  )
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([])
}
