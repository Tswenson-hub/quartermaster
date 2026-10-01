# Quartermaster

Browser game: the player is a medieval army quartermaster. Underneath, it is a RELEX-style forecast & replenishment simulation meant to teach the real process. Core rule: **order so projected stock stays above the Must Order Point (MOP) at the 2nd delivery date (D2).**

Stack: Vite + React 19 + TypeScript, Zustand, Recharts, Vitest, Playwright.

## Commands
- `npm run dev` — dev server
- `npm test` — Vitest (engine unit + golden scenarios)
- `npm run build` — typecheck + build
- `npm run e2e` — Playwright smoke

## Layout and ownership
Several agents work in parallel, each in its own git worktree/branch. Only edit your own area.

| Area | Owner | Notes |
|---|---|---|
| `src/engine/types.ts`, `CLAUDE.md`, `src/store/` wiring | **lead** | The contract. Ask lead to change it. |
| `src/engine/**` (except types.ts), `tests/engine/**` | **engine** | Pure TS. No React, DOM, Date.now, or Math.random — use the seeded RNG. |
| `src/ui/**`, `src/App.tsx`, styles | **ui** | Reads state via the Zustand store; never computes replenishment itself. |
| `src/content/**`, `public/assets/**`, `docs/CONTENT.md` | **content** | Data only: items, vendors, sourcing, depots, battle plans, scenarios. |
| `docs/RELEX_RULES.md` | product owner (user) | Engine follows it; `rules.config.ts` implements it. |

## Conventions
- All RELEX rules are in `src/engine/rules.config.ts`. Don't hard-code rules elsewhere.
- Engine functions are pure: `(state, input) => newState`. Deterministic given `GameState.seed`.
- Days are integers (`Day`), day 0 = Monday.
- Terms in UI use RELEX vocabulary (MOP, COP, D1, D2, order proposal) with medieval flavor text beside them, plus a tooltip explaining the term.
- Raw purchased assets go in `assets/_raw/` (gitignored; licenses forbid redistribution). Curated files go in `public/assets/` and are listed in `public/assets/manifest.json`.
- Commit small and often on your branch. Lead merges into `main`.

## Engine ↔ store ↔ UI
- Engine exposes `EngineApi` (in `types.ts`) from `src/engine/index.ts`: `initGame`, `refresh`, `forecast`, `planningParams`, `project`, `placeOrders`, `tick`.
- `src/store/engine.ts` binds the store to an implementation (a stub in `engineStub.ts` until the engine branch merges).
- UI imports only from `src/store` (`useGameStore`, `select*` selectors incl. `selectPlanningParams`, `selectServiceLevel`) plus types from `src/engine/types.ts`.
- Store actions: `loadScenario`, `decideProposal(index, decision, qty?)`, `setOverride`, `clearOverride`, `endDay`, `newGame`. Saves to localStorage key `quartermaster-save`.
- Content exports `scenarios: Scenario[]` from `src/content/index.ts`; tutorial level 1 has id `tutorial-1`.
- e2e `data-testid`s (UI provides): `start-scenario-<id>`, `proposal-row`, `proposal-accept`, `end-day`, `today`, `morale`, `kpi-service-level`.
