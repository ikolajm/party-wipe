# Party Wipe — CLAUDE.md

## What This Is

A D&D 5e roguelike survival game. Solo party of 4 characters, zone-based combat, procedural dungeon rooms, loot, leveling. Game ends on TPK. Score tracks how far you got.

Built as pipeline proof #2 — dark/fantasy brand generated via the jmi-hub design system pipeline. Status effect animations (CSS and Motion) on combat tokens are the design-chops showcase.

## Status

V1 is feature-complete and plays end to end — engine, UI, polish, and balance are done. Development is paused. The game runs on an Azure Static Web App at https://blue-sand-074984610.3.azurestaticapps.net, deployed by the workflow in `.github/workflows/` on every push to `master`. **`SPRINT.md` is the source of truth** for what's built and what's left.

## Project Structure

```
party-wipe/
├── CLAUDE.md               ← You are here
├── README.md
├── SPRINT.md               ← Active tracker — source of truth for build state
├── TODO.md                 ← Frozen historical build checklist (points at SPRINT.md)
├── docs/
│   ├── V1-SPEC.md          ← Game design spec
│   ├── ENGINE-RULES.md     ← Shipped engine mechanics reference
│   ├── UI-SPEC.md          ← UI component sizing/spec reference
│   ├── UI-DEEP-DIVE.md     ← Reference-game analysis (FF, BG3, etc.)
│   ├── DATA-LICENSING.md   ← SRD licensing notes
│   ├── game-inspo.md       ← Reference game list
│   ├── visual-ref.md       ← Reference image URLs
│   └── archive/            ← Spent docs (ICON-PICKLIST.md)
├── server/                 ← SRD data pipeline (regeneration only — see below)
│   └── data/
│       ├── databases/
│       │   ├── 5e-Databases/   ← Raw SRD source (2014 + 2024 editions)
│       │   ├── complete-data/  ← Merged/seeded output
│       │   └── types/          ← TypeScript interfaces for SRD entities
│       └── helpers/
│           ├── 5e-merger/      ← Normalize shared tables across editions
│           ├── 5e-seeder/      ← Transform raw SRD → complete-data
│           └── misc/
└── frontend/               ← The game — Next.js 16 + React 19 + Tailwind
    ├── answers.json        ← Loom pipeline brand questionnaire answers
    ├── scripts/
    │   └── generate-game-data.mjs  ← SRD complete-data → typed game data files
    └── src/
        ├── app/            ← Pages: page.tsx (title), draft/, game/, dev/
        ├── assets/         ← Source SVGs (class, monster, item, status, spell-school, room, ui, loot)
        ├── components/
        │   ├── atoms/      ← Generated design-system atoms (Accordion, Button, Sheet, Tabs) + GameIcon, Logo
        │   ├── molecules/  ← Game-specific composed components (StatRow, HealthBar, ZoneToken, …)
        │   ├── game/       ← Screen + HUD components (ZoneLayout, ActionBar, RoomPreview, …)
        │   └── providers/  ← GameProvider (game state), ThemeProvider
        ├── data/           ← Game data + pure logic (types, classes, generators, status-effects, …)
        ├── hooks/          ← Combat orchestration (useCombat + resolvers/enemy-turn/modifiers, useRest)
        ├── game-tokens.css ← Game color layer over the design system tokens
        └── tokens.css      ← Design system tokens
```

All game logic lives in `frontend/src/` — `data/` (pure functions, types, generated data, config) and `hooks/` (combat glue). There is no separate `engine/` package; the game is self-contained in `frontend/`.

## Data Pipeline

Two stages, both run from `server/` and only needed when regenerating game data:

1. **Merge then seed** — mergers normalize reference tables across the 2014/2024 SRD editions; seeders transform raw SRD JSON into `complete-data/` with consistent types. Run via `npm run merge-*` / `npm run seed-*` (see `server/package.json`).
2. **Generate game data** — `frontend/scripts/generate-game-data.mjs` reads `complete-data/` and emits the typed game files the game imports: `spell-meta.ts`, `feature-meta.ts`, `monster-pool.ts`. Loot is not generated; it comes from the curated `v1-roster.ts` through `loot-generator.ts`.

