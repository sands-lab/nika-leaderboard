import { expect, test } from '@playwright/test'
import path from 'node:path'

const pages = [
  { name: 'leaderboard', path: '/' },
  { name: 'insights', path: '/analytics/insights' },
  { name: 'compare', path: '/analytics/compare' },
  { name: 'matrix', path: '/analytics/matrix' },
  { name: 'confusion', path: '/analytics/confusion' },
  { name: 'analyze', path: '/analytics/analyze' },
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
