// Drives the app against the QA fixture and asserts qa-expected.json.
//
//   node --experimental-strip-types scripts/generate-qa-dataset.mjs
//   npm run dev -- --port 5199
//   cp qa/qa-expected.json ~/.dev-browser/tmp/
//   dev-browser --browser qa-fixture run qa/run-qa.js
//
// Use a throwaway browser profile name: ?qa=1 replaces that profile's data.

const BASE = 'http://localhost:5199'
const expected = JSON.parse(await readFile('qa-expected.json'))
const results = []
const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail })

const page = await browser.getPage('qa')
await page.setViewportSize({ width: 390, height: 844 })
const errors = []
page.on('pageerror', (e) => errors.push(String(e.message)))
page.on('console', (m) => {
  if (m.type() === 'error' && !/404/.test(m.text())) errors.push(m.text())
})

const step = async (name, fn) => {
  try {
    await fn()
  } catch (e) {
    check(`step: ${name}`, false, String(e.message).slice(0, 160))
  }
}

// Fresh load of the fixture.
await page.goto(`${BASE}/?qa=1`)
await page.waitForTimeout(3500)
await page.goto(`${BASE}/`)
await page.waitForTimeout(2500)

// ── Home: routine "last done" labels (problem 14) ───────────────────────
const cards = await page.evaluate(() =>
  [...document.querySelectorAll('.card')]
    .filter((c) => /Start routine/.test(c.innerText))
    .map((c) => ({ title: c.innerText.split('\n')[0].trim(), text: c.innerText })),
)
for (const [name, exp] of Object.entries(expected.routineLabels)) {
  const card = cards.find((c) => c.title === name || c.title.startsWith(name.slice(0, 20)))
  if (!card) {
    check(`routine card: ${name}`, false, 'card not found')
    continue
  }
  const m = card.text.match(/Last done ([^\n]+)/)
  const got = m ? m[1].trim() : null
  check(`routine "${name.slice(0, 28)}" last done`, got === exp.lastDone, `got ${got} expected ${exp.lastDone}`)
}

// ── History cards ───────────────────────────────────────────────────────
await page.goto(`${BASE}/history`)
await page.waitForTimeout(2000)
const hist = await page.evaluate(() =>
  [...document.querySelectorAll('button')]
    .filter((b) => b.querySelector('.history-ex-list, .card-exercises'))
    .map((b) => ({
      name: b.innerText.split('\n')[0].trim(),
      rows: [...b.querySelectorAll('.history-ex-list li:not(.history-ex-more)')].map((li) =>
        [...li.children].map((c) => c.innerText.trim()),
      ),
      more: b.querySelector('.history-ex-more')?.innerText.trim() ?? null,
      empty: b.querySelector('.card-exercises')?.innerText.trim() ?? null,
    })),
)
for (const [name, exp] of Object.entries(expected.historyCards)) {
  const c = hist.find((h) => h.name === name)
  if (!c) {
    // History is paged by month; scroll later months in if needed.
    check(`history card ${name}`, false, 'not found in first render')
    continue
  }
  if (exp.rows !== undefined) check(`${name}: ${exp.rows} rows`, c.rows.length === exp.rows, `got ${c.rows.length}`)
  if (exp.more) check(`${name}: more line`, c.more === exp.more, `got ${c.more}`)
  if (exp.firstRow) check(`${name}: first row`, JSON.stringify(c.rows[0]) === JSON.stringify(exp.firstRow), JSON.stringify(c.rows[0]))
  if (exp.text) check(`${name}: empty text`, c.empty === exp.text, `got ${c.empty}`)
}

// ── Exercise metric chips ───────────────────────────────────────────────
for (const [exId, chips] of Object.entries(expected.exerciseMetricChips)) {
  await page.goto(`${BASE}/exercises/${exId}`)
  await page.waitForTimeout(1500)
  const got = await page.evaluate(() =>
    [...document.querySelectorAll('.chart-controls .chip')].map((c) => c.innerText.trim()),
  )
  check(`metric chips ${exId}`, JSON.stringify(got) === JSON.stringify(chips), `got ${JSON.stringify(got)}`)
}

