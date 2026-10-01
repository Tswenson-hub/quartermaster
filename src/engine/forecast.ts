// Forecast: baseline + battle-plan uplift + player overrides (docs/RELEX_RULES.md §8).
import { rules as defaultRules, type Rules } from './rules.config';
import type { Day, DepotId, ForecastPoint, GameState, ItemId, ItemLocation } from './types';

/**
 * One-step-ahead baselines: out[i] is the baseline forecast for history[i] made from
 * history[0..i) (out[0] = 0, no history). out[history.length] is the forecast for today.
 * Single pass for exponential smoothing.
 */
export function oneStepBaselines(history: readonly number[], r: Rules = defaultRules): number[] {
  const f = r.forecast;
  const out: number[] = [0];
  if (f.method === 'moving-average') {
    for (let i = 1; i <= history.length; i++) {
      const tail = history.slice(Math.max(0, i - f.window), i);
      out.push(tail.reduce((a, b) => a + b, 0) / tail.length);
    }
    return out;
  }
  // Running mean while initialising, then smoothing.
  const k = Math.max(1, f.initWindow);
  let sum = 0;
  let level = 0;
  for (let i = 0; i < history.length; i++) {
    if (i < k) {
      sum += history[i];
      level = sum / (i + 1);
    } else {
      level = f.alpha * history[i] + (1 - f.alpha) * level;
    }
    out.push(level);
  }
  return out;
}

/** Flat baseline for today from history (oldest first). Empty history → 0. */
export function baselineFromHistory(history: readonly number[], r: Rules = defaultRules): number {
  const out = oneStepBaselines(history, r);
  return out[out.length - 1];
}

/**
 * σ(forecast error): RMSE of one-step-ahead baseline forecasts over the last
 * `rules.forecastError.window` days of history. Fewer than 2 points of history → 0.
 */
export function forecastErrorStdDev(history: readonly number[], r: Rules = defaultRules): number {
  const f = oneStepBaselines(history, r);
  const start = Math.max(1, history.length - r.forecastError.window);
  let sumSq = 0;
  let n = 0;
  for (let i = start; i < history.length; i++) {
    const e = history[i] - f[i];
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
  // One-step baselines over the whole history: entry i is the forecast for the day
  // (len − i) days before today; the last entry is today's (and every future day's) baseline.
  const steps = oneStepBaselines(loc.history, r);
  const baselineOn = (day: Day): number => {
    if (day >= state.today) return steps[steps.length - 1];
    return steps[Math.max(0, steps.length - 1 - (state.today - day))];
  };
  const overrides = state.overrides.filter((o) => o.itemId === loc.itemId && o.depotId === loc.depotId);
  for (let day = from; day <= to; day++) {
    const asOf = Math.min(day, state.today);
    const baseline = baselineOn(day);

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

    // A player override IS the forecast on its days (§8). Overlaps: the last one wins.
    let override: number | undefined;
    for (const o of overrides) {
      if (day < o.from || day > o.to) continue;
      if (o.mode === 'absolute') override = o.value;
      else if (o.mode === 'factor') override = (baseline + eventUplift) * o.value;
      else override = aggregateShare(o.value, o.from, o.to, day, baselineOn);
    }

    const total = Math.max(0, override ?? baseline + eventUplift);
    points.push(override === undefined ? { day, baseline, eventUplift, total } : { day, baseline, eventUplift, override, total });
  }
  return points;
}

/**
 * 'aggregate' override: `total` over from..to broken out in proportion to each day's baseline
 * (evenly if the baseline is zero throughout).
 */
function aggregateShare(total: number, from: Day, to: Day, day: Day, baselineOn: (d: Day) => number): number {
  let sum = 0;
  for (let d = from; d <= to; d++) sum += baselineOn(d);
  const days = to - from + 1;
  return sum > 0 ? (total * baselineOn(day)) / sum : total / days;
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
