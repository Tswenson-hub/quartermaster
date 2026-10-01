import type { DepotId, ItemId } from '../engine/types';

// Deterministic pre-campaign demand history. No Math.random: every series is derived from
// (seed, itemId, depotId) via a small seeded PRNG, so content is identical on every import.

/** Weekday multipliers, index 0 = Monday. Each averages to 1. */
export const WEEKDAY_PROFILES = {
  flat: [1, 1, 1, 1, 1, 1, 1],
  /** Drill and skirmish days early in the week; the Sabbath is quiet. */
  drill: [1.15, 1.2, 1.1, 1.15, 1.1, 0.85, 0.45],
  /** Ale flows on Friday nights and feast-Sundays. */
  revel: [0.8, 0.8, 0.85, 0.9, 1.2, 1.3, 1.15],
  /** Farriers work six days. */
  workweek: [1.15, 1.15, 1.15, 1.15, 1.15, 1.25, 0.0],
} as const;

export type WeekdayProfile = keyof typeof WEEKDAY_PROFILES;

export interface DemandSpec {
  /** Mean units per day. */
  mean: number;
  /** Coefficient of variation of daily demand (noise). Ignored for slow movers (Poisson). */
  cv: number;
  profile: WeekdayProfile;
  /** Fractional change in mean across the history window (e.g. 0.2 = rising 20%). */
  trend?: number;
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 — small, fast, good enough for content generation. */
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

/** Standard-normal sample via Box–Muller. */
function gaussian(rng: () => number): number {
  const u = Math.max(rng(), 1e-12);
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Poisson sample (Knuth) — used for slow movers, where rounded Gaussian noise would bias to zero. */
function poisson(rng: () => number, lambda: number): number {
  const limit = Math.exp(-lambda);
  let k = 0;
  let p = rng();
  while (p > limit) {
    k++;
    p *= rng();
  }
  return k;
}

/** Below this mean daily demand, history is Poisson (intermittent) rather than Gaussian. */
const SLOW_MOVER_MEAN = 3;

/**
 * Generate `days` of history, oldest first; the last entry is the day before day 0.
 * `days` should be a multiple of 7 so history[i] falls on weekday i % 7 (day 0 = Monday).
 */
export function generateHistory(
  seed: number,
  itemId: ItemId,
  depotId: DepotId,
  spec: DemandSpec,
  days = 56,
): number[] {
  const rng = mulberry32(hashString(`${seed}:${itemId}:${depotId}`));
  const profile = WEEKDAY_PROFILES[spec.profile];
  const trend = spec.trend ?? 0;
  const out: number[] = [];
  // Weekday of the oldest entry so that the last entry lands on Sunday (day −1).
  const startWeekday = (((-days) % 7) + 7) % 7;
  for (let i = 0; i < days; i++) {
    const progress = days > 1 ? i / (days - 1) : 1;
    // Trend ends at the stated mean on the eve of the campaign.
    const level = spec.mean * (1 - trend * (1 - progress));
    const expected = level * profile[(startWeekday + i) % 7];
    if (spec.mean < SLOW_MOVER_MEAN) {
      out.push(poisson(rng, expected));
    } else {
      const noisy = expected * (1 + spec.cv * gaussian(rng));
      out.push(Math.max(0, Math.round(noisy)));
    }
  }
  return out;
}
