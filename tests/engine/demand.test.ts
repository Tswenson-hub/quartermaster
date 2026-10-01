import { describe, expect, it } from 'vitest';
import { actualUplift, baseRate, marketFactor } from '../../src/engine/demand';
import { rules } from '../../src/engine/rules.config';
import { initGame, tick } from '../../src/engine/tick';
import type { MarketSignal, Scenario } from '../../src/engine/types';
import { flat, loc, quietRules as q, state } from './fixtures';

const market = (values: number[]): MarketSignal => ({ ticker: 'T', source: 'snapshot', firstDate: '', lastDate: '', values });

describe('market factor (§11)', () => {
  it('clamp((close / mean)^1.5, 0.5, 1.8)', () => {
    // values 1, 2, 3 → mean 2: 0.5^1.5 = 0.354 → 0.5; 1^1.5 = 1; 1.5^1.5 = 1.837 → 1.8
    const m = market([1, 2, 3]);
    expect([0, 1, 2].map((d) => marketFactor(m, d))).toEqual([0.5, 1, 1.8]);
    expect(marketFactor(market([90, 110]), 1)).toBeCloseTo(1.1 ** 1.5, 12);
  });

  it('days past the series reuse the last close; no series → 1', () => {
    expect(marketFactor(market([1, 2, 3]), 10)).toBe(1.8);
    expect(marketFactor(market([]), 0)).toBe(1);
    expect(marketFactor(undefined, 0)).toBe(1);
  });

  it('drives tick demand: rate 10 × factor (noise off)', () => {
    let s = state({ market: market([1, 2, 3]) });
    s = tick(tick(tick(s, q), q), q);
    expect(s.kpis.map((k) => k.demand)).toEqual([5, 10, 18]);
  });

  it('stacks with the hidden battle-plan uplift', () => {
    const s = state({
      market: market([2, 2, 3, 1]), // mean 2 → day 0 factor 1
      battlePlans: [{ id: 'b', title: '', letter: '', announcedOn: 9, start: 0, end: 0, depotIds: ['camp'], statedUplift: {}, actualUplift: { grain: 1.5 } }],
    });
    expect(actualUplift(s, s.locations[0], 0)).toBe(1.5);
    expect(tick(s, q).kpis[0].demand).toBe(15);
  });
});

describe('base rate', () => {
  it('uses pre-campaign history only, so campaign demand does not feed back', () => {
    // 14 days of 10 before day 0, then 3 campaign days of 50.
    const l = loc('grain', { history: [...flat(10), 50, 50, 50] });
    expect(baseRate(l, 3)).toBe(10);
    expect(baseRate(l, 0)).toBeCloseTo(290 / 17, 12); // today 0: all 17 entries count as pre-campaign
    expect(baseRate(loc('grain', { history: [...flat(5, 30), ...flat(10, rules.demand.baseWindow)] }), 0)).toBe(10);
    expect(baseRate(loc('grain', { history: [4, 6] }), 2)).toBe(5); // no pre-campaign history → all
  });
});

describe('difficulty budget', () => {
  const scenario = (): Scenario => ({
    id: 't',
    title: 'T',
    briefing: '',
    teaches: [],
    lengthDays: 28,
    periodLengthDays: 28,
    periodAllowance: 1000,
    initial: (({ today: _a, proposals: _b, exceptions: _c, kpis: _d, openOrders: _e, difficulty: _f, market: _g, vendorTriggers: _h, vendorPlans: _i, rank: _j, letters: _k, battles: _l, status: _m, ...rest }) => ({
      ...rest,
      periods: [],
    }))(state()),
  });

  it('allowance × budgetFactor (easy 1.15, normal 1, hard 0.85)', () => {
    const allowance = (d: 'easy' | 'normal' | 'hard') => initGame(scenario(), { difficulty: d, market: market(flat(1, 28)) }).periods[0].allowance;
    expect(allowance('easy')).toBeCloseTo(1150, 9);
    expect(allowance('normal')).toBe(1000);
    expect(allowance('hard')).toBeCloseTo(850, 9);
    expect(initGame(scenario()).difficulty).toBe('normal');
  });
});
