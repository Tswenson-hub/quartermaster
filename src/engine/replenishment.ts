// MOP, COP, order-up-to, pack rounding and order proposals (docs/RELEX_RULES.md §3–5, §7).
import { deliveryDates, nextOrderDayFrom, reviewPeriodDays } from './calendar';
import { findLocation, forecastErrorStdDev, forecastLocation } from './forecast';
import { projectStock, receiptsByDay } from './projection';
import { rules as defaultRules, type Rules } from './rules.config';
import type {
  Day,
  DepotId,
  GameState,
  ItemId,
  ItemLocation,
  OrderProposal,
  PlanningParams,
  SourcingRule,
  Vendor,
} from './types';

/** Round a raw need to the pack size per rules.packRounding. Need ≤ 0 → 0. */
export function roundToPack(need: number, packSize: number, r: Rules = defaultRules): number {
  if (need <= 0) return 0;
  const pack = Math.max(1, packSize);
  const exact = need / pack;
  const whole = Math.floor(exact + 1e-9);
  if (exact - whole < 1e-9) return whole * pack;
  if (r.packRounding.mode === 'up') return (whole + 1) * pack;
  return (exact - whole >= r.packRounding.threshold ? whole + 1 : whole) * pack;
}

/**
 * Source for an item's next order opportunity (§7 default): the vendor with the earliest
 * order day on or after today; ties go to the preferred source (lowest `priority`, then
 * vendorId). Split sourcing is not applied yet.
 */
export function chooseSource(
  state: GameState,
  itemId: string,
): { rule: SourcingRule; vendor: Vendor; orderDay: Day } | undefined {
  let best: { rule: SourcingRule; vendor: Vendor; orderDay: Day } | undefined;
  for (const rule of state.sourcing) {
    const vendor = state.vendors[rule.vendorId];
    if (rule.itemId !== itemId || !vendor || vendor.orderDays.length === 0) continue;
    const orderDay = nextOrderDayFrom(vendor, state.today);
    if (
      !best ||
      orderDay < best.orderDay ||
      (orderDay === best.orderDay &&
        (rule.priority < best.rule.priority ||
          (rule.priority === best.rule.priority && rule.vendorId < best.rule.vendorId)))
    ) {
      best = { rule, vendor, orderDay };
    }
  }
  return best;
}

/** PlanningParams plus the intermediate values the proposal and vendor-min logic need. */
export interface PlanningDetail extends PlanningParams {
  /** Mean forecast over orderDay..D2 measure day; used for COP, order-up-to, days of cover. */
  avgDailyForecast: number;
  rule: SourcingRule;
}

/**
 * MOP/COP/order-up-to and projection at D2 for an order placed with `vendor` on `orderDay`
 * (≥ today). The projection runs from today and includes all open orders, but not this order;
 * it may be negative (see below), unlike the displayed projection.
 */
export function computePlanning(
  state: GameState,
  loc: ItemLocation,
  rule: SourcingRule,
  vendor: Vendor,
  orderDay: Day,
  r: Rules = defaultRules,
): PlanningDetail {
  const { d1, d2 } = deliveryDates(vendor, orderDay);
  const measureDay = r.projection.measureAtD2 === 'before-d2-receipt' ? d2 - 1 : d2;

  const totals = forecastLocation(state, loc, state.today, measureDay, r).map((p) => p.total);
  // Lost sales are clamped only before D1: demand from D1 on is this order's to cover, so the
  // projection there runs unclamped and a negative projectedAtD2 is the deficit to fill.
  const proj = projectStock(
    loc.onHand,
    totals,
    receiptsByDay(state, loc, measureDay),
    r.projection.lostSales,
    d1 - state.today,
  );
  const projectedAtD2 = proj[proj.length - 1];
  const window = totals.slice(orderDay - state.today);
  const avgDailyForecast = window.reduce((a, b) => a + b, 0) / window.length;

  const safetyStock = Math.max(
    0,
    r.safetyStock({
      serviceLevel: loc.serviceLevel,
      forecastErrorStdDev: forecastErrorStdDev(loc.history, r),
      leadTimeDays: vendor.leadTimeDays,
      reviewPeriodDays: reviewPeriodDays(vendor, orderDay),
      avgDailyForecast,
    }),
  );
  const mustOrderPoint = safetyStock + loc.presentationStock;
  return {
    itemId: loc.itemId,
    depotId: loc.depotId,
    vendorId: vendor.id,
    orderDay,
    d1,
    d2,
    safetyStock,
    mustOrderPoint,
    canOrderPoint: mustOrderPoint + r.canOrderPoint.extraDaysOfCover * avgDailyForecast,
    orderUpTo: mustOrderPoint + r.orderUpToExtraDays * avgDailyForecast,
    projectedAtD2,
    avgDailyForecast,
    rule,
  };
}

