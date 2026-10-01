# Contract requests (engine → lead)

Proposed changes to `src/engine/types.ts`. Nothing here blocks M1; the engine ships a workaround for each.

## 1. Lot tracking for spoilage — `ItemLocation.lots`
`shelfLifeDays` can't be honoured exactly because `ItemLocation` only has `onHand`, so the age of stock is unknown.
Proposal: `lots?: { qty: number; receivedOn: Day }[]` on `ItemLocation` (FIFO; sum = onHand).
Workaround now (`rules.spoilage.mode = 'cover-excess'`): stock beyond `shelfLifeDays × baseline` can't be sold in time under FIFO; 1/shelfLife of that excess spoils per day.

## 2. Forecast on the KPI row — `DailyKpi.forecast`
MAPE/bias (RELEX_RULES §10) need the forecast that was made for each day. Proposal: `forecast: number` on `DailyKpi`
(sum over locations of the day's forecast total, as of that morning). Until then the UI can get past-day forecasts from
`engine.forecast(state, item, depot, from, to)` with `from < today` — it returns the one-step-ahead forecast as of each past day
(no overrides history, though: overrides that have since been cleared are not reflected).

## 3. `Vendor.reliability` semantics
The name says "reliability" (1 = always on time) but the doc comment says "probability of delay / short-ship" (0 = always on time).
Please pick one. Delays are not simulated yet; once decided, tick will delay deliveries and raise `delivery-late`.

## 4. An exception kind for actual stockouts
`ExceptionKind` has `stockout-risk` (forward-looking) but no kind for "we ran out yesterday". Proposal: add `'stockout'`.
Today actual stockouts only show in KPIs (`fulfilled < demand`) and morale.

## 5. Vendor-minimum surcharge
§6 lets the player "accept with surcharge". Needs a surcharge on `Vendor.minimum` (e.g. `surcharge?: number`, flat silver) and
a way to tell `placeOrders` the player accepted a short order. Not implemented yet.
