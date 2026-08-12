import { expect, test } from "@playwright/test"
import { IDS, mockApi } from "./fixtures/api"

test("settings persist preferences and expose privacy controls", async ({ page }) => {
  await mockApi(page)
  await page.goto("/settings")
  await expect(
    page.getByRole("heading", { level: 1, name: /Account & Analysis Settings/i }),
  ).toBeVisible()
  await expect(page.getByLabel("EMAIL ADDRESS")).toHaveValue("researcher@example.test")
  await page.getByRole("tab", { name: /Reading Preferences/i }).click()
  await page.getByRole("combobox").selectOption("low_density")
  await page.getByLabel("Reduce non-essential motion").uncheck()
  await page.getByRole("button", { name: /Save Preferences/i }).click()
  await expect(page.getByText("PREFERENCES SAVED")).toBeVisible()
  await page.getByRole("tab", { name: /Account & Security/i }).click()
  await page.getByLabel("New Analysis Retention").selectOption("30d")
  await expect(page.getByText("PREFERENCES SAVED")).toBeVisible()
  await page.goto("/legal#privacy")
  await expect(page.getByRole("heading", { name: /Privacy and third-party data/i })).toBeVisible()
})

test("live debate reports real readiness and unavailable backend state", async ({ page }) => {
  await mockApi(page)
  await page.goto("/live-debate")
  await expect(page.getByRole("heading", { level: 1, name: "Live Debate" })).toBeVisible()
  await expect(page.getByText("Live processing unavailable")).toBeVisible()
  await expect(
    page.getByRole("button", { name: /Start live session — unavailable/i }),
  ).toBeDisabled()
  await expect(page.getByText(/never invents a transcript/i)).toBeVisible()
})

test("empty history and evidence states remain explicit", async ({ page }) => {
  await mockApi(page, { history: "empty", evidence: "empty" })
  await page.goto("/history")
  await expect(page.getByText("Your analysis library is empty")).toBeVisible()
  await page.goto(`/source-explorer?analysis=${IDS.analysis}&finding=${IDS.claim}`)
  await expect(page.getByText(/Unverified — no reliable source found/i)).toBeVisible()
})

test("rights rejection is rendered from an intercepted API response", async ({ page }) => {
  await mockApi(page, { submission: "rights-blocked" })
  await page.goto("/new-analysis")
  await page.getByRole("tab", { name: /Paste Transcript/i }).click()
  await page
    .getByPlaceholder(/Paste authorized debate transcript/i)
    .fill("Moderator: The municipal pilot expanded evening bus service.")
  await page.getByLabel("Rights Basis").selectOption("permission")
  await page.getByRole("button", { name: /Launch Debate Analysis Pipeline/i }).click()
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "This source cannot be queued under the selected authorization." }),
  ).toBeVisible()
})

test("API failure, access denied, offline, and not-found states are reachable", async ({
  page,
}) => {
  await mockApi(page, { analysis: "error" })
  await page.goto(`/workspace?analysis=${IDS.analysis}`)
  await expect(page.getByText("The assembled analysis is unavailable.")).toBeVisible()
  await page.goto("/403")
  await expect(page.getByRole("heading", { name: /Restricted Discourse Workspace/i })).toBeVisible()
  await page.goto("/offline")
  await expect(page.getByRole("heading", { name: /Network Disconnected/i })).toBeVisible()
  await page.goto("/route-that-does-not-exist")
  await expect(page.getByRole("heading", { name: /Page Not Found In Corpus/i })).toBeVisible()
})
