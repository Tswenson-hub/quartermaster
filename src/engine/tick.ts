// Game loop: initGame, refresh (planning for today), placeOrders, tick (advance one day).
import { effectiveVendor, nextOrderDayFrom } from './calendar';
import { baselineFromHistory, forecastLocation } from './forecast';
import { projectLocation } from './projection';
import { appliesTo, generatePlanLines, roundToPack } from './replenishment';
import { isDc } from './dc';
import { actualDemand } from './demand';
import { coverDays, meanDailyForecast } from './kpi';
import { updateCareer } from './rank';
import { addLot, consume, expire, lotsOf } from './lots';
import { createRng, hashSeed, rngForDay } from './rng';
import { rules as defaultRules, type Rules } from './rules.config';
import type {
  GameSetup,
  Day,
  DeliveryRecord,
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
  'dc-short',
  'spoilage',
  'forecast-deviation',
  'delivery-late',
]);

/** Due date when placed: OpenOrder.promisedOn, else orderedOn + vendor lead time (legacy/fixtures). */
export function promisedOn(o: OpenOrder, state: GameState): Day {
  if (o.promisedOn !== undefined) return o.promisedOn;
  const vendor = state.vendors[o.vendorId];
  return vendor ? o.orderedOn + vendor.leadTimeDays : o.deliveryOn;
}

export function periodFor(periods: readonly FiscalPeriod[], day: Day): FiscalPeriod | undefined {
  return periods.find((p) => p.start <= day && day <= p.end);
}

/** Warm-up length: scenario.warmupDays ?? rules.warmup.days; a non-negative multiple of 7 (takeover on a Monday). */
export function warmupDays(scenario: Scenario, r: Rules = defaultRules): number {
  const w = scenario.warmupDays ?? r.warmup.days;
  if (!Number.isInteger(w) || w < 0 || w % 7 !== 0) {
    throw new Error(`Scenario ${scenario.id}: warm-up must be a non-negative multiple of 7 days, got ${w}`);
  }
  return w;
}

/**
 * Fiscal periods from day 0 over `totalDays` (warm-up + campaign): periodLengthDays each at
 * periodAllowance, a final period cut short getting a pro-rated allowance (same rule as content).
 */
function buildPeriods(scenario: Scenario, totalDays: number): FiscalPeriod[] {
  const len = Math.max(1, scenario.periodLengthDays);
  const periods: FiscalPeriod[] = [];
  for (let start = 0, index = 0; start < Math.max(1, totalDays); start += len, index++) {
    const end = Math.min(start + len, Math.max(1, totalDays)) - 1;
    const allowance = end - start + 1 === len ? scenario.periodAllowance : Math.round((scenario.periodAllowance * (end - start + 1)) / len / 10) * 10;
    periods.push({ index, start, end, allowance, committed: 0 });
  }
  return periods;
}

/**
 * Build the game and play the warm-up: for W = warmupDays(scenario) days the previous
 * quartermaster accepts every proposal (placeOrders, then tick). KPIs, deliveries and spend
 * accumulate; rank, letters and battles don't (tick skips career before startDay, so periods
 * that end during the warm-up earn no reprimand or merit; the period the player takes over in is
 * judged normally). Content's battle-plan days are relative to takeover and shift by W; fiscal
 * periods run from day 0. The player takes command on day W = startDay; lengthDays = W + length.
 */
export function initGame(scenario: Scenario, setup?: GameSetup, r: Rules = defaultRules): GameState {
  const { openOrders, rankLevel, ...initial } = scenario.initial;
  const W = warmupDays(scenario, r);
  const difficulty = setup?.difficulty ?? 'normal';
  // §11 difficulty: budget tightness scales every period's allowance.
  const budgetFactor = r.difficulty[difficulty].budgetFactor;
  // Periods run from day 0, so the warm-up's spend sits in the period the player inherits and
  // takeover falls part-way through it. Without a warm-up, content's own periods are used as given.
  const basePeriods = W === 0 && initial.periods.length > 0 ? initial.periods : buildPeriods(scenario, W + scenario.lengthDays);
  const periods = basePeriods.map((p) => ({ ...p, allowance: p.allowance * budgetFactor }));
  let state: GameState = {
    ...initial,
    battlePlans: initial.battlePlans.map((b) => ({
      ...b,
      announcedOn: b.announcedOn + W,
      start: b.start + W,
      end: b.end + W,
    })),
    today: 0,
    startDay: W,
    lengthDays: W + scenario.lengthDays,
    periods,
    // An opening order's promised date is the date the scenario gives it.
    openOrders: (openOrders ?? []).map((o) => ({ ...o, promisedOn: o.promisedOn ?? o.deliveryOn })),
    proposals: [],
    exceptions: [],
    kpis: [],
    difficulty,
    // Without a setup (tests): a flat market, factor 1 every day.
    market: setup?.market ?? {
      ticker: 'FLAT',
      source: 'snapshot',
      synthetic: true,
      firstDate: '',
      lastDate: '',
      values: Array<number>(W + scenario.lengthDays).fill(1),
    },
    vendorTriggers: {},
    vendorOrderDays: {},
    deliveries: [],
    vendorPlans: [],
    rank: { level: rankLevel ?? r.rank.startLevel, merit: 0, reprimands: 0, overspentStreak: 0 },
    letters: [],
    battles: [],
    status: 'playing',
  };
  state = refresh(state, r);
  for (let d = 0; d < W; d++) {
    const acceptAll = state.proposals.map((p, index) => ({ index, decision: p.qty > 0 ? ('accepted' as const) : ('rejected' as const) }));
    state = tick(placeOrders(state, acceptAll, r), r);
  }
  return { ...state, status: 'playing' };
}

