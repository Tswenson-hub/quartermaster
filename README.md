# Quartermaster

**Play it:** https://quartermaster-flame.vercel.app

You are the quartermaster of a medieval army. Keep the camps fed and armed, stay on budget, and win the general's battles.

Underneath the parchment, Quartermaster simulates forecasting and replenishment the way **RELEX**-style supply-chain planning systems do. Playing it teaches the real process. The core rule:

> Order so that projected stock stays above the **Must Order Point (MOP)** at the **second delivery date (D2)**.

## What it teaches

| In the game | The real concept |
|---|---|
| Letters from the general announcing a siege | Promotions and events: an uplift on the baseline forecast, which may be understated |
| Order proposals each morning | System-generated order proposals: accept, edit or reject |
| D1 / D2 on every proposal | Delivery of this order vs the next order opportunity, the coverage horizon |
| "MOP = max(safety stock, minimum fill)" | Must Order Point: statistical safety stock or a presentation minimum, whichever is larger |
| Guild minimums and order triggers | Vendor minimum orders, with an order trigger that builds up to the minimum one pack at a time |
| Overriding the clerk's forecast | User forecast overrides (one day, or a total spread across a range) that replace the system forecast |
| The Royal Depot at Kingsreach | A distribution centre: transfer orders, dependent demand, carrying stock at the DC vs the front |
| Treasury, reprimands and promotions | Fiscal-period budgets with consequences |
| The quartermaster's ledger | KPIs: service level, days of supply, spoilage, SWAPE and bias |
| Master Data | Item-location and vendor master data, vendor performance (on-time %, actual lead time), and order-day schedules |

Actual demand follows a real stock's daily price series (Alpha Vantage). Easy follows KO, normal AAPL and hard TSLA, so higher volatility makes forecasting harder. Without an API key the game plays offline from bundled snapshots. The snapshots in this repo are **synthetic** placeholder series.

## How to play

1. Pick a difficulty and a level. The tutorial has ten levels, each introducing one concept; the sandbox runs a 112-day campaign across three camps and a DC.
2. You take over from the previous quartermaster, so you start with stock on the road, history and a part-spent budget.
3. Each day: read Dispatch (exceptions and letters), check Item Planning (forecast, projected stock, MOP/D2), decide the order proposals, then **End day**.
4. Keep service high and spending inside the allowance. Win battles, earn promotions, and don't get demoted below the lowest rank.

## Tech

- **React 19 + TypeScript + Vite**, with **Zustand** for state and **Recharts** for the planning and treasury charts.
- **A pure TypeScript simulation engine** (`src/engine`): no React, no `Date`, no `Math.random`, and deterministic given a seed. Every tunable rule lives in [`src/engine/rules.config.ts`](src/engine/rules.config.ts) and mirrors the spec in [`docs/RELEX_RULES.md`](docs/RELEX_RULES.md).
- **A typed contract** (`src/engine/types.ts`) between engine, store and UI. The UI never computes replenishment itself; it reads engine results through store selectors.
- **Tests:** about 290 Vitest unit and golden-scenario tests (including "accept every proposal keeps service ≥ 95%" on every level), plus Playwright end-to-end tests.
- **Deployment:** Vercel.

```bash
npm install
npm run dev      # dev server
npm test         # unit + golden scenario tests
npm run e2e      # Playwright smoke tests
npm run build    # typecheck + production build
```

Optional live market data: set `VITE_ALPHAVANTAGE_KEY`, or paste a key on the new-game screen. Refresh the bundled snapshots with `ALPHAVANTAGE_KEY=… node scripts/fetch-market.mjs`.

## How it was built

Built with [Claude Code](https://claude.com/claude-code) as a team of AI agents working in parallel git worktrees:
- a **lead** owned the contract, the store and the merges;
- **engine**, **ui** and **content** agents each owned their own area.

Every merge into `main` passed a gate: typecheck, build, unit tests, lint and end-to-end tests. The product owner defined the RELEX rules and play-tested.

## Credits

- **Icons:** Raven Fantasy Icons by Clockwork Raven Studios (free version, personal use; this game is free with no ads or microtransactions).
- **Map tiles:** Kenney "RTS Pack: Medieval" (CC0).
- **Fonts:** Inter and IM Fell English (Google Fonts).

The full licence notes are in [`public/assets/LICENSES.md`](public/assets/LICENSES.md). The art assets belong to their creators and may not be reused separately from the game.
