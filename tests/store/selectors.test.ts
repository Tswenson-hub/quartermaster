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
    expect(preview.dropped).toEqual([]);
  });



  it('below the vendor order trigger there is nothing to order', () => {
    const game = engine.initGame(withMinimum({ kind: 'units', amount: 10_000 }));
    expect(game.proposals).toEqual([]);
    expect(game.vendorPlans.find((v) => v.vendorId === 'mill')?.status).toBe('below-trigger');
    expect(selectDecisionPreview(game, {}).orders).toEqual([]);
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
    expect(s.daysOfSupply).toBeGreaterThan(0);
    expect(selectKpiSummary(game, 1).serviceLevel).toBe(0.5);
  });
});

describe('selectLetterText', () => {
  it('falls back to engine text without facts', async () => {
    const { selectLetterText } = await import('../../src/store/selectors');
    const game = engine.initGame(fixtureScenario);
    const letter = { id: 'l1', day: 3, kind: 'reprimand' as const, from: 'HQ', subject: 'S', body: 'B' };
    expect(selectLetterText(game, letter)).toEqual({ from: 'HQ', subject: 'S', body: 'B' });
  });

  it('renders content templates from facts, with the rank title', async () => {
    const { selectLetterText } = await import('../../src/store/selectors');
    const { rankTitle } = await import('../../src/content/ranks');
    const game = engine.initGame(fixtureScenario);
    const text = selectLetterText(game, {
      id: 'l2',
      day: 28,
      kind: 'promotion',
      from: 'HQ',
      subject: 'S',
      body: 'B',
      facts: { rankLevel: 3, merit: 0 },
    });
    expect(text.subject + text.body).toContain(rankTitle(3));
  });
});

// Master data. These need the engine implementation (stubs return no rows), so they skip until it lands.
describe('master data selectors', async () => {
  const { selectItemLocationRows, selectVendorRows, selectVendorOrderDays } = await import('../../src/store/selectors');
  const implemented = engine.vendorStats(engine.initGame(fixtureScenario)).length > 0;

  it.skipIf(!implemented)('one row per item-location and per vendor', () => {
    const game = engine.initGame(fixtureScenario);
    expect(selectItemLocationRows(game)).toHaveLength(game.locations.length);
    expect(selectVendorRows(game).map((v) => v.vendorId).sort()).toEqual(Object.keys(game.vendors).sort());
  });

  it.skipIf(!implemented)('order-day override is reflected in effective days and vendor rows', () => {
    const game = { ...engine.initGame(fixtureScenario), vendorOrderDays: { mill: { kind: 'daily' as const } } };
    expect(selectVendorOrderDays(game, 'mill')).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(selectVendorRows(game).find((v) => v.vendorId === 'mill')!.orderDays).toHaveLength(7);
  });
});