/** Earliest day a new order could arrive for this item-location (any source). */
function earliestDelivery(state: GameState, loc: ItemLocation): Day | undefined {
  let best: Day | undefined;
  for (const s of state.sourcing) {
    if (!appliesTo(s, loc.itemId, loc.depotId)) continue;
    const v = effectiveVendor(state, s.vendorId);
    if (!v) continue;
    const d = nextOrderDayFrom(v, state.today) + v.leadTimeDays;
    if (best === undefined || d < best) best = d;
  }
  return best;
}

/** Recompute proposals and planning exceptions for today. No time passes; no RNG used. */
export function refresh(state: GameState, r: Rules = defaultRules): GameState {
  // Only lines with qty > 0: a non-must item appears only when the build pulls it in to
  // meet a vendor minimum (reason 'vendor-min-fill').
  const { proposals, vendorPlans, exceptions: minExceptions } = applyVendorMinimums(state, generatePlanLines(state, r), r);
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

  return { ...state, proposals, vendorPlans, exceptions };
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
  const shortages: PlanningException[] = [];
  // Transfers ship from DC stock at placement, so DC locations may change here.
  const locations = [...state.locations];
  let seq = state.openOrders.length;
  for (const d of decisions) {
    if (d.decision !== 'accepted') continue;
    const p = state.proposals[d.index];
    if (!p) continue;
    const vendor = state.vendors[p.vendorId];
    const source = state.sourcing.find((s) => s.itemId === p.itemId && s.vendorId === p.vendorId);
    if (!vendor || !source) continue;
    let qty = roundToPack(d.qty ?? p.qty, source.packSize, r);
    if (qty <= 0) continue;
    const transfer = vendor.dcDepotId !== undefined;
    if (transfer) {
      // A transfer ships min(qty, DC on hand), oldest lots first; a short ship raises dc-short.
      const i = locations.findIndex((l) => l.itemId === p.itemId && l.depotId === vendor.dcDepotId);
      const dc = i >= 0 ? locations[i] : undefined;
      const ship = Math.max(0, Math.min(qty, dc?.onHand ?? 0));
      if (ship < qty) {
        const unit = state.items[p.itemId]?.unit ?? 'units';
        shortages.push({
          kind: 'dc-short',
          day: state.today,
          itemId: p.itemId,
          depotId: p.depotId,
          vendorId: vendor.id,
          message:
            `${state.depots[vendor.dcDepotId!]?.name ?? vendor.dcDepotId} could ship only ${whole(ship)} of ${whole(qty)} ${unit} ` +
            `to ${state.depots[p.depotId]?.name ?? p.depotId}; ${whole(qty - ship)} short.`,
        });
      }
      if (dc && ship > 0) {
        const perishable = (state.items[dc.itemId]?.shelfLifeDays ?? 0) > 0;
        const next: ItemLocation = { ...dc, onHand: dc.onHand - ship };
        if (dc.lots || perishable) next.lots = consume(lotsOf(dc, state.today), ship).lots;
        locations[i] = next;
      }
      qty = ship;
      if (qty <= 0) continue;
    }
    newOrders.push({
      id: `o${state.today}-${seq++}-${p.itemId}-${p.depotId}-${p.vendorId}`,
      itemId: p.itemId,
      depotId: p.depotId,
      vendorId: p.vendorId,
      qty,
      orderedOn: state.today,
      deliveryOn: state.today + vendor.leadTimeDays,
      promisedOn: state.today + vendor.leadTimeDays,
      // Transfers cost nothing against the budget.
      cost: transfer ? 0 : qty * source.unitCost,
    });
  }
  const placed = newOrders;
  if (placed.length === 0 && shortages.length === 0) return state;

  const spend = placed.reduce((s, o) => s + o.cost, 0);
  const period = periodFor(state.periods, state.today);
  const periods = state.periods.map((p) => (p === period ? { ...p, committed: p.committed + spend } : p));
  return refresh(
    {
      ...state,
      locations,
      openOrders: [...state.openOrders, ...placed],
      periods,
      exceptions: [...state.exceptions, ...shortages],
    },
    r,
  );
}

/**
 * Advance one day. For day t = today, per item-location in order: receive deliveries due,
 * draw actual demand (demand.ts: base rate × market × actual uplift × noise), fulfil
 * (unmet demand is lost), spoil, accrue holding cost. Then morale, period-end budget
 * penalties, the day's KPI row, and career events (rank.ts). Returns state for t + 1 with
 * fresh proposals/exceptions. No-op once the game is no longer 'playing'.
 */
