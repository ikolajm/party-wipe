// The boss capture: the boss room's preview, the walk in, the first turn, and
// the boss opened in the inspect sheet.
//
//   node boss.ts
//
// Needs the production build served on port 3000: from frontend/, `npm run build`
// then `python -m http.server 3000 -d out`.
import type { Page } from 'playwright'
import { capture, clickOn, HOLD, park, pause, type Mark } from './take.ts'

// Seed 4 brings the Chimera with a Wolf, in the order Ranger > Wolf > Wizard >
// Cleric > Fighter > Chimera, so the take opens on the Ranger's turn and the
// boss holds still while the camera looks at it.
const PATH = '/dev/?seed=4&capture&phase=room-preview-boss'

// The take

async function take(page: Page, mark: Mark) {
  const enter = page.getByRole('button', { name: 'Enter Room' })
  await enter.waitFor()
  await pause(HOLD.fade)
  mark('preview')
  await pause(HOLD.read)

  mark('enter')
  await clickOn(page, enter)
  await park(page)
  await pause(HOLD.fade * 2)
  const boss = page.getByRole('button', { name: /Chimera/ })
  await boss.waitFor()
  mark('combat')
  await pause(HOLD.beat)
  mark('turn')

  // The glide to the boss plays over the turn banner, so the camera never sits still.
  mark('inspect')
  await clickOn(page, boss)
  await page.getByRole('dialog').waitFor()
  await park(page)
  await pause(HOLD.read)
  await page.keyboard.press('Escape')
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  await pause(HOLD.short)
}

await capture('boss', PATH, take)
