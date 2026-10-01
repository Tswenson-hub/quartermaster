// KPIs (docs/RELEX_RULES.md §10): service level, days of supply, spoilage, SWAPE, bias.
import { forecastLocation } from './forecast';
import { rules as defaultRules, type Rules } from './rules.config';
import type { DailyKpi, GameState, ItemLocation } from './types';

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

/** Fulfilled ÷ demand. No demand → 1. */
export function serviceLevel(kpis: readonly DailyKpi[]): number {
  const demand = sum(kpis.map((k) => k.demand));
  return demand === 0 ? 1 : sum(kpis.map((k) => k.fulfilled)) / demand;
}

/**
 * SWAPE (sum-weighted absolute percentage error) = Σ|A − F| ÷ ΣA.
 * ΣA = 0 → 0 if every forecast was 0 too, else Infinity.
 */
export function swape(actual: readonly number[], forecast: readonly number[]): number {
  const a = sum(actual);
  const err = sum(actual.map((x, i) => Math.abs(x - (forecast[i] ?? 0))));
  if (a === 0) return err === 0 ? 0 : Infinity;
  return err / a;
}

/** Bias = (ΣF − ΣA) ÷ ΣA. Positive = over-forecast. ΣA = 0 → 0 if ΣF = 0, else Infinity. */
export function bias(actual: readonly number[], forecast: readonly number[]): number {
  const a = sum(actual);
  const f = sum(forecast.slice(0, actual.length));
  if (a === 0) return f === 0 ? 0 : Infinity;
  return (f - a) / a;
}

/** Mean daily forecast over `rules.kpi.daysOfSupplyHorizon` days starting at `from`. */
export function meanDailyForecast(state: GameState, loc: ItemLocation, from: number, r: Rules = defaultRules): number {
  const h = Math.max(1, r.kpi.daysOfSupplyHorizon);
  return sum(forecastLocation(state, loc, from, from + h - 1, r).map((p) => p.total)) / h;
}

/** Stock ÷ mean daily forecast. No forecast → `noForecast` if there is stock, else 0. */
export function coverDays(onHand: number, meanForecast: number, noForecast = Infinity): number {
  if (meanForecast <= 0) return onHand > 0 ? noForecast : 0;
  return onHand / meanForecast;
}

/** One item-location: on hand ÷ its mean daily forecast from today. No forecast → Infinity (0 if no stock). */
export function daysOfSupply(state: GameState, loc: ItemLocation, r: Rules = defaultRules): number {
  return coverDays(loc.onHand, meanDailyForecast(state, loc, state.today, r));
}

/**
 * Days of supply over all locations (§10): Σ on hand ÷ Σ mean daily forecast — not a mean of
 * per-location ratios, so one near-zero forecast can't dominate.
 */
export function totalDaysOfSupply(state: GameState, r: Rules = defaultRules): number {
  return coverDays(
    sum(state.locations.map((l) => l.onHand)),
    sum(state.locations.map((l) => meanDailyForecast(state, l, state.today, r))),
  );
}

function ratio(num: number, den: number): number {
  if (den === 0) return num === 0 ? 0 : Infinity;
  return num / den;
}

export interface KpiSummary {
  serviceLevel: number;
  /** Σ on hand ÷ Σ mean daily forecast, all locations, as of today (Infinity: stock but no forecast). */
  daysOfSupply: number;
  spoiled: number;
  holdingCost: number;
  /** Σ absError ÷ Σ demand over the KPI rows (per-location errors, so they don't cancel). */
  swape: number;
  /** (Σ forecast − Σ demand) ÷ Σ demand. Positive = over-forecast. */
  bias: number;
}

/** Campaign-to-date KPIs; `lastDays` limits the KPI rows used (e.g. 28 for the current period). */
export function kpiSummary(state: GameState, lastDays?: number, r: Rules = defaultRules): KpiSummary {
  const rows = lastDays === undefined ? state.kpis : state.kpis.slice(-lastDays);
  return {
    serviceLevel: serviceLevel(rows),
    daysOfSupply: totalDaysOfSupply(state, r),
    spoiled: sum(rows.map((k) => k.spoiled)),
    holdingCost: sum(rows.map((k) => k.holdingCost)),
    swape: ratio(sum(rows.map((k) => k.absError)), sum(rows.map((k) => k.demand))),
    bias: bias(rows.map((k) => k.demand), rows.map((k) => k.forecast)),
  };
}
