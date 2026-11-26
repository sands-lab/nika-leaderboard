import { expect, test, type Page } from '@playwright/test'

// Long names, as entries with a reasoning effort get, set the Model column's
// width. Give the first rows such names so the check does not depend on which
// entries the committed data happens to hold.
const LONG_NAMES = [
  ['Deepseek V4 Pro 0813', 'medium'],
  ['Gemma 4 31B IT FP8 Dynamic', 'medium'],
  ['Qwen3.8-27B-FP8', 'medium'],
] as const

async function openWithLongNames(page: Page) {
  await page.route('**/data/index.json', async (route) => {
    const response = await route.fetch()
    const data = await response.json()
    // The page opens on the latest release, so rename entries from it.
    const versions: string[] = data.submissions.map((s: { benchmark_version: string }) => s.benchmark_version)
    const latest = versions.sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).at(-1)
    const shown = data.submissions.filter((s: { benchmark_version: string }) => s.benchmark_version === latest)
    LONG_NAMES.forEach(([model, effort], i) => {
      Object.assign(shown[i], { model, reasoning_effort: effort })
    })
    await route.fulfill({ response, json: data })
  })
  await page.goto('/#/', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('tr.entry-row').first()).toBeVisible({ timeout: 30_000 })
  for (const [model, effort] of LONG_NAMES) {
    await expect(page.locator('.model-name', { hasText: `${model} (${effort})` }).first()).toBeVisible()
  }
  await page.evaluate(() => document.fonts.ready)
}

/** Header cells laid out on screen, with whether each lies within the table's visible box. */
function measure(page: Page) {
  return page.evaluate(() => {
    const wrap = document.querySelector('.table-wrap--entries')!
    const box = wrap.getBoundingClientRect()
    const right = Math.min(box.right, window.innerWidth)
    const cols = Array.from(document.querySelectorAll('.data-table--entries thead th'))
      .filter((th) => getComputedStyle(th).display !== 'none')
      .map((th) => {
        const r = th.getBoundingClientRect()
        return { label: th.textContent!.replace(/[▲▼⇅]/g, '').trim(), width: r.width, inView: r.right <= right + 0.5 }
      })
    const names = Array.from(document.querySelectorAll<HTMLElement>('.data-table--entries .model-name'))
    return {
      cols,
      clippedNames: names.filter((n) => n.scrollWidth > n.clientWidth + 1).map((n) => n.textContent),
      nameHeights: names.map((n) => n.getBoundingClientRect().height),
      lineHeight: parseFloat(getComputedStyle(names[0]).lineHeight),
    }
  })
}

test('phones show a score beside long model names without scrolling', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'phone widths only')
  await openWithLongNames(page)
  for (const width of [375, 390, 430]) {
    await page.setViewportSize({ width, height: 844 })
    const m = await measure(page)
    const model = m.cols.find((c) => c.label === 'Model')!
    const rca = m.cols.find((c) => c.label === 'RCA')!
    // The pinned Model column leaves room for the scores...
    expect(model.width, `Model column at ${width}px`).toBeLessThanOrEqual(width * 0.5)
    // ...so the ranking score is in view before any sideways swipe.
    expect(rca.inView, `RCA column at ${width}px`).toBe(true)
    // Long names wrap in full rather than being cut off.
    expect(m.clippedNames).toEqual([])
    expect(Math.max(...m.nameHeights)).toBeGreaterThan(m.lineHeight * 1.5)
  }
})

test('desktop keeps model names on one line', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop widths only')
  await openWithLongNames(page)
  for (const width of [1280, 1920]) {
    await page.setViewportSize({ width, height: 900 })
    const m = await measure(page)
    expect(m.cols.every((c) => c.inView), `all columns in view at ${width}px`).toBe(true)
    expect(m.clippedNames).toEqual([])
    expect(Math.max(...m.nameHeights)).toBeLessThan(m.lineHeight * 1.5)
  }
})
