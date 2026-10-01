// Game loop: initGame, refresh (planning for today), placeOrders, tick (advance one day).
import { nextOrderDayFrom } from './calendar';
import { baselineFromHistory, forecastLocation } from './forecast';
import { projectLocation } from './projection';
import { generatePlanLines, roundToPack } from './replenishment';
import { addLot, consume, expire, lotsOf } from './lots';
import { createRng, hashSeed, rngForDay } from './rng';
import { rules as defaultRules, type Rules } from './rules.config';
import type {
  GameSetup,
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
const EVENT_KINDS: ReadonlySet<ExceptionKind> = new Set([
  'stockout',
  'spoilage',
  'forecast-deviation',
  'delivery-late',
]);

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

export function initGame(scenario: Scenario, setup?: GameSetup, r: Rules = defaultRules): GameState {
  const { openOrders, rankLevel, ...initial } = scenario.initial;
  // TODO(engine): placeholder defaults added by lead with the M2 contract. Engine owns: allowance ×
  // rules.difficulty[d].budgetFactor, market-driven demand, vendorPlans, rank/letters/battles, status.
  const state: GameState = {
    ...initial,
    today: 0,
    periods: initial.periods.length > 0 ? initial.periods : buildPeriods(scenario),
    openOrders: openOrders ?? [],
    proposals: [],
    exceptions: [],
    kpis: [],
    difficulty: setup?.difficulty ?? 'normal',
    market: setup?.market ?? {
      ticker: 'FLAT',
      source: 'snapshot',
      synthetic: true,
      firstDate: '',
      lastDate: '',
      values: Array<number>(scenario.lengthDays).fill(1),
    },
    vendorTriggers: {},
    vendorPlans: [],
    rank: { level: rankLevel ?? r.rank.startLevel, merit: 0, reprimands: 0, overspentStreak: 0 },
    letters: [],
    battles: [],
    status: 'playing',
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
  // Only lines with qty > 0: a non-must item appears only when the build pulls it in to
  // meet a vendor minimum (reason 'vendor-min-fill').
  const { proposals, exceptions: minExceptions } = applyVendorMinimums(
    state,
    generatePlanLines(state, r),
    () => r.vendorMin.defaultOrderTrigger,
    r,
  );
  const exceptions: PlanningException[] = state.exceptions.filter((e) => EVENT_KINDS.has(e.kind));

  for (const p of proposals) {
    if (p.reason !== 'must') continue;
    exceptions.push({
      kind: 'below-mop',
      day: state.today,
      itemId: p.itemId,
      depotId: p.depotId,
      vendorId: p.vendorId,
      message: `Projected stock at D2 (day ${p.d2}) is ${whole(p.projectedAtD2)}, below the MOP of ${whole(p.mustOrderPoint)}.`,
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
      message: `Period ${period.index + 1}: committed ${whole(period.committed)} of ${whole(period.allowance)} silver allowance.`,
    });
  }

  return { ...state, proposals, exceptions };
}

/**
 * Turn accepted decisions into open orders placed today. Edited qty is rounded to the pack
 * size and cost recomputed; spend is committed to the current fiscal period. Rejected and
 * deferred lines are dropped. Vendor minimums are enforced when proposals are built (CO-MRP);
 * an accepted line is placed as decided. Proposals/exceptions are then refreshed
 * (accepted lines are now covered by open orders).
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
  const placed = newOrders;
  if (placed.length === 0) return state;

  const spend = placed.reduce((s, o) => s + o.cost, 0);
  const period = periodFor(state.periods, state.today);
  const periods = state.periods.map((p) => (p === period ? { ...p, committed: p.committed + spend } : p));
  return refresh({ ...state, openOrders: [...state.openOrders, ...placed], periods }, r);
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
  // TODO(engine): fill absError (Σ|A−F|) and daysOfSupply (§10); lead added them as 0 with the M2 contract.
  const kpi = { day: t, demand: 0, fulfilled: 0, spoiled: 0, holdingCost: 0, spend: 0, forecast: 0, absError: 0, daysOfSupply: 0 };

  for (const o of state.openOrders) if (o.orderedOn === t) kpi.spend += o.cost;

  // Deliveries due today fail on-time-in-full with probability 1 − reliability, once per
  // order (an order already pushed back arrives). Separate stream from demand noise.
  const deliveryRng = createRng(hashSeed(state.seed, t, 1));
  const { lateDaysMin, lateDaysMax } = r.delivery;
  const orders = state.openOrders.map((o) => {
    if (o.deliveryOn !== t) return o;
    const fail = deliveryRng.next();
    const lateBy = lateDaysMin + Math.floor(deliveryRng.next() * (lateDaysMax - lateDaysMin + 1));
    const vendor = state.vendors[o.vendorId];
    if (!vendor || o.deliveryOn !== o.orderedOn + vendor.leadTimeDays || fail < vendor.reliability || lateBy <= 0) {
      return o;
    }
    events.push({
      kind: 'delivery-late',
      day: t,
      itemId: o.itemId,
      depotId: o.depotId,
      vendorId: o.vendorId,
      message: `${vendor.name}'s carts are delayed: ${o.qty} ${state.items[o.itemId]?.unit ?? 'units'} now due day ${t + lateBy}.`,
    });
    return { ...o, deliveryOn: t + lateBy };
  });
  const openOrders = orders.filter((o) => o.deliveryOn > t);

  const locations = state.locations.map((loc) => {
    const item = state.items[loc.itemId];
    const received = orders
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

    const useLots = item?.shelfLifeDays !== undefined && item.shelfLifeDays > 0 && r.spoilage.mode === 'lots';
    let lots = useLots || loc.lots ? addLot(lotsOf(loc, t), received, t) : undefined;

    const fulfilled = Math.min(stock, demand);
    stock -= fulfilled;
    if (lots) lots = consume(lots, fulfilled).lots;
    const short = demand - fulfilled;
    morale -= short * (item?.criticality ?? 1) * r.morale.perUnitStockoutByCriticality;

    let spoiled = 0;
    if (useLots && lots) {
      const expired = expire(lots, t, item!.shelfLifeDays!);
      lots = expired.lots;
      spoiled = expired.spoiled;
      stock -= spoiled;
    } else if (item?.shelfLifeDays !== undefined && item.shelfLifeDays > 0) {
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
        message: `Actual demand ${demand} vs forecast ${whole(forecastToday)}.`,
      });
    }
    if (short > 0) {
      events.push({
        kind: 'stockout',
        day: t,
        itemId: loc.itemId,
        depotId: loc.depotId,
        message: `Ran out: ${short} of ${demand} ${item?.unit ?? 'units'} demanded went unmet.`,
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

    kpi.forecast += forecastToday;
    kpi.demand += demand;
    kpi.fulfilled += fulfilled;
    kpi.spoiled += spoiled;
    kpi.holdingCost += stock * (item?.holdingCost ?? 0);
    const next: ItemLocation = { ...loc, onHand: stock, history: [...loc.history, demand] };
    if (lots) next.lots = lots;
    return next;
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
        message: `Period ${period.index + 1} closed ${whole(overspend)} silver over allowance; the treasury docks next period.`,
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
/** Whole units / coins for message text (the UI shows messages verbatim). */
function whole(n: number): number {
  return Math.round(n);
}
