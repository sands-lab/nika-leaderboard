import { expect, test } from '@playwright/test'
import path from 'node:path'

// Routes live after the hash. Addressing them by path instead would still
// load the app - the dev server serves index.html for anything - but every
// case would land on the leaderboard, and five of the six would silently stop
// testing the page they name.
const pages = [
  { name: 'leaderboard', path: '/#/' },
  { name: 'insights', path: '/#/analytics/insights' },
  { name: 'compare', path: '/#/analytics/compare' },
  { name: 'matrix', path: '/#/analytics/matrix' },
  { name: 'confusion', path: '/#/analytics/confusion' },
  { name: 'analyze', path: '/#/analytics/analyze' },
  {
    name: 'entry',
    path: '/#/entry/0.2.0/20261007_qwen3_6_35b_a3b_claudecode',
  },
] as const

test.describe('viewport smoke', () => {
  for (const pageInfo of pages) {
    test(`${pageInfo.name} loads and screenshots`, async ({ page }, testInfo) => {
      const pageErrors: string[] = []
      page.on('pageerror', (err) => pageErrors.push(String(err)))

      // Vite HMR keeps connections open; avoid networkidle.
      await page.goto(pageInfo.path, { waitUntil: 'domcontentloaded' })
      await expect(page.getByRole('navigation').first()).toBeVisible()
      await expect(page.locator('main')).toBeVisible()
      // Data fetch finished (filters appear) or an explicit error is shown.
      await expect(
        page.locator('main .page, main .analytics-page, main .muted, main .error, main p').first(),
      ).toBeVisible({ timeout: 30_000 })

      const shotDir = path.join('e2e', 'screenshots')
      const file = path.join(
        shotDir,
        `${pageInfo.name}__${testInfo.project.name}.png`,
      )
      await page.screenshot({ path: file, fullPage: true })

      expect(
        pageErrors,
        `Unexpected page errors on ${pageInfo.path}:\n${pageErrors.join('\n')}`,
      ).toEqual([])
    })
  }
})

test('clicking a leaderboard row opens its entry page and back returns', async ({
  page,
}) => {
  await page.goto('/#/', { waitUntil: 'domcontentloaded' })
  const row = page.locator('tr.entry-row').first()
  await expect(row).toBeVisible({ timeout: 30_000 })
  const model = (await row.locator('.model-name').innerText()).trim()
  // Click the rank cell, not the model link, to exercise the row handler.
  await row.locator('td').first().click()
  await expect(page).toHaveURL(/#\/entry\/[^/]+\/[^/]+/)
  await expect(page.getByRole('heading', { level: 1 })).toContainText(model)
  await expect(page.getByRole('heading', { name: 'Run' })).toBeVisible()
  await page.getByRole('link', { name: '← Leaderboard' }).click()
  await expect(page.locator('tr.entry-row').first()).toBeVisible()
})
