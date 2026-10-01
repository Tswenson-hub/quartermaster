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

  it('includes the surcharge for a below-minimum order', () => {
    const game = engine.initGame(withMinimum({ kind: 'units', amount: 10_000, surcharge: 7 }));
    const preview = selectDecisionPreview(game, { 0: { decision: 'accepted' } });
    expect(preview.surcharges).toBe(7);
    expect(preview.spend).toBe(game.proposals[0].cost + 7);
  });

  it('reports a below-minimum order with no surcharge as dropped', () => {
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
