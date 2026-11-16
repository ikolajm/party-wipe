# Captures

Playwright scripts that play the game for the demo footage, one script per take.
Each opens an app window at 1280×720, drives it with a drawn cursor, and writes
`takes/<name>.timeline.json`: each step's name and when it happened, from the page
load. OBS records the window; the timeline times the captions.

| Take | Shows |
|------|-------|
| `title` | The title screen plays in, and Begin walks to the draft |
| `draft` | Fighter, Ranger, Wizard and Cleric drafted through the class sheet, then Embark |
| `room` | A room under the Ironhide modifier, then two party blows and the enemies' answer |
| `boss` | The Chimera's room, the walk in, the opening turn, and the boss in the inspect sheet |

The room and boss takes run on `/dev` with a fixed `seed`, so every take of them plays
out the same; each script names its seed and what it rolls.

## Running a take

The takes run against the production build, so no development tools reach the frame.
From `frontend/`:

```
npm run build
python -m http.server 3000 -d out
```

Then, from `capture/`, once:

```
npm install
```

and one take at a time:

```
npm run title
npm run draft
npm run room
npm run boss
```

`npm run check` typechecks the scripts. A take that goes wrong stops with a message
naming the control it could not reach, and writes no timeline.

## Pacing

Every take shares the holds in `take.ts`. `HOLD.fade` and `HOLD.beat` mirror the
game's own `FADE_THROUGH_MS` and `ARRIVAL_BEAT_MS` in
`frontend/src/components/game/FadeThrough.tsx`; change them together.
