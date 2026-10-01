// Regression (§11): a more volatile ticker makes demand harder to forecast. Uses the store's
// committed (synthetic) snapshots and accept-all play, so it runs offline and deterministically.
import { describe, expect, it } from 'vitest';
import { scenarios } from '../../src/content';
import { engine } from '../../src/engine';
import { kpiSummary } from '../../src/engine/kpi';
import { rules } from '../../src/engine/rules.config';
import type { Difficulty } from '../../src/engine/types';
import { snapshotSeries, toMarketSignal } from '../../src/store/market';

function playSandbox(difficulty: Difficulty) {
  const sc = scenarios.find((x) => x.id === 'sandbox')!;
  const market = toMarketSignal(snapshotSeries(rules.difficulty[difficulty].ticker), sc.lengthDays);
  let s = engine.initGame(sc, { difficulty, market });
  for (let d = 0; d < sc.lengthDays; d++) {
    s = engine.tick(engine.placeOrders(s, s.proposals.map((_, index) => ({ index, decision: 'accepted' as const }))));
  }
  return s;
}

describe('difficulty via market volatility (sandbox, accept-all)', () => {
  const swape = Object.fromEntries((['easy', 'normal', 'hard'] as const).map((d) => [d, kpiSummary(playSandbox(d)).swape]));

  it('SWAPE: easy (KO) < normal (AAPL) < hard (TSLA)', () => {
    expect(swape.easy).toBeLessThan(swape.normal);
    expect(swape.normal).toBeLessThan(swape.hard);
  });

  it('hard is clearly harder to forecast than easy (≥ 1.5×)', () => {
    expect(swape.hard).toBeGreaterThan(1.5 * swape.easy);
  });
});
