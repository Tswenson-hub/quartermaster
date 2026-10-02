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
- Safety stock can be automatically defined based on the variance of sales, the user can also define a minimum fill. The LARGER of these two quantities becomes the MUST-ORDER POINT

## 4. CO - MRP
- There is one type of coordination limit that requires special rules. A vendor can require a minium order
- In the case the vendor defines a minimum order quantity, The user must define an Order Trigger level. This is the % of real need that you must hit before the sim will BUILD to the minimum. The system will BUILD by adding one batch at at a time of the product that has the greatest need (even if it is far above what is actually needed). This continues until the threshold is met. The user of course can still decide to decline to approve the order if it is too many $ for their budget. 

## 5. Order quantity
Bring `proj[D2]` up to order-up-to level (default: MOP), then round to pack size (default: round up).
- Always order in the correct rounding for a product

## 6. Vendor minimums
If the vendor's total proposal < minimum (value or units):
1. Add **can** items, ranked by lowest days of cover, until the minimum is met.
2. If still short of the order trigger level, no order is created for the user to review, the user would need to lower the trigger level in order to build up an order. They may still decide not to accept the order.


## 8. Forecast
Baseline: 14-day moving average (alternative: exponential smoothing).
Event uplift (Battle Plans): `total = baseline × statedUplift` in the event window.
Player overrides: absolute or factor, date-ranged.
- Default forecasts should be simple exponential smoothing. Event uplifts will be maintained also and those will stack with the baseline forecast. 
- Users can overwrite a forecast for the individual day level (or at an aggregate level and let the forecast break out). A user provided forecast IS the forecast that orders are based on unless it is deleted.

## 9. Budget
28-day fiscal periods. Accepted orders commit spend on the order date.
Overspend → next period allowance reduced by overspend; morale penalty.
- If budget is consistantly overspent, you will lose your rank. Sticking to the budget and providing a high service level will win battles and promotions. 

## 10. KPIs
Service level (fulfilled / demand), days of supply, spoilage,  forecast accuracy (SWAPE, bias).

## 11 Game Mechanics
- In order to keep real sales unpredicatble. Source a free API that maps to stock data. Pick a moderatly volitile stock. Pull once daily to avoid hitting a rate limit. Normalize using math in order to ensure sales are somewhat in range but have variance to make forecasting fun.
- The goal is to balance the budget, and make sure the army is well supplied. If the army is too poorly supplied for a battle, you may lose. This will negatively affect your rank. Going over the budget consistently will earn you letters of reprimand and eventually lose your rank. If your rank goes too low, you lose the game
- There should be difficulty settings. This could possibly be as simple as picking a more volitile stock and giving a tighter budget. 