The committed generated files in `frontend/src/data/` are the read path for the game. The pipeline is only re-run when the SRD subset changes.

## Key Types

`frontend/src/data/game-types.ts` is the game's type home — `Character`, `Enemy`, `CombatState`, `Room`, `GamePhase`, `FloorModifier`, `EnemyIntent`, `WeaponOnHit`, etc. `status-effects.ts` owns `GameCondition` + `ActiveEffect`. The SRD-shaped types (`Monster`, `Spell`, `Equipment`, `Class`, `Level`, `Feature`, `Condition`) live in `server/data/databases/types/`.

## V1 Scope

See `docs/V1-SPEC.md` for the game design spec, `docs/ENGINE-RULES.md` for shipped mechanics. Key constraints:

- 6 classes: Fighter, Rogue, Wizard, Cleric, Ranger, Barbarian
- Zone combat (melee/ranged/far), not grid
- Level cap 10
- Solo play only (multiplayer is v2)
- Text/icon/token UI — no sprites, no character-specific art
- CSS and Motion status effect animations on combat tokens ARE in scope
- Damage types + resistances/immunities tracked; cantrip scaling tracked; concentration tracked

## Data Source

5e SRD (CC-BY-4.0), via the dnd5eapi.co dataset. See `docs/DATA-LICENSING.md`.

## UI Architecture

Phase-driven full-screen flow, not a persistent dashboard. `GameProvider` holds `state.phase`; `game/page.tsx` renders one full-screen component per phase:

- `room-preview` → `RoomPreview`
- `combat` → `ZoneLayout` (3 zones, tokens)
- `loot` → `LootScreen`
- `rest` → `RestScreen`
- `level-up` → `LevelUpScreen`
- `game-over` → `GameOverScreen`

A floating **HUD overlay layer** sits on top regardless of phase: floor/room chip, `InitiativeBar`, `GameLog`, `CombatFeedback`, `CombatOverlays`, `PhaseBanner`, `VictoryOverlay`, the animated `ActionBar`, and `InspectSheet`. Title (`page.tsx`) and draft (`draft/page.tsx`) are standalone pages; `/dev` jumps to any phase for testing.

## Design System

Generated via the jmi-hub (Loom) pipeline. Brand: amber/gold primary (#DAA520), secondary #2e5bcc (auto-derived), accent #29d1a1 (teal). Cinzel headings, JetBrains Mono body, dark mode default. Sharp edges, compact density, flat shadows.

- Tokens in `frontend/src/tokens.css` — use `var(--space-*)`, `var(--primary)`, `var(--font-heading)`, etc.
- Typography classes: `text-display-*`, `text-title-*`, `text-body-*`, `text-label-*`
- Generated atoms in `components/atoms/`, kept only where the game uses them; game-specific molecules in `components/molecules/` (project-owned, never regenerated)
- Game-specific color layer (`data/game-colors.ts`) — damage types, spell schools, action types, rarity, status, resources, surfaces — extends the generated tokens
- Hybrid icon system — generated `GameIcon` atom over a mix of pixel-art and Lucide source SVGs in `assets/` (class, monster, status, spell-school, room, item, loot, ui)

## Conventions

- TypeScript throughout
- Dogfood design system tokens — no hardcoded spacing, colors, or typography when a token exists
- `data/` holds pure functions and data; `hooks/` holds the React-bound combat orchestration
- `complete-data/` (server) is the single source for regenerating game data — never read from `5e-Databases/` directly
- SRD data is committed to the repo (small, ~1-3MB for the v1 subset)
- Per-screen CSS files with namespaced classes where needed (`title.css`, `room.css`, `animations.css`), NOT in globals
