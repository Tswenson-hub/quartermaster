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
- Engine exposes `EngineApi` (in `types.ts`) from `src/engine/index.ts`: `initGame(scenario, setup?)`, `refresh`, `forecast`, `planningParams`, `project`, `placeOrders`, `tick`.
- `src/store/engine.ts` binds the store to the engine (`import { engine } from "../engine"`).
- UI imports only from `src/store` plus types from `src/engine/types.ts` (never `rules.config` or engine modules; ask lead for a selector).
- Store actions: `newGame(scenario, difficulty)` (async: fetches market), `loadScenario(scenario, difficulty?)` (sync, bundled snapshot; tests/e2e), `decideProposal(index, decision, qty?)`, `setVendorTrigger(vendorId, fraction | null)`, `setForecastOverride({day, qty} | {from, to, total})`, `deleteOverride({itemId, depotId, from?, to?})`, `endDay`, `quitGame`. `setOverride`/`clearOverride` are deprecated aliases. Saves to localStorage key `quartermaster-save` (version 2; older saves are discarded).
- Selectors: `selectForecast`, `selectProjection`, `selectPlanningParams`, `selectD2CheckDay`, `selectCurrentPeriod`, `selectExceptionsToday`, `selectServiceLevel`, `selectDecisionPreview`, `selectKpiSummary` (service level, days of supply, spoilage, SWAPE, bias), `selectDifficultyOptions`, `selectMarketInfo`, `selectLetterText` (content templates filled from `Letter.facts`).
- Content exports `scenarios: Scenario[]` from `src/content/index.ts`; tutorial level 1 has id `tutorial-1`.
- e2e `data-testid`s (UI provides): `start-scenario-<id>`, `proposal-row`, `proposal-accept`, `end-day`, `today`, `morale`, `kpi-service-level`, `nav-<screen>`.

## Market data (RELEX_RULES §11)
- Actual demand follows a real stock's daily closes. `src/store/market.ts` fetches Alpha Vantage `TIME_SERIES_DAILY` (key from the in-game setting, localStorage `quartermaster-alphavantage-key`, or `VITE_ALPHAVANTAGE_KEY`). At most one fetch attempt per ticker per calendar day, cached in localStorage. Otherwise it uses bundled snapshots in `src/content/market/`.
- Refresh snapshots: `ALPHAVANTAGE_KEY=… node scripts/fetch-market.mjs`; `--synthetic` generates labelled placeholder series. The committed snapshots are currently SYNTHETIC.
- The store passes a `MarketSignal` into `initGame`; the engine stays pure and turns it into demand with `rules.market`. Difficulty presets (ticker + budget factor) live in `rules.difficulty`.
