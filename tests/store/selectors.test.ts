import { describe, expect, it } from 'vitest';
import type { Scenario } from '../../src/engine/types';
import { engine } from '../../src/store/engine';
import { selectDecisionPreview } from '../../src/store/selectors';
import { fixtureScenario } from './fixture';

function withMinimum(minimum: NonNullable<Scenario['initial']['vendors'][string]['minimum']>): Scenario {
  const s = structuredClone(fixtureScenario);
  s.initial.vendors.mill.minimum = minimum;
  return s;
}

describe('selectDecisionPreview', () => {
  it('matches what placeOrders commits, with no minimum', () => {
    const game = engine.initGame(fixtureScenario);
    const preview = selectDecisionPreview(game, { 0: { decision: 'accepted' } });
    expect(preview.orders).toHaveLength(1);
    expect(preview.spend).toBe(game.proposals[0].cost);
    expect(preview.surcharges).toBe(0);
    expect(preview.dropped).toEqual([]);
  });

  // TODO(lead): surcharge path removed by owner spec (RELEX_RULES §4/§6, CO-MRP order trigger).
  it.skip('includes the surcharge for a below-minimum order', () => {
    const game = engine.initGame(withMinimum({ kind: 'units', amount: 10_000, surcharge: 7 }));
    const preview = selectDecisionPreview(game, { 0: { decision: 'accepted' } });
    expect(preview.surcharges).toBe(7);
    expect(preview.spend).toBe(game.proposals[0].cost + 7);
  });

  // TODO(lead): surcharge path removed by owner spec (RELEX_RULES §4/§6, CO-MRP order trigger).
  it.skip('reports a below-minimum order with no surcharge as dropped', () => {
    const game = engine.initGame(withMinimum({ kind: 'units', amount: 10_000 }));
    const preview = selectDecisionPreview(game, { 0: { decision: 'accepted' } });
    expect(preview.orders).toEqual([]);
    expect(preview.dropped).toEqual([0]);
  });

  it('ignores rejected lines', () => {
    const game = engine.initGame(fixtureScenario);
    expect(selectDecisionPreview(game, { 0: { decision: 'rejected' } }).orders).toEqual([]);
  });
});

describe('selectKpiSummary', () => {
  it('computes service level, SWAPE and bias', async () => {
    const { selectKpiSummary } = await import('../../src/store/selectors');
    const game = engine.initGame(fixtureScenario);
    const kpi = { spoiled: 0, holdingCost: 0, spend: 0, daysOfSupply: 3 };
    game.kpis = [
      { day: 0, demand: 10, fulfilled: 10, forecast: 12, absError: 2, ...kpi },
      { day: 1, demand: 10, fulfilled: 5, forecast: 6, absError: 4, ...kpi, daysOfSupply: 1 },
    ];
    const s = selectKpiSummary(game);
    expect(s.serviceLevel).toBe(0.75);
    expect(s.swape).toBeCloseTo(0.3);
    expect(s.bias).toBeCloseTo(-0.1);
    expect(s.daysOfSupply).toBe(1);
    expect(selectKpiSummary(game, 1).serviceLevel).toBe(0.5);
  });
});
