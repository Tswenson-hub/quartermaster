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

/** On hand ÷ mean daily forecast over the next horizon days. No forecast → Infinity (0 if no stock). */
export function daysOfSupply(state: GameState, loc: ItemLocation, r: Rules = defaultRules): number {
  const h = Math.max(1, r.kpi.daysOfSupplyHorizon);
  const avg = sum(forecastLocation(state, loc, state.today, state.today + h - 1, r).map((p) => p.total)) / h;
  if (avg <= 0) return loc.onHand > 0 ? Infinity : 0;
  return loc.onHand / avg;
}

export interface KpiSummary {
  serviceLevel: number;
  /** Mean days of supply over item-locations with a forecast. */
  daysOfSupply: number;
  spoiled: number;
  holdingCost: number;
  /** From the daily KPI rows (forecast vs demand, summed over locations). */
  swape: number;
  bias: number;
}

/** Campaign-to-date KPIs; `lastDays` limits the KPI rows used (e.g. 28 for the current period). */
export function kpiSummary(state: GameState, lastDays?: number, r: Rules = defaultRules): KpiSummary {
  const rows = lastDays === undefined ? state.kpis : state.kpis.slice(-lastDays);
  const withForecast = rows.filter((k) => k.forecast !== undefined);
  const dos = state.locations.map((l) => daysOfSupply(state, l, r)).filter((d) => Number.isFinite(d));
  return {
    serviceLevel: serviceLevel(rows),
    daysOfSupply: dos.length === 0 ? 0 : sum(dos) / dos.length,
    spoiled: sum(rows.map((k) => k.spoiled)),
    holdingCost: sum(rows.map((k) => k.holdingCost)),
    swape: swape(withForecast.map((k) => k.demand), withForecast.map((k) => k.forecast!)),
    bias: bias(withForecast.map((k) => k.demand), withForecast.map((k) => k.forecast!)),
  };
}
