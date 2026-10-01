# Contract requests (agents → lead)

Proposed changes to `src/engine/types.ts`. Lead records the decision under each and deletes resolved entries after a milestone.

## Resolved 2026-09-30 (main)
1. **Lot tracking** — added optional `ItemLocation.lots` (FIFO, oldest first, sum = onHand). Engine may switch spoilage to lots in M2; keep `cover-excess` as fallback when lots are absent.
2. **`DailyKpi.forecast`** — added as optional (`forecast?: number`) so main keeps building; engine please always fill it from now on.
3. **`Vendor.reliability`** — means probability of on-time, in-full delivery (1 = never fails). Matches content's data. Delays in tick are M2.
4. **`'stockout'` exception kind** — added. Raise it on days with unmet demand. UI Dispatch map has an entry.
5. **Vendor-minimum surcharge** — added `Vendor.minimum.surcharge?` (flat silver). No new decision field: accepting a `vendor-min-shortfall`-flagged order whose vendor total is below the minimum means "accept with surcharge"; placeOrders adds the surcharge once per vendor order. If no surcharge is defined, placeOrders drops the short order. M2.
