# Contract requests (agents → lead)

Proposed changes to `src/engine/types.ts`. Lead records the decision under each and deletes resolved entries after a milestone.

## Resolved 2026-09-30 (main)
1. **Lot tracking** — added optional `ItemLocation.lots` (FIFO, oldest first, sum = onHand). Engine may switch spoilage to lots in M2; keep `cover-excess` as fallback when lots are absent.
2. **`DailyKpi.forecast`** — added as optional (`forecast?: number`) so main keeps building; engine please always fill it from now on.
3. **`Vendor.reliability`** — means probability of on-time, in-full delivery (1 = never fails). Matches content's data. Delays in tick are M2.
4. **`'stockout'` exception kind** — added. Raise it on days with unmet demand. UI Dispatch map has an entry.
5. **Vendor-minimum surcharge** — added `Vendor.minimum.surcharge?` (flat silver). No new decision field: accepting a `vendor-min-shortfall`-flagged order whose vendor total is below the minimum means "accept with surcharge"; placeOrders adds the surcharge once per vendor order. If no surcharge is defined, placeOrders drops the short order. M2.

## Resolved 2026-09-30, round 2
6. **`OpenOrder.surcharge?: number`** — added on main; engine please set it. Original request: — placeOrders currently folds the vendor-minimum surcharge into the `cost` of the
   order's first line, so `cost ≠ qty × unitCost` there and the UI can't show the surcharge separately. Proposal: an optional
   `surcharge` (silver, included in `cost`) on that line. Engine change is one line once added.

## Open — product owner decision
7. **Lead-time variability in safety stock** — **Decided by owner 2026-10-01: safety stock covers forecast error only.**
   Start with the current (high) service levels and adjust later. No engine change. Original note (engine FYI): With reliability-driven delays live, accept-all service dips slightly
   (tutorial-3 99.5%, tutorial-4 99.3%, tutorial-7 97.8%, sandbox 98.2%; all still ≥ 95%). Safety stock covers forecast error only.
   If the product owner wants RELEX-style LT-variance safety stock, `rules.safetyStock` would need reliability/lateDays inputs.

## Resolved 2026-09-30, round 3
8. **`GameState.lengthDays`** — added (RuntimeField; initGame sets it; lead patched initGame + test fixture). Engine: use it in campaignLength(). Original request: — tick needs the campaign length to set `status: 'complete'`. Today the engine uses
   `state.market.values.length` (the store guarantees it equals `scenario.lengthDays`), see `campaignLength()` in `rank.ts`.
   Proposal: copy `scenario.lengthDays` into `GameState.lengthDays` in initGame (RuntimeField).
9. **Per-location fulfilment** — added as optional `ItemLocation.fulfilled?: number[]` (campaign days; tick appends). Original request: `BattleOutcome.serviceLevel` should be service to the battle plan's depots, but only
   all-location `DailyKpi` rows are stored, so `battleServiceLevel()` uses those over the window. Proposal: `ItemLocation.fulfilled:
   number[]`, parallel to the campaign part of `history` (tick appends units fulfilled each day). Then battles (and per-item service
   level in the UI) can be exact. Engine change is local to `rank.ts` + `tick.ts`.