/** Planning detail for an item-location at its next order opportunity; undefined if unsourced. */
export function planningDetail(state: GameState, loc: ItemLocation, r: Rules = defaultRules): PlanningDetail | undefined {
  const source = chooseSource(state, loc.itemId);
  return source && computePlanning(state, loc, source.rule, source.vendor, source.orderDay, r);
}

export function planningParams(
  state: GameState,
  itemId: ItemId,
  depotId: DepotId,
  r: Rules = defaultRules,
): PlanningParams | undefined {
  const detail = planningDetail(state, findLocation(state, itemId, depotId), r);
  if (!detail) return undefined;
  const { avgDailyForecast: _avg, rule: _rule, ...params } = detail;
  return params;
}

/** A proposal line plus what vendor-minimum fill needs to rank and grow it. */
export interface PlanLine {
  proposal: OrderProposal;
  avgDailyForecast: number;
  packSize: number;
  unitCost: number;
}

/** Proposal for a planning detail ordering today; undefined if projected stock is at/above COP. */
export function planLine(p: PlanningDetail, r: Rules = defaultRules): PlanLine | undefined {
  let reason: OrderProposal['reason'];
  let qty = 0;
  if (p.projectedAtD2 < p.mustOrderPoint) {
    reason = 'must';
    qty = roundToPack(p.orderUpTo - p.projectedAtD2, p.rule.packSize, r);
    if (qty === 0 && r.mustOrderMinOnePack) qty = Math.max(1, p.rule.packSize);
  } else if (p.projectedAtD2 < p.canOrderPoint) {
    reason = 'can';
  } else {
    return undefined;
  }
  return {
    proposal: {
      itemId: p.itemId,
      depotId: p.depotId,
      vendorId: p.vendorId,
      qty,
      reason,
      d1: p.d1,
      d2: p.d2,
      projectedAtD2: p.projectedAtD2,
      mustOrderPoint: p.mustOrderPoint,
      canOrderPoint: p.canOrderPoint,
      cost: qty * p.rule.unitCost,
    },
    avgDailyForecast: p.avgDailyForecast,
    packSize: p.rule.packSize,
    unitCost: p.rule.unitCost,
  };
}

/**
 * Raw proposals for today, before vendor-minimum fill: one line per item-location whose
 * next order opportunity is today and whose projection at D2 is below COP. `must` lines carry a qty;
 * `can` lines have qty 0 (candidates for vendor-minimum fill).
 */
export function generatePlanLines(state: GameState, r: Rules = defaultRules): PlanLine[] {
  const lines: PlanLine[] = [];
  for (const loc of state.locations) {
    const detail = planningDetail(state, loc, r);
    if (!detail || detail.orderDay !== state.today) continue;
    const line = planLine(detail, r);
    if (line) lines.push(line);
  }
  return lines;
}

/** Raw plan lines as proposals, including unfilled `can` lines (qty 0). Engine-internal; the
 *  player-facing list is GameState.proposals from refresh(), which drops qty-0 lines. */
export function generateProposals(state: GameState, r: Rules = defaultRules): OrderProposal[] {
  return generatePlanLines(state, r).map((l) => l.proposal);
}
