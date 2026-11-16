// The character select capture: the four classes the later takes fight with
// are drafted through the class sheet, then the party embarks.
//
//   node draft.ts
//
// Needs the production build served on port 3000: from frontend/, `npm run build`
// then `python -m http.server 3000 -d out`.
import type { Page } from 'playwright'
import { capture, clickOn, HOLD, park, pause, TakeError, type Mark } from './take.ts'

// The order /dev seats them in, so the draft and the combat takes show one party.
// Each pick names the sheet tabs the camera stops on before the class is added.
const PICKS = [
  { name: 'Fighter', tabs: ['Combat', 'Progression'] },
  { name: 'Ranger', tabs: [] },
  { name: 'Wizard', tabs: ['Spells'] },
  { name: 'Cleric', tabs: [] },
]

// The take

async function draft(page: Page, mark: Mark, pick: (typeof PICKS)[number]) {
  const cards = page.locator('section').nth(1)
  const sheet = page.getByRole('dialog')

  mark(`open-${pick.name.toLowerCase()}`)
  await clickOn(page, cards.getByRole('button', { name: pick.name }))
  await sheet.waitFor()
  await park(page)
  await pause(HOLD.action)

  for (const tab of pick.tabs) {
    await clickOn(page, sheet.getByRole('tab', { name: tab }))
    await park(page)
    await pause(HOLD.action)
  }

  mark(`add-${pick.name.toLowerCase()}`)
  await clickOn(page, sheet.getByRole('button', { name: `Add ${pick.name}` }))
  await sheet.waitFor({ state: 'hidden' })
  const placards = page.locator('section').nth(0)
  if (!(await placards.getByText(pick.name, { exact: true }).count())) {
    throw new TakeError(`The sheet closed without adding the ${pick.name}.`)
  }
}

async function take(page: Page, mark: Mark) {
  await page.getByRole('heading', { name: 'Assemble Your Party' }).waitFor()
  // The draft fades up out of black and takes no clicks until it has.
  await pause(HOLD.fade)

  for (const pick of PICKS) await draft(page, mark, pick)

  mark('party')
  await park(page)

  mark('embark')
  await clickOn(page, page.getByRole('button', { name: 'Embark' }))
  await page.waitForURL('**/game/')
  await pause(HOLD.fade)
  mark('preview')
  await pause(HOLD.short)
}

await capture('draft', '/draft/', take)
