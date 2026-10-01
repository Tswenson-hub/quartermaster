import { describe, expect, it } from 'vitest';
import { bias, daysOfSupply, kpiSummary, serviceLevel, swape } from '../../src/engine/kpi';
import type { DailyKpi } from '../../src/engine/types';
import { tick } from '../../src/engine/tick';
import { flat, item, loc, quietRules as q, source, state } from './fixtures';

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

describe('days of supply = Σ on hand ÷ Σ mean daily forecast (not a mean of ratios)', () => {
  // grain: 100 on hand, 10/day. salt: 5 on hand, 0.01/day → 500 days on its own.
  const two = () =>
    state({
      items: { grain: item('grain'), salt: item('salt') },
      sourcing: [source('grain'), source('salt')],
      locations: [loc('grain'), loc('salt', { onHand: 5, history: flat(0.01) })],
    });

  it('kpiSummary: 105 / 10.01, not (10 + 500) / 2', () => {
    expect(daysOfSupply(two(), two().locations[1])).toBeCloseTo(500, 9);
    expect(kpiSummary(two()).daysOfSupply).toBeCloseTo(105 / 10.01, 9);
  });

  it('DailyKpi row: Σ end-of-day stock ÷ Σ mean forecast from tomorrow', () => {
    // Day 0 (noise off): grain sells 10 → 90; salt demand rounds to 0 → 5.
    const s = tick(two(), q);
    expect(s.kpis[0].daysOfSupply).toBeCloseTo(95 / 10.01, 9);
  });

  it('no forecast anywhere: summary Infinity with stock (0 without); the stored row records 0', () => {
    const none = state({ locations: [loc('grain', { history: flat(0) })] });
    expect(kpiSummary(none).daysOfSupply).toBe(Infinity);
    expect(kpiSummary(state({ locations: [loc('grain', { onHand: 0, history: flat(0) })] })).daysOfSupply).toBe(0);
    expect(tick(none, q).kpis[0].daysOfSupply).toBe(0);
  });
});
