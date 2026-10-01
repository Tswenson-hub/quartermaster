import { describe, expect, it } from 'vitest';
import { bias, daysOfSupply, kpiSummary, serviceLevel, swape } from '../../src/engine/kpi';
import type { DailyKpi } from '../../src/engine/types';
import { loc, state } from './fixtures';

const row = (day: number, demand: number, fulfilled: number, forecast: number, spoiled = 0, absError = Math.abs(demand - forecast)): DailyKpi => ({
  day,
  demand,
  fulfilled,
  spoiled,
  holdingCost: 1,
  spend: 0,
  forecast,
  absError,
  daysOfSupply: 0,
});

describe('KPI functions', () => {
  it('SWAPE = Σ|A − F| / ΣA', () => {
    // A = 10, 20, 30; F = 12, 15, 30 → (2 + 5 + 0) / 60
    expect(swape([10, 20, 30], [12, 15, 30])).toBeCloseTo(7 / 60, 12);
    expect(swape([0, 0], [0, 0])).toBe(0);
    expect(swape([0], [5])).toBe(Infinity);
  });

  it('bias = (ΣF − ΣA) / ΣA, positive when over-forecasting', () => {
    expect(bias([10, 20, 30], [12, 15, 30])).toBeCloseTo(-3 / 60, 12);
    expect(bias([10, 10], [15, 15])).toBe(0.5);
  });

  it('service level = fulfilled / demand', () => {
    expect(serviceLevel([row(0, 10, 10, 10), row(1, 30, 20, 30)])).toBe(0.75);
    expect(serviceLevel([])).toBe(1);
  });

  it('days of supply = on hand / mean forecast over the horizon', () => {
    expect(daysOfSupply(state(), loc('grain'))).toBe(10); // 100 / 10
    const overridden = state({ overrides: [{ itemId: 'grain', depotId: 'camp', from: 0, to: 6, mode: 'absolute', value: 0 }] });
    expect(daysOfSupply(overridden, loc('grain'))).toBe(Infinity);
  });

  it('summary over all rows or the last N days', () => {
    const s = state({ kpis: [row(0, 10, 10, 12, 1), row(1, 20, 15, 15), row(2, 30, 30, 30, 2)] });
    expect(kpiSummary(s)).toEqual({
      serviceLevel: 55 / 60,
      daysOfSupply: 10,
      spoiled: 3,
      holdingCost: 3,
      swape: 7 / 60,
      bias: -3 / 60,
    });
    expect(kpiSummary(s, 1)).toMatchObject({ serviceLevel: 1, swape: 0, bias: 0, spoiled: 2 });
  });

  it('SWAPE uses per-location absError, so item errors do not cancel', () => {
    // Two items: +5 and −5 against forecast → row forecast = demand, but absError 10.
    const s = state({ kpis: [row(0, 20, 20, 20, 0, 10)] });
    expect(kpiSummary(s)).toMatchObject({ swape: 0.5, bias: 0 });
  });
});
