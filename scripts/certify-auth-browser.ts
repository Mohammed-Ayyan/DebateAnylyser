import { loadEnvFile } from "node:process"
import { chromium, expect } from "@playwright/test"

for (const path of [".env.local", ".env"]) {
  try {
    loadEnvFile(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }
}

const origin = process.env.APP_ORIGIN ?? "http://localhost:3000"
const required = ["AUTH_ISSUER", "AUTH_CLIENT_ID", "AUTH_CLIENT_SECRET", "SESSION_SECRET"]
for (const name of required) {
  if (!process.env[name]?.trim())
    throw new Error(`${name} is required for real auth certification.`)
}

async function assertProtected(page: import("@playwright/test").Page, path: string) {
  await page.goto(`${origin}${path}`)
  await expect(page).not.toHaveURL(/\/auth\/signin/)
  await expect(page.locator("body")).toBeVisible()
}

async function finishTour(page: import("@playwright/test").Page) {
  for (let step = 0; step < 16; step += 1) {
    const advance = page.getByRole("button", { name: /^(Next|Finish)$/ })
    await expect(advance).toBeVisible()
    const finished = (await advance.textContent())?.trim() === "Finish"
    await advance.click()
    if (finished) return
  }
  throw new Error("Product tour did not reach its Finish action.")
}

async function main() {
  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  console.log("A browser has opened. Complete authentication only in the Auth0 window.")
  await page.goto(`${origin}/auth/signin?return_to=/dashboard`)
  await page.getByRole("link", { name: /Continue with Auth0/i }).click()
  await page.waitForURL(`${origin}/dashboard`, { timeout: 300_000 })
  const session = (await context.cookies(origin)).find((cookie) => cookie.name === "debate_session")
  if (!session?.httpOnly) throw new Error("A secure HTTP-only application session was not issued.")
  await page.reload()
  await expect(page).toHaveURL(`${origin}/dashboard`)

  for (const path of ["/history", "/settings", "/new-analysis", "/help"]) {
    await assertProtected(page, path)
  }

  await page.goto(`${origin}/dashboard`)
  const history = await page.evaluate(async () => {
    const response = await fetch("/api/v1/analyses?limit=1", { credentials: "same-origin" })
    if (!response.ok) throw new Error(`History returned ${response.status}`)
    return (await response.json()) as { items?: unknown[] }
  })
  if ((history.items?.length ?? 0) === 0) {
    await expect(page.getByText("Your command center", { exact: true })).toBeVisible()
    await page.getByRole("button", { name: /Skip product tour/i }).click()
    await page.reload()
    await expect(page.locator(".driver-popover")).toHaveCount(0)
  } else {
    console.log("Automatic first-user tour skipped: this Auth0 account already has analyses.")
  }

  await page.goto(`${origin}/help`)
  await page.getByRole("button", { name: /Start product tour/i }).click()
  await expect(page).toHaveURL(`${origin}/dashboard`)
  await expect(page.getByText("Your command center", { exact: true })).toBeVisible()
  await finishTour(page)
  await page.reload()
  await expect(page.locator(".driver-popover")).toHaveCount(0)

  await page.setViewportSize({ width: 412, height: 915 })
  await page.goto(`${origin}/settings`)
  await page.getByRole("button", { name: /Start product tour/i }).click()
  await expect(page.getByText("Your command center", { exact: true })).toBeVisible()
  await page.keyboard.press("ArrowRight")
  await page.getByRole("button", { name: /Skip product tour/i }).click()

  await page.getByRole("link", { name: /Log out/i }).click()
  await page.waitForURL(`${origin}/`, { timeout: 60_000 })
  await page.goto(`${origin}/dashboard`)
  await expect(page).toHaveURL(/\/auth\/signin\?return_to=%2Fdashboard$/)
  await page.getByRole("link", { name: /Continue with Auth0/i }).click()
  await page.waitForURL(`${origin}/dashboard`, { timeout: 300_000 })
  await page.reload()
  await expect(page).toHaveURL(`${origin}/dashboard`)

  console.log("Real Auth0 browser certification passed.")
  await browser.close()
}

void main().catch((error: unknown) => {
  console.error("Real Auth0 browser certification failed.", error)
  process.exitCode = 1
})
