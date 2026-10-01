// Day-by-day projected stock (docs/RELEX_RULES.md §2):
// proj[d] = proj[d-1] + receipts[d] − forecast[d], starting from on-hand at the start of today.
import { findLocation, forecastLocation } from './forecast';
import { rules as defaultRules, type Rules } from './rules.config';
import type { Day, DepotId, GameState, ItemId, ItemLocation } from './types';

/**
 * End-of-day projected stock for each day of `forecastTotals` (index 0 = first day).
 * `receipts[i]` arrives on day i before that day's demand. With lostSales, stock clamps at 0.
 */
export function projectStock(
  onHand: number,
  forecastTotals: readonly number[],
  receipts: readonly number[],
  lostSales: boolean,
): number[] {
  const out: number[] = [];
  let stock = onHand;
  for (let i = 0; i < forecastTotals.length; i++) {
    stock = stock + (receipts[i] ?? 0) - forecastTotals[i];
    if (lostSales) stock = Math.max(0, stock);
    out.push(stock);
  }
  return out;
}

/** Open-order receipts per day for today..to (index 0 = today). Overdue orders count as today. */
export function receiptsByDay(state: GameState, loc: ItemLocation, to: Day): number[] {
  const out = new Array<number>(Math.max(0, to - state.today + 1)).fill(0);
  for (const o of state.openOrders) {
    if (o.itemId !== loc.itemId || o.depotId !== loc.depotId) continue;
    const i = Math.max(0, o.deliveryOn - state.today);
    if (i < out.length) out[i] += o.qty;
  }
  return out;
}

/** End-of-day projection for today..to (index 0 = today), including all open orders. */
export function projectLocation(state: GameState, loc: ItemLocation, to: Day, r: Rules = defaultRules): number[] {
  if (to < state.today) return [];
  const totals = forecastLocation(state, loc, state.today, to, r).map((p) => p.total);
  return projectStock(loc.onHand, totals, receiptsByDay(state, loc, to), r.projection.lostSales);
}

/** Projected end-of-day stock for from..to inclusive (index 0 = `from`). Days before today are NaN. */
export function project(
  state: GameState,
  itemId: ItemId,
  depotId: DepotId,
  from: Day,
  to: Day,
  r: Rules = defaultRules,
): number[] {
  const proj = projectLocation(state, findLocation(state, itemId, depotId), to, r);
  const out: number[] = [];
  for (let d = from; d <= to; d++) out.push(d < state.today ? NaN : proj[d - state.today]);
  return out;
}
