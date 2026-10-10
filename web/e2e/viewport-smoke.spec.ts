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

test('model metadata and generated entry labels reach the leaderboard', async ({ page }) => {
  await page.goto('/#/', { waitUntil: 'domcontentloaded' })
  const response = await page.request.get('/data/index.json')
  const { submissions } = await response.json()
  const names = submissions.map((s: { name: string }) => s.name)
  expect(new Set(names).size).toBe(names.length)
  expect(names).toContain('Qwen3.5-27B · ReAct · GEPA (d)')
  expect(names).toContain('Qwen3.5-27B · ReAct · GEPA (d+s)')
  const reactEntry = submissions.find((s: { agent_type: string }) => s.agent_type === 'byo.langgraph')
  expect(reactEntry.framework).toBe('ReAct')
  expect(reactEntry.name).toBe(`${reactEntry.model} · ReAct`)
  await expect(page.locator('tr.entry-row').filter({ hasText: 'ReAct' })).toContainText(reactEntry.model)

  for (const [model, date, modelUrl] of [
    ['Qwen3.8-27B-FP8', '2026-08-13', 'https://huggingface.co/Qwen/Qwen3.8-27B-FP8'],
    ['OTel-2.0-LLM-31B-IT', '2026-07-23', 'https://huggingface.co/farbodtavakkoli/OTel-2.0-LLM-31B-IT'],
  ]) {
    const entry = submissions.find((s: { model: string }) => s.model === model)
    expect(entry.name).toBe(`${model} · Claude Code`)
    expect(entry.submission_name).toBeTruthy()
    const row = page.locator('tr.entry-row').filter({ hasText: model })
    await expect(row).toContainText('Claude Code')
    await expect(row).toContainText(date)
    await expect(row.locator('span[title*="One run ="]')).toContainText('$')
    if (model.startsWith('OTel')) {
      // The compact table hides its Provider column on smaller viewports.
      await expect(row.getByRole('img', { name: 'AT&T', includeHidden: true }))
        .toHaveAttribute('src', /providers\/att\.svg$/)
    }
    await row.locator('td').first().click()
    await expect(page.locator('.lede')).toContainText(entry.name)
    for (const label of ['Trajectories on Hugging Face', 'Model page']) {
      await expect(page.getByRole('link', { name: label, exact: true }).first()).toBeVisible()
    }
    for (const label of ['Code on GitHub', 'Paper / report', 'Project site']) {
      await expect(page.getByRole('link', { name: label, exact: true })).toHaveCount(0)
    }
    await expect(page.locator('h1 a')).toHaveAttribute('href', modelUrl)
    if (model.startsWith('OTel')) {
      const provider = page.getByRole('img', { name: 'AT&T' }).first()
      await provider.scrollIntoViewIfNeeded()
      await expect(provider).toBeVisible()
      await expect.poll(() => provider.evaluate((img) => (img as HTMLImageElement).naturalWidth))
        .toBeGreaterThan(0)
      const setting = page.locator('.entry-facts__row')
        .filter({ has: page.getByText('Serving tensor parallel size', { exact: true }) })
      await expect(setting.locator('dd')).toHaveText('4')
      await expect(page.locator('dt').filter({ hasText: /Retry policy|retry_policy/ })).toHaveCount(0)
      const labelBox = await setting.locator('dt').boundingBox()
      const valueBox = await setting.locator('dd').boundingBox()
      expect(labelBox!.x + labelBox!.width).toBeLessThanOrEqual(valueBox!.x)
    }
    await expect(page.locator('main')).toContainText(entry.submission_name)
    await page.getByRole('link', { name: '← Leaderboard' }).click()
  }
})
