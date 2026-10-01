// Every tunable RELEX rule lives here. The spec is docs/RELEX_RULES.md — keep the two in sync.
// Engine modules read rules from this object; never hard-code a rule elsewhere.

import type { Difficulty } from './types';

export interface SafetyStockInput {
  serviceLevel: number;
  /** Std-dev of daily forecast error. */
  forecastErrorStdDev: number;
  leadTimeDays: number;
  /** Days between order opportunities. */
  reviewPeriodDays: number;
  avgDailyForecast: number;
}

export interface Rules {
  /** Statistical safety stock (§3). MOP = max(safety stock, ItemLocation.minimumFill). */
  safetyStock: (i: SafetyStockInput) => number;
  /** Can Order Point as a multiple over MOP, or extra days of cover. */
  canOrderPoint: { extraDaysOfCover: number };
  /** Order-up-to target at D2, expressed as days of cover above MOP. */
  orderUpToExtraDays: number;
  /** Rounding to pack size: 'up' always, or 'nearest' with a threshold (0–1 of a pack). */
  packRounding: { mode: 'up' } | { mode: 'nearest'; threshold: number };
  /**
   * Baseline forecast method (§8). Simple exponential smoothing (default): the level starts as
   * the mean of the first `initWindow` days, then level ← alpha × actual + (1 − alpha) × level.
   */
  forecast:
    | { method: 'moving-average'; window: number }
    | { method: 'exp-smoothing'; alpha: number; initWindow: number };
  /** How battle-plan uplift combines with baseline. */
  eventBlend: 'multiply' | 'add';
  budget: {
    /** Fraction of allowance over which penalties start. */
    overspendTolerance: number;
    /** Next period's allowance reduced by this × overspend. */
    overspendCarryPenalty: number;
    moralePerOverspendPct: number;
  };
  morale: {
    perUnitStockoutByCriticality: number;
    dailyRecovery: number;
  };
  /** §2 projection conventions. */
  projection: {
    /**
     * Where proj[D2] is read. 'before-d2-receipt' = end of day D2 − 1 (spec default);
     * 'end-of-d2' = end of D2 including the D2 receipt and D2's forecast.
     */
    measureAtD2: 'before-d2-receipt' | 'end-of-d2';
    /** Unmet demand is lost (stock clamps at 0) rather than backordered (stock goes negative). */
    lostSales: boolean;
  };
  /** §3 σ(forecast error): RMSE of one-step-ahead baseline forecasts over the last `window` days. */
  forecastError: { window: number };
  /** A must order that rounds to 0 packs still orders one pack. */
  mustOrderMinOnePack: boolean;
  /** Actual demand generator (hidden from the player). */
  demand: {
    /** Underlying rate = mean of the last `baseWindow` days of history. */
    baseWindow: number;
    /** Noise: sd = noiseCv × rate (normal, clamped ≥ 0, rounded to whole units). */
    noiseCv: number;
  };
  /** §10 KPIs. Days of supply = on hand ÷ mean daily forecast over the next `daysOfSupplyHorizon` days. */
  kpi: { daysOfSupplyHorizon: number };
  exceptions: {
    /** Flag forecast-deviation when |actual − forecast| / forecast exceeds this. */
    forecastDeviationPct: number;
  };
  /**
   * Perishables. 'lots': stock is tracked in FIFO lots (ItemLocation.lots; missing lots are
   * treated as received today); a lot spoils at the end of its shelfLifeDays-th day on hand.
   * 'cover-excess': no lots — stock beyond `shelfLifeDays` × baseline forecast cannot be sold
   * in time under FIFO, and 1/shelfLifeDays of that excess spoils each day.
   */
  spoilage: { mode: 'lots' | 'cover-excess' };
  /**
   * Deliveries fail (on-time-in-full) with probability 1 − Vendor.reliability, drawn once per
   * order on its due day. A failed order arrives lateDaysMin..lateDaysMax days late, in full.
   */
  delivery: { lateDaysMin: number; lateDaysMax: number };
  /**
   * §4/§6 vendor minimum order trigger. If real need ÷ minimum ≥ trigger, build the order up to the
   * minimum one pack at a time (item with lowest projected days of cover at D2, re-ranked after each
   * pack); below the trigger, no proposal for that vendor. Default trigger when the vendor sets none.
   */
  vendorMinimum: {
    defaultTrigger: number;
    /** Greatest need = lowest projected days of cover at D2 (default), or highest criticality first. */
    buildPriority: 'days-of-cover' | 'criticality';
    /** Safety valve on the build loop. */
    maxPacks: number;
  };
  /**
   * §11 market-driven demand. Each day's demand rate = base rate × factor, where
   * factor = clamp((close[d] ÷ mean(close)) ^ sensitivity, minFactor, maxFactor), then seeded noise.
   */
  market: { sensitivity: number; minFactor: number; maxFactor: number };
  /** §11 difficulty: market ticker (volatility) and budget tightness (allowance × budgetFactor). */
  difficulty: Record<Difficulty, { ticker: string; label: string; budgetFactor: number }>;
  /** §9/§11 rank, reprimands, promotions, battles. */
  rank: {
    startLevel: number;
    /** Highest level (titles 0..maxLevel come from content). */
    maxLevel: number;
    /** A period over budget by more than this fraction of allowance earns a letter of reprimand. */
    reprimandOverspendPct: number;
    /** This many reprimands → demotion (reprimands reset). */
    reprimandsPerDemotion: number;
    /** Merit for a period on budget with service level ≥ meritServiceLevel. */
    meritPerGoodPeriod: number;
    meritServiceLevel: number;
    meritPerBattleWon: number;
    /** Merit needed for a promotion (merit resets). */
    promotionMerit: number;
    /** Service level to a battle plan's depots during its window needed to win the battle. */
    battleWinServiceLevel: number;
    /** A lost battle costs this many levels. */
    levelsLostPerBattle: number;
  };
}

