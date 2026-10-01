// Warm start: the previous quartermaster plays W days before the player takes over.
import { describe, expect, it } from 'vitest';
import { scenarios } from '../../src/content';
import { engine } from '../../src/engine';
import { initGame, periodFor, tick } from '../../src/engine/tick';
import type { BattlePlan, Scenario } from '../../src/engine/types';
import { loc, quietRules as q, state } from './fixtures';

const scenario = (extra: Partial<Scenario> = {}, battlePlans: BattlePlan[] = []): Scenario => ({
  id: 'w',
  title: 'W',
  briefing: '',
  teaches: [],
  lengthDays: 28,
  periodLengthDays: 28,
  periodAllowance: 1000,
  initial: (({ today: _a, startDay: _s, lengthDays: _n, proposals: _b, exceptions: _c, kpis: _d, openOrders: _e, difficulty: _f, market: _g, vendorTriggers: _h, vendorOrderDays: _o, deliveries: _p, vendorPlans: _i, rank: _j, letters: _k, battles: _l, status: _m, ...rest }) => ({
    ...rest,
    battlePlans,
    periods: [],
  }))(state({ locations: [loc('grain', { onHand: 70 })] })),
  ...extra,
});
const battle: BattlePlan = { id: 'b', title: 'B', letter: '', announcedOn: 0, start: 2, end: 4, depotIds: ['camp'], statedUplift: {}, actualUplift: {} };

describe('warm start', () => {
  it('plays W days (default rules.warmup.days = 14), then hands over on day W', () => {
    const s = initGame(scenario(), undefined, q);
    expect(s).toMatchObject({ today: 14, startDay: 14, lengthDays: 42, status: 'playing' });
    expect(s.kpis.map((k) => k.day)).toEqual([...Array(14).keys()]);
    expect(s.locations[0].history).toHaveLength(14 + 14);
  });

  it('the predecessor accepted every proposal: orders were placed and delivered', () => {
    const s = initGame(scenario(), undefined, q);
    expect(s.deliveries.length).toBeGreaterThan(0);
    expect(s.kpis.reduce((a, k) => a + k.spend, 0)).toBeGreaterThan(0);
  });

  it('no rank, letters or battles during the warm-up; battle-plan days shift by W', () => {
    const s = initGame(scenario({ warmupDays: 7 }, [battle]), undefined, q);
    expect(s.letters).toEqual([]);
    expect(s.battles).toEqual([]);
    expect(s.battlePlans[0]).toMatchObject({ announcedOn: 7, start: 9, end: 11 });
  });

  it('warmupDays must be a non-negative multiple of 7', () => {
    expect(() => initGame(scenario({ warmupDays: 10 }), undefined, q)).toThrow(/multiple of 7/);
    expect(() => initGame(scenario({ warmupDays: -7 }), undefined, q)).toThrow();
    expect(initGame(scenario({ warmupDays: 0 }), undefined, q)).toMatchObject({ today: 0, startDay: 0, lengthDays: 28 });
  });

  it('deterministic', () => {
    expect(initGame(scenario(), undefined, q)).toEqual(initGame(scenario(), undefined, q));
  });
});

describe('fiscal periods run from day 0 (owner: take over part-way through a period)', () => {
  it('periods cover warm-up + campaign; the last is pro-rated', () => {
    const s = initGame(scenario(), undefined, q); // 14 + 28 = 42 days, 28-day periods
    expect(s.periods.map((p) => [p.start, p.end, p.allowance])).toEqual([
      [0, 27, 1000],
      [28, 41, 500],
    ]);
  });

  it('sandbox: the period at takeover started before it and already holds the predecessor’s spend', () => {
    const sandbox = scenarios.find((x) => x.id === 'sandbox')!;
    const s = engine.initGame(sandbox);
    const current = periodFor(s.periods, s.startDay)!;
    expect(current.start).toBeLessThan(s.startDay);
    expect(current.committed).toBeGreaterThan(0);
  });

  it('a period ending in the warm-up is not judged; the inherited one is, at its end', () => {
    // 7-day periods, 14-day warm-up: periods 0 and 1 end during the warm-up (day 6, 13).
    const s0 = initGame(scenario({ periodLengthDays: 7, periodAllowance: 1 }), undefined, q);
    expect(s0.letters).toEqual([]); // overspent, but rank is off in the warm-up
    // Period 2 (days 14–20) is the player's: overspend it and it is judged on day 20.
    let s = { ...s0, periods: s0.periods.map((p) => (p.index === 2 ? { ...p, committed: 999 } : p)) };
    for (let d = 14; d <= 20; d++) s = tick(s, q);
    expect(s.letters.map((l) => [l.kind, l.facts?.periodIndex])).toEqual([['reprimand', 2]]);
  });
});