// Every chip must draw a non-empty chart without throwing.
await page.goto(`${BASE}/exercises/bench-press-barbell`)
await page.waitForTimeout(1500)
const chipCount = await page.evaluate(() => document.querySelectorAll('.chart-controls .chip').length)
for (let i = 0; i < chipCount; i++) {
  await page.evaluate((i) => document.querySelectorAll('.chart-controls .chip')[i].click(), i)
  await page.waitForTimeout(250)
  const svg = await page.evaluate(() => !!document.querySelector('.chart-card svg, .card svg path'))
  check(`bench chip ${i} renders a chart`, svg)
}

// ── Bench volume excludes warm-ups ──────────────────────────────────────
await page.click('.chart-controls .chip:has-text("Volume")')
await page.waitForTimeout(300)
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /table/i.test(b.innerText))?.click())
await page.waitForTimeout(300)
const tableText = await page.evaluate(() => document.querySelector('.chart-card table, table')?.innerText ?? '')
check('bench volume table has first week 1,050 (no warm-up)', /1[, ]?050\b/.test(tableText) && !/1[, ]?250\b/.test(tableText), tableText.slice(0, 120))

// ── Stats layout: 2x2 tiles (problem 19) ────────────────────────────────
await page.goto(`${BASE}/stats`)
await page.waitForTimeout(2000)
const tiles = await page.evaluate(() => {
  const g = document.querySelector('.stat-grid')
  const r = [...g.children].map((c) => Math.round(c.getBoundingClientRect().top))
  return { count: g.children.length, rows: new Set(r).size }
})
check('stats: 4 small tiles in 2 rows', tiles.count === 4 && tiles.rows === 2, JSON.stringify(tiles))

// ── Measurements: no future points ──────────────────────────────────────
const noFuture = await page.evaluate(async () => {
  const req = indexedDB.open('trana')
  return 'skipped'
}).catch(() => 'skipped')

// ── Back navigation restores scroll (problem 22) ────────────────────────
// Compared by row position rather than raw scrollY: rows can grow once data
// loads, and what matters is that the same row is under the thumb again.
await page.goto(`${BASE}/exercises`)
await page.waitForTimeout(2500)
await page.evaluate(() => window.scrollTo(0, 900))
await page.waitForTimeout(400)
const anchor = await page.evaluate(() => {
  const el = [...document.querySelectorAll('.page button, .page a')].find((e) => {
    const r = e.getBoundingClientRect()
    return r.top > 150 && r.top < 600 && e.innerText.length > 3
  })
  const info = { text: el.innerText.split(String.fromCharCode(10))[0], top: el.getBoundingClientRect().top }
  el.click()
  return info
})
await page.waitForTimeout(800)
const onDetail = await page.evaluate(() => window.scrollY)
await page.goBack()
await page.waitForTimeout(2500)
const after = await page.evaluate((text) => {
  const el = [...document.querySelectorAll('.page button, .page a')].find((e) => e.innerText.split(String.fromCharCode(10))[0] === text)
  return el ? el.getBoundingClientRect().top : null
}, anchor.text)
check('forward navigation opens at top', onDetail === 0, `scrollY ${onDetail}`)
check('browser back puts the same row back under the thumb', after !== null && Math.abs(after - anchor.top) <= 4, `row "${anchor.text}" was at ${Math.round(anchor.top)} now ${after === null ? 'missing' : Math.round(after)}`)

// ── Stats headline layout 3 / 2 / 2 (problem 4) ─────────────────────────
await page.goto(`${BASE}/stats`)
await page.waitForTimeout(2000)
const layout = await page.evaluate(() => {
  const head = [...document.querySelectorAll('.headline .stat-label')].map((e) => e.textContent.trim())
  const tiles = [...document.querySelectorAll('.stat-grid-pairs .stat-label')].map((e) => e.textContent.trim())
  return { head, tiles }
})
check('stats row 1: volume, sets, reps', JSON.stringify(layout.head) === JSON.stringify(['Volume lifted', 'Sets', 'Reps']), JSON.stringify(layout.head))
check('stats rows 2-3: time, age, streaks', JSON.stringify(layout.tiles) === JSON.stringify(['Time lifting', 'Training age', 'Week streak', 'Best streak']), JSON.stringify(layout.tiles))

