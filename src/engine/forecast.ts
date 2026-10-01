// Forecast: baseline + battle-plan uplift + player overrides (docs/RELEX_RULES.md §8).
import { rules as defaultRules, type Rules } from './rules.config';
import type { Day, DepotId, ForecastPoint, GameState, ItemId, ItemLocation } from './types';

/** Flat baseline from history (oldest first). Empty history → 0. */
export function baselineFromHistory(history: readonly number[], r: Rules = defaultRules): number {
  if (history.length === 0) return 0;
  const f = r.forecast;
  if (f.method === 'moving-average') {
    const tail = history.slice(-f.window);
    return tail.reduce((a, b) => a + b, 0) / tail.length;
  }
  let level = history[0];
  for (let i = 1; i < history.length; i++) level = f.alpha * history[i] + (1 - f.alpha) * level;
  return level;
}

/**
 * σ(forecast error): RMSE of one-step-ahead baseline forecasts over the last
 * `rules.forecastError.window` days of history. Fewer than 2 points of history → 0.
 */
export function forecastErrorStdDev(history: readonly number[], r: Rules = defaultRules): number {
  const start = Math.max(1, history.length - r.forecastError.window);
  let sumSq = 0;
  let n = 0;
  for (let i = start; i < history.length; i++) {
    const e = history[i] - baselineFromHistory(history.slice(0, i), r);
    sumSq += e * e;
    n++;
  }
  return n === 0 ? 0 : Math.sqrt(sumSq / n);
}

export function findLocation(state: GameState, itemId: ItemId, depotId: DepotId): ItemLocation {
  const loc = state.locations.find((l) => l.itemId === itemId && l.depotId === depotId);
  if (!loc) throw new Error(`No item-location ${itemId}@${depotId}`);
  return loc;
}

/** History as it stood on the morning of `asOf` (≤ today). */
function historyAsOf(loc: ItemLocation, today: Day, asOf: Day): readonly number[] {
  const drop = today - asOf;
  return drop <= 0 ? loc.history : loc.history.slice(0, Math.max(0, loc.history.length - drop));
}

/**
 * Daily forecast for days from..to inclusive. Future days use the baseline as of today;
 * past days use the one-step-ahead baseline as of that day (for forecast-vs-actual charts).
 * Only battle plans already announced (as of that day) contribute uplift — the stated one.
 */
export function forecastLocation(
  state: GameState,
  loc: ItemLocation,
  from: Day,
  to: Day,
  r: Rules = defaultRules,
): ForecastPoint[] {
  const points: ForecastPoint[] = [];
  const todayBaseline = baselineFromHistory(loc.history, r);
  for (let day = from; day <= to; day++) {
    const asOf = Math.min(day, state.today);
    const baseline = day >= state.today ? todayBaseline : baselineFromHistory(historyAsOf(loc, state.today, day), r);

    const plans = state.battlePlans.filter(
      (p) =>
        p.announcedOn <= asOf &&
        p.start <= day &&
        day <= p.end &&
        p.depotIds.includes(loc.depotId) &&
        p.statedUplift[loc.itemId] !== undefined,
    );
    let eventUplift: number;
    if (r.eventBlend === 'multiply') {
      const factor = plans.reduce((f, p) => f * p.statedUplift[loc.itemId], 1);
      eventUplift = baseline * (factor - 1);
    } else {
      eventUplift = plans.reduce((s, p) => s + p.statedUplift[loc.itemId], 0);
    }

    // Overlapping overrides: the last one in the list wins.
    let override: number | undefined;
    for (const o of state.overrides) {
      if (o.itemId !== loc.itemId || o.depotId !== loc.depotId || day < o.from || day > o.to) continue;
      override = o.mode === 'absolute' ? o.value : (baseline + eventUplift) * o.value;
    }

    const total = Math.max(0, override ?? baseline + eventUplift);
    points.push(override === undefined ? { day, baseline, eventUplift, total } : { day, baseline, eventUplift, override, total });
  }
  return points;
}

export function forecast(
  state: GameState,
  itemId: ItemId,
  depotId: DepotId,
  from: Day,
  to: Day,
  r: Rules = defaultRules,
): ForecastPoint[] {
  return forecastLocation(state, findLocation(state, itemId, depotId), from, to, r);
}
