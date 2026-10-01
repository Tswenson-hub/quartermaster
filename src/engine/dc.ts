// Distribution centres: dependent demand from the front depots' planned transfer orders.
import { isOrderDay } from './calendar';
import { chooseSource, computePlanning, planLine } from './replenishment';
import { rules as defaultRules, type Rules } from './rules.config';
import type { DepotId, GameState, ItemLocation, VendorId } from './types';

export function isDc(state: GameState, depotId: DepotId): boolean {
  return state.depots[depotId]?.kind === 'dc';
}

/**
 * A front location's planned orders over the next rules.dc.plannedOrderHorizonDays days, by
 * ship (order) day, index 0 = today. Simulated as if every future proposal were accepted:
 * each planned order arrives at its D1 and feeds the next order's projection.
 */
export function plannedOrders(
  state: GameState,
  loc: ItemLocation,
  r: Rules = defaultRules,
): { vendorId: VendorId; byDay: number[] } | undefined {
  const source = chooseSource(state, loc.itemId, loc.depotId);
  if (!source) return undefined;
  const { rule, vendor } = source;
  const H = Math.max(0, r.dc.plannedOrderHorizonDays);
  const byDay = new Array<number>(H).fill(0);
  const planned: number[] = [];
  for (let d = state.today; d < state.today + H; d++) {
    if (!isOrderDay(vendor, d)) continue;
    const detail = computePlanning(state, loc, rule, vendor, d, r, planned);
    const { reason, qty } = planLine(detail, r).proposal;
    if (reason !== 'must' || qty <= 0) continue;
    byDay[d - state.today] += qty;
    const arrive = detail.d1 - state.today;
    planned[arrive] = (planned[arrive] ?? 0) + qty;
  }
  return { vendorId: vendor.id, byDay };
}

const cache = new WeakMap<GameState, Map<string, number[]>>();

/**
 * Dependent demand for a DC item-location (index 0 = today, length = horizon): the sum of the
 * planned transfer orders of every location whose source is a lane from this DC.
 */
export function dependentDemand(state: GameState, dcLoc: ItemLocation, r: Rules = defaultRules): number[] {
  const key = `${dcLoc.itemId}\u0000${dcLoc.depotId}`;
  let byState = cache.get(state);
  if (!byState) cache.set(state, (byState = new Map()));
  const hit = byState.get(key);
  if (hit && r === defaultRules) return hit;

  const total = new Array<number>(Math.max(0, r.dc.plannedOrderHorizonDays)).fill(0);
  for (const loc of state.locations) {
    if (loc.itemId !== dcLoc.itemId || loc === dcLoc) continue;
    const plan = plannedOrders(state, loc, r);
    if (!plan || state.vendors[plan.vendorId]?.dcDepotId !== dcLoc.depotId) continue;
    plan.byDay.forEach((q, i) => (total[i] += q));
  }
  if (r === defaultRules) byState.set(key, total);
  return total;
}