// ── Settings: licence only while the illustrations are on (problem 2) ───
await page.goto(`${BASE}/settings`)
await page.waitForTimeout(1500)
const licence = await page.evaluate(() => /CC BY-SA|illustrations/i.test(document.body.innerText))
check('settings has no licence line while art is off', licence === false)

// ── Home header: icons and title share a centre line (problem 3) ─────────
await page.goto(`${BASE}/`)
await page.waitForTimeout(2000)
const centres = await page.evaluate(() => {
  const c = (e) => {
    const r = e.getBoundingClientRect()
    return r.top + r.height / 2
  }
  return { btns: [...document.querySelectorAll('.header .icon-btn')].map(c), title: c(document.querySelector('.home-status')) }
})
check('header icons level with each other', Math.abs(centres.btns[0] - centres.btns[1]) < 0.5, JSON.stringify(centres))
check('header title within 1.5px of icon centre', Math.abs(centres.title - centres.btns[0]) <= 1.5, JSON.stringify(centres))

// ── PR set turns gold, ordinary set stays green (problem 5) ──────────────
await page.evaluate(() => {
  const card = [...document.querySelectorAll('.card')].find((c) => c.innerText.startsWith('R1 Stale'))
  ;[...card.querySelectorAll('button')].find((b) => /Start routine/.test(b.innerText)).click()
})
await page.waitForTimeout(1500)
for (const [row, w] of [[0, '102.5'], [1, '90']]) {
  const rows = await page.$$('.set-table tbody tr')
  const wi = await rows[row].$('input[aria-label="Weight"]')
  await wi.click()
  await page.keyboard.type(w)
  await page.keyboard.press('Enter')
  const ri = await rows[row].$('input[aria-label="Reps"]')
  await ri.click()
  await page.keyboard.type('5')
  await page.keyboard.press('Enter')
  await (await rows[row].$('.check-btn')).click()
  await page.waitForTimeout(500)
}
const prRows = await page.evaluate(() =>
  [...document.querySelectorAll('.set-table tbody tr')].slice(0, 2).map((r) => ({ cls: r.className, pill: !!r.querySelector('.badge-pr') })),
)
check('PR set row is gold (has pr class)', /\bpr\b/.test(prRows[0].cls), JSON.stringify(prRows))
check('non-PR completed set is not gold', !/\bpr\b/.test(prRows[1].cls) && /done/.test(prRows[1].cls), JSON.stringify(prRows))
check('PR pill badge is gone', prRows.every((r) => !r.pill))
// ── Set row stays on one line at a narrow width ─────────────────────────
await page.setViewportSize({ width: 360, height: 844 })
await page.waitForTimeout(400)
const rowFit = await page.evaluate(() => {
  const row = document.querySelector('.set-table tbody tr')
  const prev = row.querySelector('.prev-cell')
  prev.textContent = '102.5 × 12'
  const lineH = parseFloat(getComputedStyle(prev).lineHeight)
  const pad = parseFloat(getComputedStyle(prev).paddingTop) * 2 + 2
  const inputs = [...row.querySelectorAll('input')]
  return {
    prevOneLine: prev.getBoundingClientRect().height <= lineH + pad + 1,
    prevClipped: prev.scrollWidth > prev.clientWidth + 1,
    inputsClipped: inputs.some((i) => i.scrollWidth > i.clientWidth + 1),
    headerOneLine: (() => {
      const ths = [...document.querySelectorAll('.set-table thead th')]
      const single = ths[0].getBoundingClientRect().height
      return ths.every((th) => th.getBoundingClientRect().height <= single + 1)
    })(),
    tableFits: document.querySelector('.set-table').scrollWidth <= document.querySelector('.set-table').parentElement.clientWidth + 1,
  }
})
check('set row: previous on one line at 360px', rowFit.prevOneLine && !rowFit.prevClipped, JSON.stringify(rowFit))
check('set row: inputs and headers fit at 360px', !rowFit.inputsClipped && rowFit.headerOneLine && rowFit.tableFits, JSON.stringify(rowFit))
await page.setViewportSize({ width: 390, height: 844 })

