// Game loop: initGame, refresh (planning for today), placeOrders, tick (advance one day).
import { nextOrderDayFrom } from './calendar';
import { baselineFromHistory, forecastLocation } from './forecast';
import { projectLocation } from './projection';
import { generatePlanLines, roundToPack } from './replenishment';
import { rngForDay } from './rng';
import { rules as defaultRules, type Rules } from './rules.config';
import type {
  Day,
  ExceptionKind,
  FiscalPeriod,
  GameState,
  ItemLocation,
  OpenOrder,
  PlanningException,
  ProposalDecisionInput,
  Scenario,
} from './types';
import { applyVendorMinimums } from './vendorMin';

/** Exceptions describing what happened during the last tick; refresh() keeps them. */
const EVENT_KINDS: ReadonlySet<ExceptionKind> = new Set(['spoilage', 'forecast-deviation', 'delivery-late']);

export function periodFor(periods: readonly FiscalPeriod[], day: Day): FiscalPeriod | undefined {
  return periods.find((p) => p.start <= day && day <= p.end);
}

function buildPeriods(scenario: Scenario): FiscalPeriod[] {
  const len = Math.max(1, scenario.periodLengthDays);
  const count = Math.max(1, Math.ceil(scenario.lengthDays / len));
  return Array.from({ length: count }, (_, index) => ({
    index,
    start: index * len,
    end: index * len + len - 1,
    allowance: scenario.periodAllowance,
    committed: 0,
  }));
}

export function initGame(scenario: Scenario, r: Rules = defaultRules): GameState {
  const { openOrders, ...initial } = scenario.initial;
  const state: GameState = {
    ...initial,
    today: 0,
    periods: initial.periods.length > 0 ? initial.periods : buildPeriods(scenario),
    openOrders: openOrders ?? [],
    proposals: [],
    exceptions: [],
    kpis: [],
  };
  return refresh(state, r);
}

/** Earliest day a new order could arrive for this item-location (any source). */
function earliestDelivery(state: GameState, loc: ItemLocation): Day | undefined {
  let best: Day | undefined;
  for (const s of state.sourcing) {
    const v = state.vendors[s.vendorId];
    if (s.itemId !== loc.itemId || !v || v.orderDays.length === 0) continue;
    const d = nextOrderDayFrom(v, state.today) + v.leadTimeDays;
    if (best === undefined || d < best) best = d;
  }
  return best;
}

/** Recompute proposals and planning exceptions for today. No time passes; no RNG used. */
export function refresh(state: GameState, r: Rules = defaultRules): GameState {
  const { lines, exceptions: minExceptions } = applyVendorMinimums(state, generatePlanLines(state, r), r);
  const proposals = lines.map((l) => l.proposal);
  const exceptions: PlanningException[] = state.exceptions.filter((e) => EVENT_KINDS.has(e.kind));

  for (const p of proposals) {
    if (p.reason !== 'must') continue;
    exceptions.push({
      kind: 'below-mop',
      day: state.today,
      itemId: p.itemId,
      depotId: p.depotId,
      vendorId: p.vendorId,
      message: `Projected stock at D2 (day ${p.d2}) is ${round2(p.projectedAtD2)}, below the MOP of ${round2(p.mustOrderPoint)}.`,
    });
  }

  // Stockout risk: projected to run dry before any new order could arrive.
  for (const loc of state.locations) {
    const arrival = earliestDelivery(state, loc);
    const horizon = (arrival ?? state.today + 7) - 1;
    if (horizon < state.today) continue;
    const proj = projectLocation(state, loc, horizon, r);
    const dryIdx = proj.findIndex((s) => s <= 0);
    const fc = forecastLocation(state, loc, state.today, horizon, r);
    if (dryIdx >= 0 && fc[dryIdx].total > 0) {
      exceptions.push({
        kind: 'stockout-risk',
        day: state.today,
        itemId: loc.itemId,
        depotId: loc.depotId,
        message: `Projected to run out on day ${state.today + dryIdx}, before the next possible delivery${arrival === undefined ? '' : ` (day ${arrival})`}.`,
      });
    }
  }

  exceptions.push(...minExceptions);

  const period = periodFor(state.periods, state.today);
  if (period && period.committed > period.allowance * (1 + r.budget.overspendTolerance)) {
    exceptions.push({
      kind: 'over-budget',
      day: state.today,
      message: `Period ${period.index + 1}: committed ${round2(period.committed)} of ${period.allowance} silver allowance.`,
    });
  }

  return { ...state, proposals, exceptions };
}

/**
 * Turn accepted decisions into open orders placed today. Edited qty is rounded to the pack
 * size and cost recomputed; spend is committed to the current fiscal period. Rejected and
 * deferred lines are dropped. Proposals/exceptions are then refreshed (accepted lines are
 * now covered by open orders).
 */
export function placeOrders(state: GameState, decisions: ProposalDecisionInput[], r: Rules = defaultRules): GameState {
  const newOrders: OpenOrder[] = [];
  let seq = state.openOrders.length;
  for (const d of decisions) {
    if (d.decision !== 'accepted') continue;
    const p = state.proposals[d.index];
    if (!p) continue;
    const vendor = state.vendors[p.vendorId];
    const source = state.sourcing.find((s) => s.itemId === p.itemId && s.vendorId === p.vendorId);
    if (!vendor || !source) continue;
    const qty = roundToPack(d.qty ?? p.qty, source.packSize, r);
    if (qty <= 0) continue;
    newOrders.push({
      id: `o${state.today}-${seq++}-${p.itemId}-${p.depotId}-${p.vendorId}`,
      itemId: p.itemId,
      depotId: p.depotId,
      vendorId: p.vendorId,
      qty,
      orderedOn: state.today,
      deliveryOn: state.today + vendor.leadTimeDays,
      cost: qty * source.unitCost,
    });
  }
  if (newOrders.length === 0) return state;

  const spend = newOrders.reduce((s, o) => s + o.cost, 0);
  const period = periodFor(state.periods, state.today);
  const periods = state.periods.map((p) => (p === period ? { ...p, committed: p.committed + spend } : p));
  return refresh({ ...state, openOrders: [...state.openOrders, ...newOrders], periods }, r);
}

