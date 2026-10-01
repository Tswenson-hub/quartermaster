# RELEX Rules Spec

The source of truth for how replenishment works in Quartermaster. `src/engine/rules.config.ts` implements it.
Sections marked **TODO (owner)** are for the product owner to define; the engine ships a sensible default meanwhile.

## 1. Time and calendar
- Daily buckets. Day 0 = Monday.
- Each vendor has order weekdays and a lead time (days).
- For an order placed on day *t* with vendor *V*:
  - **D1** = *t* + leadTime — delivery of this order.
  - **D2** = (next order day of *V* after *t*) + leadTime — delivery of the next order opportunity.
- The order placed today must carry projected stock through D2.

## 2. Projection
`proj[d] = proj[d-1] + receipts[d] − forecast[d]`, starting from on-hand today, including all open orders.
- **TODO (owner):** is projection measured at start or end of D2 (before/after D2 receipt)? Default: end of day D2 − 1, i.e. just before the D2 delivery arrives.

## 3. Must Order Point (MOP)
`MOP = safetyStock + presentationStock`
Default safety stock: `z(serviceLevel) × σ(forecast error) × √(leadTime + reviewPeriod)`.
- If `proj[D2] < MOP` → a **must** order proposal is created.
- **TODO (owner):** your exact MOP / safety-stock definition.

## 4. Can Order Point (COP)
`COP = MOP + extraDaysOfCover × avgDailyForecast` (default 3 days).
Items with `MOP ≤ proj[D2] < COP` are **can** order — only ordered to reach a vendor minimum.
- **TODO (owner):** confirm.

## 5. Order quantity
Bring `proj[D2]` up to order-up-to level (default: MOP), then round to pack size (default: round up).
- **TODO (owner):** order-up-to definition; rounding rules (round-up vs nearest with threshold); pallet layers.

## 6. Vendor minimums
If the vendor's total proposal < minimum (value or units):
1. Add **can** items, ranked by lowest days of cover, until the minimum is met.
2. If still short, flag `vendor-min-shortfall`; the player may accept with surcharge, delay, or reject.
- **TODO (owner):** fill priority, surcharge rules.

## 7. Multi-sourcing
Per item: ranked vendors (`priority`) and/or fixed `splitShare`. Default: use the highest-priority vendor whose order day is today; fall back on disruption.
- **TODO (owner):** split vs priority rules; how D2 is computed when sources differ.

## 8. Forecast
Baseline: 14-day moving average (alternative: exponential smoothing).
Event uplift (Battle Plans): `total = baseline × statedUplift` in the event window.
Player overrides: absolute or factor, date-ranged.
- **TODO (owner):** seasonality, trend, how overrides and events stack.

## 9. Budget
28-day fiscal periods. Accepted orders commit spend on the order date.
Overspend → next period allowance reduced by overspend; morale penalty.
- **TODO (owner):** consequences.

## 10. KPIs
Service level (fulfilled / demand), stock days of cover, spoilage, holding cost, budget variance, forecast accuracy (MAPE, bias).
