// MOP, COP, order-up-to, pack rounding and order proposals (docs/RELEX_RULES.md §3–5, §7).
import { deliveryDates, isOrderDay, reviewPeriodDays } from './calendar';
import { forecastErrorStdDev, forecastLocation } from './forecast';
import { projectStock, receiptsByDay } from './projection';
import { rules as defaultRules, type Rules } from './rules.config';
import type { GameState, ItemLocation, OrderProposal, SourcingRule, Vendor } from './types';

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
 * Source for an item today (§7 default): the highest-priority vendor (lowest `priority`,
 * then vendorId) whose order day is today. Split sourcing is not applied yet.
 */
export function chooseSource(state: GameState, itemId: string): { rule: SourcingRule; vendor: Vendor } | undefined {
  const rules = state.sourcing
    .filter((s) => s.itemId === itemId && state.vendors[s.vendorId])
    .sort((a, b) => a.priority - b.priority || a.vendorId.localeCompare(b.vendorId));
  for (const rule of rules) {
    const vendor = state.vendors[rule.vendorId];
    if (isOrderDay(vendor, state.today)) return { rule, vendor };
  }
  return undefined;
}

/** Everything the replenishment rule computes for one item-location and source today. */
export interface PlanLine {
  proposal: OrderProposal;
  /** Mean forecast over today..D2 measure day, used for COP and days of cover. */
  avgDailyForecast: number;
  orderUpTo: number;
  safetyStock: number;
  packSize: number;
  unitCost: number;
}

/** Plan one item-location against a given source, ordering today. Returns undefined if above COP. */
export function planLine(
  state: GameState,
  loc: ItemLocation,
  rule: SourcingRule,
  vendor: Vendor,
  r: Rules = defaultRules,
): PlanLine | undefined {
  const today = state.today;
  const { d1, d2 } = deliveryDates(vendor, today);
  const measureDay = r.projection.measureAtD2 === 'before-d2-receipt' ? d2 - 1 : d2;

  const totals = forecastLocation(state, loc, today, measureDay, r).map((p) => p.total);
  const proj = projectStock(loc.onHand, totals, receiptsByDay(state, loc, measureDay), r.projection.lostSales);
  const projectedAtD2 = proj[proj.length - 1];
  const avgDailyForecast = totals.reduce((a, b) => a + b, 0) / totals.length;

  const safetyStock = Math.max(
    0,
    r.safetyStock({
      serviceLevel: loc.serviceLevel,
      forecastErrorStdDev: forecastErrorStdDev(loc.history, r),
      leadTimeDays: vendor.leadTimeDays,
      reviewPeriodDays: reviewPeriodDays(vendor, today),
      avgDailyForecast,
    }),
  );
  const mustOrderPoint = safetyStock + loc.presentationStock;
  const canOrderPoint = mustOrderPoint + r.canOrderPoint.extraDaysOfCover * avgDailyForecast;
  const orderUpTo = mustOrderPoint + r.orderUpToExtraDays * avgDailyForecast;

  let reason: OrderProposal['reason'];
  let qty = 0;
  if (projectedAtD2 < mustOrderPoint) {
    reason = 'must';
    qty = roundToPack(orderUpTo - projectedAtD2, rule.packSize, r);
    if (qty === 0 && r.mustOrderMinOnePack) qty = Math.max(1, rule.packSize);
  } else if (projectedAtD2 < canOrderPoint) {
    reason = 'can';
  } else {
    return undefined;
  }

  return {
    proposal: {
      itemId: loc.itemId,
      depotId: loc.depotId,
      vendorId: vendor.id,
      qty,
      reason,
      d1,
      d2,
      projectedAtD2,
      mustOrderPoint,
      canOrderPoint,
      cost: qty * rule.unitCost,
    },
    avgDailyForecast,
    orderUpTo,
    safetyStock,
    packSize: rule.packSize,
    unitCost: rule.unitCost,
  };
}

/**
 * Raw proposals for today, before vendor-minimum fill: one line per item-location whose
 * source orders today and whose projection at D2 is below COP. `must` lines carry a qty;
 * `can` lines have qty 0 (candidates for vendor-minimum fill).
 */
export function generatePlanLines(state: GameState, r: Rules = defaultRules): PlanLine[] {
  const lines: PlanLine[] = [];
  for (const loc of state.locations) {
    const source = chooseSource(state, loc.itemId);
    if (!source) continue;
    const line = planLine(state, loc, source.rule, source.vendor, r);
    if (line) lines.push(line);
  }
  return lines;
}

export function generateProposals(state: GameState, r: Rules = defaultRules): OrderProposal[] {
  return generatePlanLines(state, r).map((l) => l.proposal);
}