/**
 * Advance one day. For day t = today, per item-location in order: receive deliveries due,
 * draw actual demand (history rate × actual battle-plan uplift × seeded noise), fulfil
 * (unmet demand is lost), spoil, accrue holding cost. Then morale, period-end budget
 * penalties and the day's KPI row. Returns state for t + 1 with fresh proposals/exceptions.
 */
export function tick(state: GameState, r: Rules = defaultRules): GameState {
  const t = state.today;
  const rng = rngForDay(state.seed, t);
  const events: PlanningException[] = [];
  let morale = state.morale;
  const kpi = { day: t, demand: 0, fulfilled: 0, spoiled: 0, holdingCost: 0, spend: 0 };

  for (const o of state.openOrders) if (o.orderedOn === t) kpi.spend += o.cost;
  const openOrders = state.openOrders.filter((o) => o.deliveryOn > t);

  const locations = state.locations.map((loc) => {
    const item = state.items[loc.itemId];
    const received = state.openOrders
      .filter((o) => o.deliveryOn <= t && o.itemId === loc.itemId && o.depotId === loc.depotId)
      .reduce((s, o) => s + o.qty, 0);
    let stock = loc.onHand + received;

    const forecastToday = forecastLocation(state, loc, t, t, r)[0].total;
    const rate = loc.history.length === 0 ? 0 : mean(loc.history.slice(-r.demand.baseWindow));
    const uplift = state.battlePlans
      .filter((p) => p.start <= t && t <= p.end && p.depotIds.includes(loc.depotId))
      .reduce((f, p) => f * (p.actualUplift[loc.itemId] ?? 1), 1);
    const noise = rng.normal(); // always drawn, so the sequence doesn't depend on parameters
    const demand = Math.max(0, Math.round(rate * uplift * (1 + r.demand.noiseCv * noise)));

    const fulfilled = Math.min(stock, demand);
    stock -= fulfilled;
    const short = demand - fulfilled;
    morale -= short * (item?.criticality ?? 1) * r.morale.perUnitStockoutByCriticality;

    let spoiled = 0;
    if (item?.shelfLifeDays !== undefined && item.shelfLifeDays > 0) {
      const sellable = baselineFromHistory(loc.history, r) * item.shelfLifeDays;
      const excess = stock - sellable;
      if (excess > 0) spoiled = Math.min(stock, Math.ceil(excess / item.shelfLifeDays));
      stock -= spoiled;
    }

    if (forecastToday > 0 && Math.abs(demand - forecastToday) / forecastToday > r.exceptions.forecastDeviationPct) {
      events.push({
        kind: 'forecast-deviation',
        day: t,
        itemId: loc.itemId,
        depotId: loc.depotId,
        message: `Actual demand ${demand} vs forecast ${round2(forecastToday)}.`,
      });
    }
    if (spoiled > 0) {
      events.push({
        kind: 'spoilage',
        day: t,
        itemId: loc.itemId,
        depotId: loc.depotId,
        message: `${spoiled} ${item?.unit ?? 'units'} spoiled.`,
      });
    }

    kpi.demand += demand;
    kpi.fulfilled += fulfilled;
    kpi.spoiled += spoiled;
    kpi.holdingCost += stock * (item?.holdingCost ?? 0);
    return { ...loc, onHand: stock, history: [...loc.history, demand] };
  });

  // Period close: overspend reduces next period's allowance and costs morale.
  let periods = state.periods;
  const period = periodFor(periods, t);
  if (period && period.end === t) {
    const overspend = period.committed - period.allowance;
    if (overspend > period.allowance * r.budget.overspendTolerance && overspend > 0) {
      const pct = period.allowance > 0 ? (overspend / period.allowance) * 100 : 100;
      morale -= pct * r.budget.moralePerOverspendPct;
      periods = periods.map((p) =>
        p.index === period.index + 1
          ? { ...p, allowance: Math.max(0, p.allowance - overspend * r.budget.overspendCarryPenalty) }
          : p,
      );
      events.push({
        kind: 'over-budget',
        day: t,
        message: `Period ${period.index + 1} closed ${round2(overspend)} silver over allowance; the treasury docks next period.`,
      });
    }
  }

  morale = clamp(morale + r.morale.dailyRecovery, 0, 100);

  const next: GameState = {
    ...state,
    today: t + 1,
    locations,
    openOrders,
    periods,
    morale,
    kpis: [...state.kpis, kpi],
    exceptions: events.filter((e) => EVENT_KINDS.has(e.kind)),
  };
  const refreshed = refresh(next, r);
  // Keep period-close notices (refresh only re-derives over-budget for the open period).
  const closeNotices = events.filter((e) => !EVENT_KINDS.has(e.kind));
  return closeNotices.length ? { ...refreshed, exceptions: [...refreshed.exceptions, ...closeNotices] } : refreshed;
}

function mean(xs: readonly number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}
function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
