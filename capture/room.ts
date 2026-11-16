// The room capture: a room under the Ironhide floor modifier, held on its
// preview, then walked into for a few blows each way.
//
//   node room.ts
//
// Needs the production build served on port 3000: from frontend/, `npm run build`
// then `python -m http.server 3000 -d out`.
import type { Page } from 'playwright'
import { capture, clickOn, HOLD, MOVE_MS, park, pause, TakeError, type Mark } from './take.ts'

// Seed 8 rolls an elite room against a Wolf and a Skeleton, in the order
// Wizard > Fighter > Skeleton > Wolf > Cleric > Ranger: two party blows, two
// answered, and the take ends as the Cleric's turn comes up.
const PATH = '/dev/?seed=8&capture&phase=room-preview&mod=ironhide'

// How long an enemy turn may take before the take gives up on it.
const TURN_LIMIT = 15_000

// How long an action takes to land after its target is picked: the game's
// 150ms attack swing or 600ms cast charge (CAST_CHARGE_MS in combat-events.ts),
// then the 1200ms hit on the token (HIT_DURATION_MS in TokenFeedbackOverlay.tsx).
const LANDS_MS = { attack: 150 + 1200, spell: 600 + 1200 }

// The party turns the take plays, in the order they come up: the action tile,
// then the spell where it casts, then the first target on the list the game offers.
// The Wolf stands with the Fighter in zone 1; the Skeleton in zone 2.
const PLAN = [
  { who: 'Wizard', tile: 'Cast', spell: 'Magic Missile', targets: ['Skeleton', 'Wolf'] },
  { who: 'Fighter', tile: 'Attack', targets: ['Wolf', 'Skeleton'] },
] as const

type Turn = (typeof PLAN)[number]

// The turns

// Waits for the next party member's action bar and says whose it is. Enemy
// turns play out on their own in the meantime.
async function nextTurn(page: Page): Promise<string> {
  const bar = page.getByRole('group', { name: /'s turn$/ })
  await bar.waitFor({ timeout: TURN_LIMIT }).catch(() => {
    throw new TakeError('No party turn came up.')
  })
  return ((await bar.getAttribute('aria-label')) ?? '').replace(/'s turn$/, '')
}

async function act(page: Page, mark: Mark, turn: Turn) {
  mark(`turn-${turn.who.toLowerCase()}`)
  await pause(HOLD.short)

  const bar = page.getByRole('group', { name: `${turn.who}'s turn` })
  await clickOn(page, bar.getByRole('button', { name: turn.tile, exact: true }))
  if ('spell' in turn) {
    await clickOn(page, page.getByRole('group', { name: 'Select Spell' }).getByRole('button', { name: turn.spell }))
  }
  const targets = page.getByRole('group', { name: /select target/i })
  await targets.waitFor()
  const offered = (await targets.getByRole('button').allInnerTexts()).map(t => t.replace(/\s+/g, ' ').trim())
  console.log(`${turn.who}: ${turn.tile}${'spell' in turn ? ` ${turn.spell}` : ''}, offered: ${offered.join(' | ') || 'nothing'}`)
  const target = turn.targets.find(name => offered.some(o => o.includes(name)))
  if (!target) throw new TakeError(`The ${turn.who} was offered none of ${turn.targets.join(', ')}.`)
  await clickOn(page, targets.getByRole('button', { name: target }))
  mark(`${turn.who.toLowerCase()}-acts`)
  // The glide to End plays over the hit, so the press lands as the hit fades.
  await pause(Math.max(0, LANDS_MS['spell' in turn ? 'spell' : 'attack'] - HOLD.action - MOVE_MS))

  await clickOn(page, bar.getByRole('button', { name: 'End', exact: true }))
  await bar.waitFor({ state: 'detached', timeout: TURN_LIMIT })
}

// The take

async function take(page: Page, mark: Mark) {
  const enter = page.getByRole('button', { name: 'Enter Room' })
  await enter.waitFor()
  await pause(HOLD.fade)
  // The hidden dev bar also holds an Ironhide button, so only a visible match counts.
  if (!(await page.getByText('Ironhide', { exact: true }).filter({ visible: true }).count())) {
    throw new TakeError('The room preview does not show the Ironhide modifier.')
  }
  mark('preview')
  await pause(HOLD.read)

  mark('enter')
  await clickOn(page, enter)
  await park(page)
  await pause(HOLD.fade * 2 + HOLD.beat)
  mark('combat')

  for (const turn of PLAN) {
    const who = await nextTurn(page)
    if (who !== turn.who) throw new TakeError(`The ${turn.who} was due, but the ${who}'s turn came up.`)
    await act(page, mark, turn)
  }

  // The enemies answer; the next party turn coming up is where the take ends.
  const after = await nextTurn(page)
  mark(`turn-${after.toLowerCase()}`)
  await pause(HOLD.short)
}

await capture('room', PATH, take)
