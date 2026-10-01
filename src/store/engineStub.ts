// Minimal stand-in for the real engine so the store and UI can run before the engine
// branch lands. Deliberately simple (moving average, must-orders only, priority sourcing).
// Replaced by src/engine/index.ts in src/store/engine.ts — do not build features on it.

import { rules } from '../engine/rules.config';
import type {
  Day,
  DepotId,
  EngineApi,
  FiscalPeriod,
  ForecastPoint,
  GameState,
  ItemId,
  ItemLocation,
  OpenOrder,
  OrderProposal,
  PlanningException,
  ProposalDecisionInput,
  Scenario,
  SourcingRule,
  Vendor,
} from '../engine/types';

const WINDOW = 14;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function findLoc(state: GameState, itemId: ItemId, depotId: DepotId): ItemLocation {
  const loc = state.locations.find((l) => l.itemId === itemId && l.depotId === depotId);
  if (!loc) throw new Error(`No location ${itemId}@${depotId}`);
  return loc;
}

function recent(loc: ItemLocation): number[] {
  return loc.history.slice(-WINDOW);
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function stdDev(xs: number[]): number {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

function nextOrderDay(vendor: Vendor, after: Day): Day {
  for (let d = after + 1; d <= after + 7; d++) {
    if (vendor.orderDays.includes((d % 7) as Vendor['orderDays'][number])) return d;
  }
  return after + 7;
}

function isOrderDay(vendor: Vendor, day: Day): boolean {
  return vendor.orderDays.includes((day % 7) as Vendor['orderDays'][number]);
}

const forecast: EngineApi['forecast'] = (state, itemId, depotId, from, to) => {
  const loc = findLoc(state, itemId, depotId);
  const baseline = mean(recent(loc));
  const points: ForecastPoint[] = [];
  for (let day = from; day <= to; day++) {
    let eventUplift = 0;
    for (const bp of state.battlePlans) {
      const factor = bp.statedUplift[itemId];
      if (factor === undefined || bp.announcedOn > state.today) continue;
      if (day < bp.start || day > bp.end || !bp.depotIds.includes(depotId)) continue;
      eventUplift += baseline * (factor - 1);
    }
    let total = baseline + eventUplift;
    let override: number | undefined;
    for (const o of state.overrides) {
      if (o.itemId !== itemId || o.depotId !== depotId || day < o.from || day > o.to) continue;
      override = o.mode === 'absolute' ? o.value : total * o.value;
      total = override;
    }
    points.push({ day, baseline, eventUplift, override, total });
  }
  return points;
};

const project: EngineApi['project'] = (state, itemId, depotId, from, to) => {
  const loc = findLoc(state, itemId, depotId);
  const fc = forecast(state, itemId, depotId, state.today, to);
  const out: number[] = [];
  let stock = loc.onHand;
  for (let day = state.today; day <= to; day++) {
    for (const o of state.openOrders) {
      if (o.itemId === itemId && o.depotId === depotId && o.deliveryOn === day) stock += o.qty;
    }
    stock -= fc[day - state.today].total;
    if (day >= from) out.push(stock);
  }
  return out;
};

const planningParams: EngineApi['planningParams'] = (state, itemId, depotId) => {
  const loc = findLoc(state, itemId, depotId);
  const t = state.today;
  // Earliest order opportunity from today across sources; ties go to the preferred (lowest priority).
  let best: { source: SourcingRule; orderDay: Day } | undefined;
  for (const source of state.sourcing.filter((s) => s.itemId === itemId)) {
    const vendor = state.vendors[source.vendorId];
    if (!vendor || vendor.orderDays.length === 0) continue;
    const orderDay = isOrderDay(vendor, t) ? t : nextOrderDay(vendor, t);
    if (!best || orderDay < best.orderDay || (orderDay === best.orderDay && source.priority < best.source.priority)) {
      best = { source, orderDay };
    }
  }
  if (!best) return undefined;
  const vendor = state.vendors[best.source.vendorId];
  const next = nextOrderDay(vendor, best.orderDay);
  const d1 = best.orderDay + vendor.leadTimeDays;
  const d2 = next + vendor.leadTimeDays;
  const avg = mean(recent(loc));
  const safetyStock = rules.safetyStock({
    serviceLevel: loc.serviceLevel,
    forecastErrorStdDev: stdDev(recent(loc)),
    leadTimeDays: vendor.leadTimeDays,
    reviewPeriodDays: next - best.orderDay,
    avgDailyForecast: avg,
  });
  const mustOrderPoint = safetyStock + loc.presentationStock;
  return {
    itemId,
    depotId,
    vendorId: vendor.id,
    orderDay: best.orderDay,
    d1,
    d2,
    safetyStock,
    mustOrderPoint,
    canOrderPoint: mustOrderPoint + rules.canOrderPoint.extraDaysOfCover * avg,
    orderUpTo: mustOrderPoint + rules.orderUpToExtraDays * avg,
    // Measured at end of D2 − 1, just before the next order's delivery (RELEX_RULES §2).
    projectedAtD2: project(state, itemId, depotId, d2 - 1, d2 - 1)[0],
  };
};

function proposalsFor(state: GameState): { proposals: OrderProposal[]; exceptions: PlanningException[] } {
  const proposals: OrderProposal[] = [];
  const exceptions: PlanningException[] = [];
  const t = state.today;
  for (const loc of state.locations) {
    const pp = planningParams(state, loc.itemId, loc.depotId);
    if (!pp || pp.orderDay !== t || pp.projectedAtD2 >= pp.mustOrderPoint) continue;
    const source = state.sourcing.find((s) => s.itemId === loc.itemId && s.vendorId === pp.vendorId)!;
    const qty = Math.ceil((pp.orderUpTo - pp.projectedAtD2) / source.packSize) * source.packSize;
    proposals.push({
      itemId: loc.itemId,
      depotId: loc.depotId,
      vendorId: pp.vendorId,
      qty,
      reason: 'must',
      d1: pp.d1,
      d2: pp.d2,
      projectedAtD2: pp.projectedAtD2,
      mustOrderPoint: pp.mustOrderPoint,
      canOrderPoint: pp.canOrderPoint,
      cost: qty * source.unitCost,
    });
    exceptions.push({
      kind: 'below-mop',
      day: t,
      itemId: loc.itemId,
      depotId: loc.depotId,
      vendorId: pp.vendorId,
      message: `${state.items[loc.itemId]?.name ?? loc.itemId} falls below MOP by day ${pp.d2 - 1}`,
    });
  }
  return { proposals, exceptions };
}

const refresh: EngineApi['refresh'] = (state) => ({ ...state, ...proposalsFor(state) });

function buildPeriods(s: Scenario): FiscalPeriod[] {
  const periods: FiscalPeriod[] = [];
  for (let i = 0, start = 0; start < s.lengthDays; i++, start += s.periodLengthDays) {
    periods.push({ index: i, start, end: start + s.periodLengthDays - 1, allowance: s.periodAllowance, committed: 0 });
  }
  return periods;
}

const initGame: EngineApi['initGame'] = (scenario) => {
  const { openOrders, ...initial } = scenario.initial;
  return refresh({
    ...structuredClone(initial),
    periods: initial.periods.length ? structuredClone(initial.periods) : buildPeriods(scenario),
    today: 0,
    openOrders: structuredClone(openOrders ?? []),
    proposals: [],
    exceptions: [],
    kpis: [],
  });
};

const placeOrders: EngineApi['placeOrders'] = (state, decisions: ProposalDecisionInput[]) => {
  const newOrders: OpenOrder[] = [];
  for (const d of decisions) {
    const p = state.proposals[d.index];
    if (!p || d.decision !== 'accepted') continue;
    const rule = state.sourcing.find((s) => s.itemId === p.itemId && s.vendorId === p.vendorId);
    const pack = rule?.packSize ?? 1;
    const qty = Math.ceil((d.qty ?? p.qty) / pack) * pack;
    if (qty <= 0) continue;
    newOrders.push({
      id: `o${state.today}-${d.index}`,
      itemId: p.itemId,
      depotId: p.depotId,
      vendorId: p.vendorId,
      qty,
      orderedOn: state.today,
      deliveryOn: p.d1,
      cost: qty * (rule?.unitCost ?? 0),
    });
  }
  const spend = newOrders.reduce((a, o) => a + o.cost, 0);
  return {
    ...state,
    openOrders: [...state.openOrders, ...newOrders],
    periods: state.periods.map((p) =>
      state.today >= p.start && state.today <= p.end ? { ...p, committed: p.committed + spend } : p,
    ),
  };
};

const tick: EngineApi['tick'] = (state) => {
  const t = state.today;
  const rand = mulberry32(state.seed * 7919 + t);
  let demandSum = 0;
  let fulfilledSum = 0;
  let holding = 0;
  let stockoutPenalty = 0;
  const locations = state.locations.map((loc) => {
    let onHand = loc.onHand;
    for (const o of state.openOrders) {
      if (o.itemId === loc.itemId && o.depotId === loc.depotId && o.deliveryOn === t) onHand += o.qty;
    }
    const expected = forecast(state, loc.itemId, loc.depotId, t, t)[0].total;
    const demand = Math.max(0, Math.round(expected * (0.8 + 0.4 * rand())));
    const fulfilled = Math.min(onHand, demand);
    onHand -= fulfilled;
    demandSum += demand;
    fulfilledSum += fulfilled;
    holding += onHand * (state.items[loc.itemId]?.holdingCost ?? 0);
    stockoutPenalty +=
      (demand - fulfilled) * (state.items[loc.itemId]?.criticality ?? 1) * rules.morale.perUnitStockoutByCriticality;
    return { ...loc, onHand, history: [...loc.history, demand] };
  });
  const spend = state.openOrders.filter((o) => o.orderedOn === t).reduce((a, o) => a + o.cost, 0);
  const morale = Math.max(0, Math.min(100, state.morale - stockoutPenalty + rules.morale.dailyRecovery));
  return refresh({
    ...state,
    today: t + 1,
    locations,
    openOrders: state.openOrders.filter((o) => o.deliveryOn > t),
    kpis: [...state.kpis, { day: t, demand: demandSum, fulfilled: fulfilledSum, spoiled: 0, holdingCost: holding, spend }],
    morale,
  });
};

export const stubEngine: EngineApi = { initGame, refresh, forecast, planningParams, project, placeOrders, tick };