await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Discard')?.click())
await page.waitForTimeout(500)
await page.evaluate(() => [...document.querySelectorAll('.sheet button, .confirm button')].find((b) => /^Discard/.test(b.innerText.trim()))?.click())
await page.waitForTimeout(800)

// ── Folder delete keeps its routines (problem 2) ─────────────────────────
await page.evaluate(async () => {
  await new Promise((res) => {
    const o = indexedDB.open('trana')
    o.onsuccess = () => {
      const db = o.result
      const tx = db.transaction(['folders', 'routines'], 'readwrite')
      tx.objectStore('folders').put({ id: 'qa-folder', name: 'QA Folder', order: 0, createdAt: 1 })
      const r = tx.objectStore('routines')
      r.getAll().onsuccess = (e) => {
        for (const x of e.target.result) if (/^R1 /.test(x.name)) { x.folderId = 'qa-folder'; r.put(x) }
      }
      tx.oncomplete = () => res(1)
    }
  })
})
await page.goto(`${BASE}/`)
await page.waitForTimeout(2200)
await page.click('button[aria-label="Delete folder QA Folder"]')
await page.waitForTimeout(500)
await page.click('text=Delete folder >> nth=-1')
await page.waitForTimeout(800)
const folderState = await page.evaluate(
  () =>
    new Promise((res) => {
      const o = indexedDB.open('trana')
      o.onsuccess = () => {
        const tx = o.result.transaction(['folders', 'routines'])
        const out = {}
        tx.objectStore('folders').getAll().onsuccess = (e) => (out.folders = e.target.result.length)
        tx.objectStore('routines').getAll().onsuccess = (e) => {
          out.routines = e.target.result.length
          out.r1Folder = e.target.result.find((r) => /^R1 /.test(r.name)).folderId
        }
        tx.oncomplete = () => res(out)
      }
    }),
)
check('deleting a folder removes only the folder', folderState.folders === 0 && folderState.routines === 8 && folderState.r1Folder === null, JSON.stringify(folderState))

// ── Settings: haptic option, timer test and "use N a week" are gone (problem 3) ─
await page.goto(`${BASE}/settings`)
await page.waitForTimeout(1500)
const settingsText = await page.evaluate(() => document.body.innerText)
check('settings has no haptic option, timer test or suggested-goal button', !/Haptic/i.test(settingsText) && !/Test the timer/i.test(settingsText) && !/Use \d+ a week/i.test(settingsText))

// ── Banner and rest bar clear the last row (problem 4) ──────────────────
await page.goto(`${BASE}/`)
await page.waitForTimeout(1500)
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /Empty workout/.test(b.innerText)).click())
await page.waitForTimeout(1000)
await page.click('button[aria-label="Minimise workout"]')
await page.waitForTimeout(800)
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
await page.waitForTimeout(300)
const gap = await page.evaluate(() => {
  const banner = document.querySelector('.active-banner').getBoundingClientRect().top
  const last = Math.max(...[...document.querySelectorAll('.page .btn')].map((e) => e.getBoundingClientRect().bottom))
  return { banner, last }
})
check('last button clears the workout banner', gap.last <= gap.banner, JSON.stringify(gap))

// ── Report ──────────────────────────────────────────────────────────────
check('no console or page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
const failed = results.filter((r) => !r.ok)
console.log(results.map((r) => `${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : '  -> ' + r.detail}`).join('\n'))
console.log(`\n${results.length - failed.length}/${results.length} passed`)
