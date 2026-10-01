// Every tunable RELEX rule lives here. The spec is docs/RELEX_RULES.md — keep the two in sync.
// Engine modules read rules from this object; never hard-code a rule elsewhere.

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
  /** Must Order Point = safety stock + presentation stock (default). */
  safetyStock: (i: SafetyStockInput) => number;
  /** Can Order Point as a multiple over MOP, or extra days of cover. */
  canOrderPoint: { extraDaysOfCover: number };
  /** Order-up-to target at D2, expressed as days of cover above MOP. */
  orderUpToExtraDays: number;
  /** Rounding to pack size: 'up' always, or 'nearest' with a threshold (0–1 of a pack). */
  packRounding: { mode: 'up' } | { mode: 'nearest'; threshold: number };
  /** Baseline forecast method. */
  forecast: { method: 'moving-average'; window: number } | { method: 'exp-smoothing'; alpha: number };
  /** How battle-plan uplift combines with baseline. */
  eventBlend: 'multiply' | 'add';
  /** Vendor-minimum fill: rank candidates below COP by this. */
  vendorMinFillPriority: 'days-of-cover' | 'criticality';
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
  exceptions: {
    /** Flag forecast-deviation when |actual − forecast| / forecast exceeds this. */
    forecastDeviationPct: number;
  };
  /**
   * Spoilage fallback when ItemLocation.lots is absent (lot-based FIFO spoilage is M2):
   * stock beyond `shelfLifeDays` × baseline forecast cannot be sold in time under FIFO;
   * 1/shelfLifeDays of that excess spoils each day.
   */
  spoilage: { mode: 'cover-excess' };
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
  forecast: { method: 'moving-average', window: 14 },
  eventBlend: 'multiply',
  vendorMinFillPriority: 'days-of-cover',
  budget: { overspendTolerance: 0, overspendCarryPenalty: 1, moralePerOverspendPct: 0.5 },
  morale: { perUnitStockoutByCriticality: 0.05, dailyRecovery: 0.5 },
  projection: { measureAtD2: 'before-d2-receipt', lostSales: true },
  forecastError: { window: 14 },
  mustOrderMinOnePack: true,
  demand: { baseWindow: 28, noiseCv: 0.2 },
  exceptions: { forecastDeviationPct: 0.3 },
  spoilage: { mode: 'cover-excess' },
};
