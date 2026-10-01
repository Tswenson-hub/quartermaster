// Read-only views over GameState for the UI. UI calls these instead of importing the engine.
import type {
  Day,
  DepotId,
  Difficulty,
  ForecastPoint,
  GameState,
  ItemId,
  OpenOrder,
  PlanningException,
  PlanningParams,
  ProposalDecisionInput,
} from '../engine/types';
import type { DecisionEntry } from './gameStore';
import { kpiSummary, type KpiSummary } from '../engine/kpi';
import { rules } from '../engine/rules.config';
import { engine } from './engine';

export function selectForecast(game: GameState, itemId: ItemId, depotId: DepotId, from: Day, to: Day): ForecastPoint[] {
  return engine.forecast(game, itemId, depotId, from, to);
}

/** MOP/COP/D1/D2 at the next order opportunity, for drawing reference lines on days with no proposal. */
export function selectPlanningParams(game: GameState, itemId: ItemId, depotId: DepotId): PlanningParams | undefined {
  return engine.planningParams(game, itemId, depotId);
}

/** Day whose end-of-day projection is compared to the MOP: d2 − 1 or d2, per rules.projection.measureAtD2. */
export function selectD2CheckDay(params: Pick<PlanningParams, 'd2'>): Day {
  return rules.projection.measureAtD2 === 'before-d2-receipt' ? params.d2 - 1 : params.d2;
}

/** Projected end-of-day stock, index 0 = `from`. `from` must be ≥ game.today. */
export function selectProjection(game: GameState, itemId: ItemId, depotId: DepotId, from: Day, to: Day): number[] {
  return engine.project(game, itemId, depotId, from, to);
}

export function selectCurrentPeriod(game: GameState) {
  return game.periods.find((p) => game.today >= p.start && game.today <= p.end);
}

export function selectExceptionsToday(game: GameState): PlanningException[] {
  return game.exceptions.filter((e) => e.day === game.today);
}

/** Service level so far = fulfilled / demand over all ticked days, 0–1. 1 when there has been no demand. */
export function selectServiceLevel(game: GameState): number {
  const demand = game.kpis.reduce((a, k) => a + k.demand, 0);
  const fulfilled = game.kpis.reduce((a, k) => a + k.fulfilled, 0);
  return demand === 0 ? 1 : fulfilled / demand;
}

export interface DecisionPreview {
  /** Orders that would be placed if the day ended now (surcharges included in cost). */
  orders: OpenOrder[];
  /** Total value of those orders, incl. surcharges. */
  spend: number;
  /** @deprecated Always 0 once the engine drops the surcharge path (RELEX_RULES §4). */
  surcharges: number;
  /** Indices of accepted proposals the engine would drop (e.g. below vendor minimum with no surcharge). */
  dropped: number[];
}

/**
 * What ending the day would order, computed by the engine's own placeOrders on today's decisions.
 * Use this for pending spend / minimum / surcharge displays instead of re-deriving vendor rules in UI.
 */
export function selectDecisionPreview(game: GameState, decisions: Record<number, DecisionEntry>): DecisionPreview {
  const inputs: ProposalDecisionInput[] = Object.entries(decisions).map(([i, d]) => ({ index: Number(i), ...d }));
  const before = new Set(game.openOrders.map((o) => o.id));
  const orders = engine.placeOrders(game, inputs).openOrders.filter((o) => !before.has(o.id));
  const placed = new Set(orders.map((o) => `${o.itemId}|${o.depotId}|${o.vendorId}`));
  const dropped = inputs
    .filter((d) => d.decision === 'accepted')
    .map((d) => d.index)
    .filter((i) => {
      const p = game.proposals[i];
      return p && !placed.has(`${p.itemId}|${p.depotId}|${p.vendorId}`);
    });
  return {
    orders,
    spend: orders.reduce((a, o) => a + o.cost, 0),
    surcharges: orders.reduce((a, o) => a + (o.surcharge ?? 0), 0),
    dropped,
  };
}

export type { KpiSummary };

/**
 * Campaign KPIs (RELEX_RULES §10): service level, days of supply, spoilage, holding cost, SWAPE, bias.
 * Computed by the engine. `lastDays` limits the KPI rows used (e.g. 28 for the current period).
 */
export function selectKpiSummary(game: GameState, lastDays?: number): KpiSummary {
  return kpiSummary(game, lastDays);
}

export interface DifficultyOption {
  id: Difficulty;
  label: string;
  ticker: string;
  budgetFactor: number;
}

/** Difficulty choices for the new-game screen (rules.difficulty). */
export function selectDifficultyOptions(): DifficultyOption[] {
  return (Object.keys(rules.difficulty) as Difficulty[]).map((id) => ({ id, ...rules.difficulty[id] }));
}

/** Where today's demand signal comes from, for display. */
export function selectMarketInfo(game: GameState) {
  const { ticker, source, synthetic, firstDate, lastDate } = game.market;
  return { ticker, source, synthetic: !!synthetic, firstDate, lastDate };
}
