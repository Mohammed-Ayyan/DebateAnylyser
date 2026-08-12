import { expect, test } from "@playwright/test"
import { mockApi } from "./fixtures/api"
import { checkBasicAccessibility } from "./helpers/accessibility"

test("landing exposes honest primary journeys", async ({ page }) => {
  await mockApi(page)
  await page.goto("/")
  await expect(
    page.getByRole("heading", { level: 1, name: /Evidence Over Opinion/i }),
  ).toBeVisible()
  await expect(page.getByRole("link", { name: /Sign in/i })).toBeVisible()
  await expect(page.getByRole("link", { name: /Analyze discourse file/i })).toBeVisible()
  await expect(page.getByRole("link", { name: /Check live debate readiness/i })).toBeVisible()
  await checkBasicAccessibility(page)
})

test("onboarding skip persists and tour restarts from Help and Settings", async ({ page }) => {
  await mockApi(page)
  await page.goto("/auth/onboarding")
  await expect(page.getByRole("heading", { name: /Learn the workspace in context/i })).toBeVisible()
  await page.getByRole("button", { name: /Skip tour/i }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.locator(".driver-popover")).toHaveCount(0)
  await page.reload()
  await expect(page.locator(".driver-popover")).toHaveCount(0)
  await page.goto("/help")
  await page.getByRole("button", { name: /Start product tour/i }).click()
  await expect(page.getByText("Your command center", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: /Skip product tour/i }).click()
  await page.goto("/settings")
  await page.getByRole("button", { name: /Start product tour/i }).click()
  await expect(page.getByText("Your command center", { exact: true })).toBeVisible()
  for (let step = 0; step < 12; step += 1) {
    const advance = page.getByRole("button", { name: /^(Next|Finish)$/ })
    await expect(advance).toBeVisible()
    const finishesTour = (await advance.textContent())?.trim() === "Finish"
    await advance.click()
    if (finishesTour) break
  }
  await expect(page.locator(".driver-popover")).toHaveCount(0)
  await page.reload()
  await expect(page.locator(".driver-popover")).toHaveCount(0)
})

test("new empty accounts receive an accessible reduced-motion tour automatically", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await mockApi(page, { history: "empty" })
  await page.goto("/dashboard")
  await expect(page.getByText("Your command center", { exact: true })).toBeVisible()
  await page.keyboard.press("ArrowRight")
  await expect(page.locator(".driver-popover-title")).toHaveText(
    /Start (an analysis|with source material)/i,
  )
  await page.keyboard.press("Escape")
  await expect(page.locator(".driver-popover")).toHaveCount(0)
  await page.reload()
  await expect(page.locator(".driver-popover")).toHaveCount(0)
})

test("protected routes preserve return destinations and auth pages redirect active sessions", async ({
  page,
}) => {
  await page.goto("/history?status=complete")
  await expect(page).toHaveURL(/\/auth\/signin\?return_to=%2Fhistory%3Fstatus%3Dcomplete$/)
  const login = page.getByRole("link", { name: /Continue with Auth0/i })
  await expect(login).toHaveAttribute(
    "href",
    "/api/v1/auth/login?return_to=%2Fhistory%3Fstatus%3Dcomplete",
  )

  await mockApi(page)
  await page.goto("/auth/signin")
  await expect(page).toHaveURL(/\/dashboard$/)
})

test("dashboard exposes retained work and analysis entry points", async ({ page }) => {
  await mockApi(page)
  await page.goto("/dashboard")
  await expect(
    page.getByRole("heading", { level: 1, name: /Move from source to traceable analysis/i }),
  ).toBeVisible()
  await expect(page.getByText("Municipal Transit Pilot Discussion")).toBeVisible()
  const dashboardActions = page.locator('[data-tour="dashboard-actions"]')
  await expect(dashboardActions.getByRole("link", { name: /Live debate/i })).toBeVisible()
  await dashboardActions.getByRole("link", { name: /New analysis/i }).click()
  await expect(page).toHaveURL(/\/new-analysis$/)
})