/** Inverse standard normal approximation (Acklam) — good enough for service-level z. */
export function zScore(p: number): number {
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
  const q = Math.min(Math.max(p, 1e-6), 1 - 1e-6);
  if (q < 0.02425) {
    const r = Math.sqrt(-2 * Math.log(q));
    return (((((c[0] * r + c[1]) * r + c[2]) * r + c[3]) * r + c[4]) * r + c[5]) / ((((d[0] * r + d[1]) * r + d[2]) * r + d[3]) * r + 1);
  }
  if (q > 1 - 0.02425) return -zScore(1 - q);
  const r = q - 0.5;
  const s = r * r;
  return ((((((a[0] * s + a[1]) * s + a[2]) * s + a[3]) * s + a[4]) * s + a[5]) * r) / (((((b[0] * s + b[1]) * s + b[2]) * s + b[3]) * s + b[4]) * s + 1);
}

export const rules: Rules = {
  safetyStock: ({ serviceLevel, forecastErrorStdDev, leadTimeDays, reviewPeriodDays }) =>
    Math.ceil(zScore(serviceLevel) * forecastErrorStdDev * Math.sqrt(leadTimeDays + reviewPeriodDays)),
  canOrderPoint: { extraDaysOfCover: 3 },
  orderUpToExtraDays: 0,
  packRounding: { mode: 'up' },
  forecast: { method: 'exp-smoothing', alpha: 0.2, initWindow: 7 },
  eventBlend: 'multiply',
  budget: { overspendTolerance: 0, overspendCarryPenalty: 1, moralePerOverspendPct: 0.5 },
  morale: { perUnitStockoutByCriticality: 0.05, dailyRecovery: 0.5 },
  projection: { measureAtD2: 'before-d2-receipt', lostSales: true },
  forecastError: { window: 14 },
  mustOrderMinOnePack: true,
  demand: { baseWindow: 28, noiseCv: 0.2 },
  kpi: { daysOfSupplyHorizon: 7 },
  exceptions: { forecastDeviationPct: 0.3 },
  spoilage: { mode: 'lots' },
  delivery: { lateDaysMin: 1, lateDaysMax: 2 },
  vendorMinimum: { defaultTrigger: 0.5, buildPriority: 'days-of-cover', maxPacks: 10000 },
  market: { sensitivity: 1.5, minFactor: 0.5, maxFactor: 1.8 },
  difficulty: {
    easy: { ticker: 'KO', label: 'Garrison duty', budgetFactor: 1.15 },
    normal: { ticker: 'AAPL', label: 'Field campaign', budgetFactor: 1 },
    hard: { ticker: 'TSLA', label: 'Winter siege', budgetFactor: 0.85 },
  },
  rank: {
    startLevel: 2,
    maxLevel: 6,
    reprimandOverspendPct: 0.05,
    reprimandsPerDemotion: 2,
    meritPerGoodPeriod: 1,
    meritServiceLevel: 0.95,
    meritPerBattleWon: 2,
    promotionMerit: 3,
    battleWinServiceLevel: 0.9,
    levelsLostPerBattle: 1,
  },
};