export function tick(state: GameState, r: Rules = defaultRules): GameState {
  if (state.status !== undefined && state.status !== 'playing') return state;
  const t = state.today;
  const rng = rngForDay(state.seed, t);
  const events: PlanningException[] = [];
  let morale = state.morale;
  const kpi = { day: t, demand: 0, fulfilled: 0, spoiled: 0, holdingCost: 0, spend: 0, forecast: 0, absError: 0, daysOfSupply: 0 };
  // Days of supply (§10): Σ end-of-day stock ÷ Σ mean daily forecast from tomorrow (as of this morning).
  let stockSum = 0;
  let forecastSum = 0;

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
    // Already pushed back past its promised date → it arrives now (one delay per order).
    if (!vendor || o.deliveryOn !== promisedOn(o, state) || fail < vendor.reliability || lateBy <= 0) {
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
  const deliveries: DeliveryRecord[] = [...(state.deliveries ?? [])];
  for (const o of orders) {
    if (o.deliveryOn > t) continue;
    deliveries.push({
      orderId: o.id,
      itemId: o.itemId,
      depotId: o.depotId,
      vendorId: o.vendorId,
      qty: o.qty,
      cost: o.cost,
      orderedOn: o.orderedOn,
      promisedOn: promisedOn(o, state),
      receivedOn: t,
    });
  }
  const openOrders = orders.filter((o) => o.deliveryOn > t);

  const locations = state.locations.map((loc) => {
    const item = state.items[loc.itemId];
    const received = orders
      .filter((o) => o.deliveryOn <= t && o.itemId === loc.itemId && o.depotId === loc.depotId)
      .reduce((s, o) => s + o.qty, 0);
    let stock = loc.onHand + received;

    const dc = isDc(state, loc.depotId);
    const forecastToday = dc ? 0 : forecastLocation(state, loc, t, t, r)[0].total;
    // A DC has no consumption of its own (one normal is still drawn, keeping the RNG stream per location).
    const demand = dc ? (rng.normal(), 0) : actualDemand(state, loc, t, rng, r);
    // A DC's "sales" are the transfers it shipped today (placed today against its lanes).
    const shipped = dc
      ? state.openOrders
          .filter((o) => o.orderedOn === t && o.itemId === loc.itemId && state.vendors[o.vendorId]?.dcDepotId === loc.depotId)
          .reduce((s, o) => s + o.qty, 0)
      : 0;

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

    // Army KPIs (service, forecast accuracy) cover front depots; DC stock counts toward days of supply.
    if (!dc) {
      kpi.forecast += forecastToday;
      kpi.absError += Math.abs(demand - forecastToday);
      forecastSum += meanDailyForecast(state, loc, t + 1, r);
    }
    stockSum += stock;
    kpi.demand += demand;
    kpi.fulfilled += fulfilled;
    kpi.spoiled += spoiled;
    kpi.holdingCost += stock * (item?.holdingCost ?? 0) * (dc ? r.dc.holdingCostFactor : 1);
    // fulfilled[d] is campaign day d; a location without it (older save) is back-filled as fully served.
    const pastFulfilled = loc.fulfilled ?? loc.history.slice(loc.history.length - t);
    const next: ItemLocation = {
      ...loc,
      onHand: stock,
      history: [...loc.history, dc ? shipped : demand],
      fulfilled: [...pastFulfilled, dc ? shipped : fulfilled],
    };
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
  // Stored rows are saved as JSON, so no Infinity: stock with no forecast at all records 0.
  kpi.daysOfSupply = coverDays(stockSum, forecastSum, 0);

  const kpis = [...state.kpis, kpi];
  // No rank, letters or battles during the warm-up (the previous quartermaster's days).
  const career =
    t < (state.startDay ?? 0)
      ? { rank: state.rank, letters: [], battles: [], status: state.status }
      : updateCareer(state, t, kpis, locations, period && period.end === t ? period : undefined, r);

  const next: GameState = {
    ...state,
    today: t + 1,
    locations,
    openOrders,
    deliveries,
    periods,
    morale,
    kpis,
    rank: career.rank,
    letters: [...state.letters, ...career.letters],
    battles: [...state.battles, ...career.battles],
    status: career.status,
    // dc-short is raised when orders are placed this morning; keep it through the night's tick.
    exceptions: [
      ...state.exceptions.filter((e) => e.kind === 'dc-short' && e.day === t),
      ...events.filter((e) => EVENT_KINDS.has(e.kind)),
    ],
  };
  const refreshed = refresh(next, r);
  // Keep period-close notices (refresh only re-derives over-budget for the open period).
  const closeNotices = events.filter((e) => !EVENT_KINDS.has(e.kind));
  return closeNotices.length ? { ...refreshed, exceptions: [...refreshed.exceptions, ...closeNotices] } : refreshed;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}
/** Whole units / coins for message text (the UI shows messages verbatim). */
function whole(n: number): number {
  return Math.round(n);
}
