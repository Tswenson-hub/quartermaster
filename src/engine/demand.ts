// Actual demand (hidden from the player): base rate × market factor × actual battle-plan
// uplift × seeded noise (docs/RELEX_RULES.md §11).
import type { Rng } from './rng';
import { rules as defaultRules, type Rules } from './rules.config';
import type { Day, GameState, ItemLocation, MarketSignal } from './types';

const mean = (xs: readonly number[]) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);

/**
 * Market factor for game day `day` (see rules.market):
 * clamp((close[d] ÷ mean)^sensitivity × (1 + returnGain × ln(close[d] ÷ close[d−1])), min, max).
 * Day 0 has no return. Days past the series reuse the last close. No usable series → 1.
 */
export function marketFactor(market: MarketSignal | undefined, day: Day, r: Rules = defaultRules): number {
  const values = market?.values ?? [];
  if (values.length === 0) return 1;
  const avg = mean(values);
  if (!(avg > 0)) return 1;
  const at = (d: number) => values[Math.min(Math.max(0, d), values.length - 1)];
  const close = at(day);
  const prev = at(day - 1);
  const dailyReturn = day > 0 && prev > 0 && close > 0 ? Math.log(close / prev) : 0;
  const { sensitivity, returnGain, minFactor, maxFactor } = r.market;
  const factor = (close / avg) ** sensitivity * (1 + returnGain * dailyReturn);
  return Math.min(maxFactor, Math.max(minFactor, factor));
}

/**
 * Base daily rate: mean of the last `rules.demand.baseWindow` days of PRE-CAMPAIGN history
 * (entries before day 0), so market swings and battle surges don't feed back into the base.
 * No pre-campaign history → mean of the whole history.
 */
export function baseRate(loc: ItemLocation, today: Day, r: Rules = defaultRules): number {
  const pre = loc.history.slice(0, Math.max(0, loc.history.length - today));
  return mean((pre.length > 0 ? pre : loc.history).slice(-r.demand.baseWindow));
}

/** Product of actual (hidden) battle-plan uplifts active on `day` at this location. */
export function actualUplift(state: GameState, loc: ItemLocation, day: Day): number {
  return state.battlePlans
    .filter((p) => p.start <= day && day <= p.end && p.depotIds.includes(loc.depotId))
    .reduce((f, p) => f * (p.actualUplift[loc.itemId] ?? 1), 1);
}

/** Whole-unit actual demand for one item-location on day t. Draws exactly one normal. */
export function actualDemand(state: GameState, loc: ItemLocation, t: Day, rng: Rng, r: Rules = defaultRules): number {
  const noise = rng.normal(); // always drawn, so the sequence doesn't depend on parameters
  const rate = baseRate(loc, t, r) * marketFactor(state.market, t, r) * actualUplift(state, loc, t);
  return Math.max(0, Math.round(rate * (1 + r.demand.noiseCv * noise)));
}
