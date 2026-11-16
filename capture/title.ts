// The title capture: the title screen plays in, and Begin opens the draft.
//
//   node title.ts
//
// Needs the production build served on port 3000: from frontend/, `npm run build`
// then `python -m http.server 3000 -d out`.
import type { Page } from 'playwright'
import { capture, clickOn, HOLD, pause, type Mark } from './take.ts'

// The logo, letters, tagline and Begin finish arriving about 3.2s after load.
const INTRO_MS = 3400

// The take

async function take(page: Page, mark: Mark) {
  await pause(INTRO_MS)
  mark('title')
  await pause(HOLD.short)

  mark('begin')
  await clickOn(page, page.getByRole('button', { name: 'Begin' }))
  await page.getByRole('heading', { name: 'Assemble Your Party' }).waitFor()
  await pause(HOLD.fade)
  mark('draft')
  await pause(HOLD.short)
}

await capture('title', '/', take)
