import { describe, expect, it } from 'vitest';
import { baselineFromHistory, forecast, forecastErrorStdDev, oneStepBaselines } from '../../src/engine/forecast';
import { rules, type Rules } from '../../src/engine/rules.config';
import type { BattlePlan } from '../../src/engine/types';
import { flat, loc, state } from './fixtures';

const plan = (extra: Partial<BattlePlan> = {}): BattlePlan => ({
  id: 'siege',
  title: 'Siege',
  letter: '',
  announcedOn: 0,
  start: 2,
  end: 4,
  depotIds: ['camp'],
  statedUplift: { grain: 1.5 },
  actualUplift: { grain: 2 },
  ...extra,
});

describe('baseline', () => {
  it('default is simple exponential smoothing', () => {
    expect(rules.forecast).toEqual({ method: 'exp-smoothing', alpha: 0.2, initWindow: 7 });
    expect(baselineFromHistory([])).toBe(0);
    expect(baselineFromHistory(flat(10, 30))).toBe(10);
  });

  it('SES: level starts at the mean of the first initWindow days, then smooths', () => {
    const r: Rules = { ...rules, forecast: { method: 'exp-smoothing', alpha: 0.5, initWindow: 2 } };
    expect(baselineFromHistory([10], r)).toBe(10);
    expect(baselineFromHistory([10, 20], r)).toBe(15); // mean of first 2
    expect(baselineFromHistory([10, 20, 30], r)).toBe(22.5); // 0.5×30 + 0.5×15
    expect(baselineFromHistory([10, 20, 30, 40], r)).toBe(31.25); // 0.5×40 + 0.5×22.5
    expect(oneStepBaselines([10, 20, 30, 40], r)).toEqual([0, 10, 15, 22.5, 31.25]);
  });

  it('SES default α = 0.2: a jump of 10 moves the level by 2', () => {
    expect(baselineFromHistory([...flat(10, 7), 20])).toBeCloseTo(12, 10);
    expect(baselineFromHistory([...flat(10, 7), 20, 20])).toBeCloseTo(13.6, 10); // 0.2×20 + 0.8×12
  });

  it('14-day moving average (alternative) uses only the last 14 days', () => {
    const ma: Rules = { ...rules, forecast: { method: 'moving-average', window: 14 } };
    expect(baselineFromHistory([...flat(20, 7), ...flat(10)], ma)).toBe(10);
    expect(baselineFromHistory([4, 6], ma)).toBe(5);
  });

  it('σ(forecast error) = RMSE of one-step-ahead forecasts', () => {
    // Forecasts for days 1..3 are 10, 10, 10; errors 0, 0, 10 → sqrt(100/3).
    expect(forecastErrorStdDev([10, 10, 10, 20])).toBeCloseTo(Math.sqrt(100 / 3), 10);
    expect(forecastErrorStdDev(flat(10))).toBe(0);
    expect(forecastErrorStdDev([7])).toBe(0);
  });
});

describe('forecast', () => {
  it('flat baseline with no events', () => {
    const f = forecast(state(), 'grain', 'camp', 0, 2);
    expect(f.map((p) => p.total)).toEqual([10, 10, 10]);
    expect(f[0]).toEqual({ day: 0, baseline: 10, eventUplift: 0, total: 10 });
  });

  it('battle plan: stated uplift 1.5 on days 2–4 → +5/day (actual uplift stays hidden)', () => {
    const f = forecast(state({ battlePlans: [plan()] }), 'grain', 'camp', 1, 5);
    expect(f.map((p) => p.eventUplift)).toEqual([0, 5, 5, 5, 0]);
    expect(f.map((p) => p.total)).toEqual([10, 15, 15, 15, 10]);
  });

  it('unannounced plans do not affect the forecast', () => {
    const f = forecast(state({ battlePlans: [plan({ announcedOn: 1 })] }), 'grain', 'camp', 2, 2);
    expect(f[0].total).toBe(10);
  });

  it('plans for other depots or items are ignored; stacked plans multiply', () => {
    const plans = [plan(), plan({ id: 'b', statedUplift: { grain: 2 } }), plan({ id: 'c', depotIds: ['north'] })];
    expect(forecast(state({ battlePlans: plans }), 'grain', 'camp', 2, 2)[0].total).toBe(30);
  });

  it("eventBlend 'add' treats stated uplift as extra units/day", () => {
    const r: Rules = { ...rules, eventBlend: 'add' };
    const f = forecast(state({ battlePlans: [plan({ statedUplift: { grain: 3 } })] }), 'grain', 'camp', 2, 2, r);
    expect(f[0]).toMatchObject({ eventUplift: 3, total: 13 });
  });

  it('overrides: absolute replaces, factor scales baseline + uplift, last one wins', () => {
    const s = state({
      battlePlans: [plan()],
      overrides: [
        { itemId: 'grain', depotId: 'camp', from: 3, to: 5, mode: 'factor', value: 2 },
        { itemId: 'grain', depotId: 'camp', from: 5, to: 5, mode: 'absolute', value: 25 },
      ],
    });
    const f = forecast(s, 'grain', 'camp', 2, 6);
    expect(f.map((p) => p.total)).toEqual([15, 30, 30, 25, 10]);
    expect(f[1].override).toBe(30);
    expect(f[0].override).toBeUndefined();
  });

  it('past days use the baseline as of that day', () => {
    // Today = day 2; days 0 and 1 had demand 20. Day 0 was forecast from flat 10 history.
    const s = state({ today: 2, locations: [loc('grain', { history: [...flat(10), 20, 20] })] });
    const f = forecast(s, 'grain', 'camp', 0, 2);
    expect(f[0].baseline).toBe(10);
    expect(f[1].baseline).toBeCloseTo(12, 10); // 0.2×20 + 0.8×10
    expect(f[2].baseline).toBeCloseTo(13.6, 10); // 0.2×20 + 0.8×12
  });

  it('throws for an unknown item-location', () => {
    expect(() => forecast(state(), 'salt', 'camp', 0, 0)).toThrow();
  });
});
