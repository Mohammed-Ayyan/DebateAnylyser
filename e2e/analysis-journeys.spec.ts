import path from "node:path"
import { expect, test } from "@playwright/test"
import { analysisFixture, IDS, mockApi, sourceFixture } from "./fixtures/api"

const fixtureFile = path.resolve("e2e/fixtures/authorized-transcript.txt")
const chooseAuthorization = (page: import("@playwright/test").Page) =>
  page.getByLabel("Rights Basis").selectOption("permission")

test("new analysis validates and submits upload, paste, and HTTPS inputs", async ({ page }) => {
  await mockApi(page)
  await page.goto("/new-analysis")
  await page.locator('input[type="file"]').setInputFiles(fixtureFile)
  await chooseAuthorization(page)
  await expect(page.getByText(/FILE SELECTED/i)).toBeVisible()
  await page.getByRole("button", { name: /Launch Debate Analysis Pipeline/i }).click()
  await expect(page).toHaveURL(new RegExp(`/processing\\?analysis=${IDS.analysis}`))

  await page.goto("/new-analysis")
  await page.getByRole("tab", { name: /Paste Transcript/i }).click()
  await page
    .getByPlaceholder(/Paste authorized debate transcript/i)
    .fill("Moderator: The municipal pilot expanded evening bus service.")
  await chooseAuthorization(page)
  await page.getByRole("button", { name: /Launch Debate Analysis Pipeline/i }).click()
  await expect(page).toHaveURL(new RegExp(`/processing\\?analysis=${IDS.analysis}`))

  await page.goto("/new-analysis")
  await page.getByRole("tab", { name: /Import URL/i }).click()
  await page.getByLabel("Approved Public Source URL").fill("http://records.example.test/session")
  await page.getByLabel("Retrieval method").selectOption("official_api")
  await page.getByLabel("Access Classification").selectOption("public")
  await chooseAuthorization(page)
  await expect(page.getByText(/valid HTTPS source URL/i)).toBeVisible()
  await page.getByLabel("Approved Public Source URL").fill("https://records.example.test/session")
  await page.getByRole("button", { name: /Launch Debate Analysis Pipeline/i }).click()
  await expect(page).toHaveURL(new RegExp(`/processing\\?analysis=${IDS.analysis}`))
})

test("processing reconciles durable API state", async ({ page }) => {
  await mockApi(page)
  await page.goto(`/processing?analysis=${IDS.analysis}`)
  await expect(page.getByText("PIPELINE PROGRESS")).toBeVisible()
  await expect(page.getByText(/11 \/ 11 STAGES RESOLVED/i)).toBeVisible()
  await expect(page.getByRole("button", { name: /Open assembled workspace/i })).toBeVisible()
  await expect(page.getByRole("button", { name: /Open report/i })).toBeVisible()
})

test("workspace connects transcript, findings, evidence, sources, and timeline", async ({
  page,
}) => {
  await mockApi(page)
  await page.goto(`/workspace?analysis=${IDS.analysis}`)
  await expect(page.getByText(analysisFixture.title)).toBeVisible()
  await expect(page.getByText(analysisFixture.findings[0].text).first()).toBeVisible()
  await expect(page.getByText(sourceFixture.retrieved_snippet)).toBeVisible()
  await page.getByRole("tab", { name: "sources", exact: true }).click()
  await expect(page.getByText("Municipal transport schedule archive")).toBeVisible()
  await page.getByRole("tab", { name: "timeline", exact: true }).click()
  await expect(page.getByLabel("Finding timeline")).toBeVisible()
  await page.getByRole("button", { name: /Open finding inspector/i }).click()
  await expect(page.getByText("[FINDING INSPECTOR]", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: /Close finding inspector/i }).click()
})

test("source explorer and timeline use traceable API fixtures", async ({ page }) => {
  await mockApi(page)
  await page.goto(`/source-explorer?analysis=${IDS.analysis}&finding=${IDS.claim}`)
  await expect(
    page.getByRole("heading", { level: 1, name: /Verified Source Explorer/i }),
  ).toBeVisible()
  await expect(page.getByText(sourceFixture.retrieved_snippet)).toBeVisible()
  await page.getByRole("searchbox", { name: /Search verified sources/i }).fill("transport")
  await expect(page.getByRole("link", { name: /View Source/i })).toBeVisible()
  await page.goto(`/timeline?analysis=${IDS.analysis}`)
  await expect(
    page.getByRole("heading", { level: 1, name: /Interactive Debate Timeline/i }),
  ).toBeVisible()
  await expect(page.getByRole("link", { name: /Open claim finding/i })).toBeVisible()
})

test("report renders and exports controlled HTML only", async ({ page }) => {
  await mockApi(page)
  await page.goto(`/reports?analysis=${IDS.analysis}`)
  await expect(page.getByRole("heading", { level: 1, name: /Evidence-Aware/i })).toBeVisible()
  await expect(page.getByText(analysisFixture.title)).toBeVisible()
  await expect(page.getByRole("button", { name: /PRINT \/ SAVE AS PDF/i })).toBeEnabled()
  const downloadPromise = page.waitForEvent("download")
  await page.getByRole("button", { name: /Download HTML/i }).click()
  expect((await downloadPromise).suggestedFilename()).toBe("analysis-report.html")
})

test("history filters and opens stored analysis", async ({ page }) => {
  await mockApi(page)
  await page.goto("/history")
  await expect(page.getByRole("heading", { level: 1, name: /Analysis Library/i })).toBeVisible()
  await page.getByRole("searchbox", { name: /Search analyses/i }).fill("Municipal")
  await expect(page.getByRole("link", { name: "OPEN" })).toHaveAttribute(
    "href",
    `/workspace?analysis=${IDS.analysis}`,
  )
})
