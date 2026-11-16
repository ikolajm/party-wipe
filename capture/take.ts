// What every capture shares: the browser, the pacing, the pointer and its drawn
// cursor, and the timeline each take writes to takes/<name>.timeline.json,
// beside OBS's recordings.
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium, type Locator, type Page } from 'playwright'

// Setup

// The production build, served from frontend/out/, so no dev tools reach the frame.
const SCREEN = 'http://localhost:3000'
export const VIEWPORT = { width: 1280, height: 720 }

// Pacing, in milliseconds

export const MOVE_MS = 650
const MOVE_STEP_MS = 16
const PRESS_MS = 90
const HOVER_MS = 200
const SCROLL_LIMIT = 1500
const HIT_LIMIT = 5000
// action: the beat after each click, before the pointer moves on.
// fade: one end of a walk, to black or back up: FADE_THROUGH_MS in FadeThrough.tsx.
// A page load is one end; a walk between rooms is both.
// beat: the game's pause after combat arrives, before turns start: ARRIVAL_BEAT_MS in FadeThrough.tsx.
export const HOLD = { action: 300, short: 1200, read: 2200, fade: 1500, beat: 1500 }

export const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// A take that cannot be used: the screen showed other than the captions say, or
// a control was not where the script expects it.
export class TakeError extends Error {}

export type Mark = (name: string) => void

// The drawn cursor

// Playwright's mouse is synthetic, so OBS records no OS cursor. This draws one
// that follows the page's own mouse events and dips on press.
const CURSOR = `
  addEventListener('DOMContentLoaded', () => {
    const cursor = document.createElement('div')
    cursor.setAttribute('aria-hidden', 'true')
    cursor.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 2 L4 19 L8.5 14.5 L11.5 21 L14.5 19.7 L11.6 13.4 L18 13.4 Z" fill="white" stroke="black" stroke-width="1.5" stroke-linejoin="round"/></svg>'
    Object.assign(cursor.style, {
      position: 'fixed', left: '0', top: '0', zIndex: '2147483647', pointerEvents: 'none',
      translate: '-100px -100px', transition: 'scale 90ms ease-out', transformOrigin: '4px 2px',
      filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))',
    })
    document.body.appendChild(cursor)
    // translate, not transform: the scale below applies before translate and after
    // transform, so a transform would pull the pressed cursor toward the window's corner.
    addEventListener('mousemove', (e) => { cursor.style.translate = (e.clientX - 4) + 'px ' + (e.clientY - 2) + 'px' }, true)
    addEventListener('mousedown', () => { cursor.style.scale = '0.85' }, true)
    addEventListener('mouseup', () => { cursor.style.scale = '1' }, true)
  })
`

// The pointer

const STEPS = Math.max(1, Math.round(MOVE_MS / MOVE_STEP_MS))

// Scrolls whatever holds the element, smoothly, until the element is in view:
// inside the window and inside every scrolling box around it, such as a sheet
// or the action bar's choice panel. A press outside lands on nothing, on what
// sits beside the box, or on a sheet's overlay, which dismisses the sheet.
async function bringIntoView(locator: Locator) {
  await locator.evaluate(
    (el, limit) =>
      new Promise<void>((resolve) => {
        const r = el.getBoundingClientRect()
        const inside = (box: { top: number; bottom: number; left: number; right: number }) =>
          r.top >= box.top && r.bottom <= box.bottom && r.left >= box.left && r.right <= box.right
        let shown = inside({ top: 0, bottom: innerHeight, left: 0, right: innerWidth })
        for (let p = el.parentElement; p && shown; p = p.parentElement) {
          const { overflowX, overflowY } = getComputedStyle(p)
          if (/(auto|scroll|hidden)/.test(overflowX + overflowY)) shown = inside(p.getBoundingClientRect())
        }
        if (shown) return resolve()
        addEventListener('scrollend', () => resolve(), { once: true, capture: true })
        setTimeout(resolve, limit)
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }),
    SCROLL_LIMIT,
  )
}

// Glides the pointer to the middle of the locator, firing hover on the way.
export async function moveTo(page: Page, locator: Locator) {
  await locator.waitFor({ state: 'visible' })
  await bringIntoView(locator)
  const box = await locator.boundingBox()
  if (!box) throw new TakeError(`${locator} has no box to move to.`)
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  if (x < 0 || y < 0 || x > VIEWPORT.width || y > VIEWPORT.height) {
    throw new TakeError(`${locator} sits outside the window at (${Math.round(x)}, ${Math.round(y)}).`)
  }
  await page.mouse.move(x, y, { steps: STEPS })
  return { x, y }
}

// The press lands on whatever is topmost at the point: an overlay still lifting
// takes it silently. Waits until the control itself is under the pointer.
async function waitUntilHittable(locator: Locator, at: { x: number; y: number }) {
  const deadline = performance.now() + HIT_LIMIT
  for (;;) {
    const blocker = await locator.evaluate((el, p) => {
      const top = document.elementFromPoint(p.x, p.y)
      if (!top || el.contains(top)) return null
      return `${top.tagName.toLowerCase()}${top.className ? `.${String(top.className).split(' ').slice(0, 3).join('.')}` : ''}`
    }, at)
    if (!blocker) return
    if (performance.now() > deadline) throw new TakeError(`${locator} is covered by ${blocker}.`)
    await pause(100)
  }
}

// Moves to the control, lets its hover show, and clicks it.
export async function clickOn(page: Page, locator: Locator) {
  const at = await moveTo(page, locator)
  await waitUntilHittable(locator, at)
  await pause(HOVER_MS)
  await page.mouse.down()
  await pause(PRESS_MS)
  await page.mouse.up()
  await pause(HOLD.action)
}

// Parks the pointer away from the action, so it does not cover what the camera holds on.
export async function park(page: Page, x = VIEWPORT.width - 80, y = VIEWPORT.height - 80) {
  await page.mouse.move(x, y, { steps: STEPS })
}

// The run

// Loads the path, hands the take its page and its mark, and writes the timeline
// once the take ends. A take that cannot be used writes none.
export async function capture(name: string, path: string, take: (page: Page, mark: Mark) => Promise<void>) {
  const steps: { name: string; ms: number }[] = []
  let start = 0
  const mark: Mark = (step) => steps.push({ name: step, ms: Math.round(performance.now() - start) })

  // An app window: no tab strip or address bar, only the title bar OBS's Client Area drops.
  // '' gives the persistent context a throwaway profile.
  const context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [`--app=${SCREEN}${path}`],
    viewport: VIEWPORT,
    colorScheme: 'dark',
    reducedMotion: 'no-preference',
  })
  try {
    await context.addInitScript(CURSOR)
    const page = context.pages()[0] ?? (await context.newPage())
    await page.goto(`${SCREEN}${path}`)
    await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height - 120)
    start = performance.now()
    mark('load')
    await take(page, mark)
    mark('end')

    const takes = new URL('./takes/', import.meta.url)
    await mkdir(takes, { recursive: true })
    await writeFile(new URL(`${name}.timeline.json`, takes), JSON.stringify({ capture: name, path, viewport: VIEWPORT, steps }, null, 2) + '\n')
    console.log(`Timeline written: ${steps.length} steps over ${steps.at(-1)?.ms} ms.`)
  } catch (error) {
    if (!(error instanceof TakeError)) throw error
    console.error(`Take not usable: ${error.message}`)
    process.exitCode = 1
  } finally {
    await context.close()
  }
}
