// Career (§9, §11) with default rules.rank: reprimand > 5% over; 2 reprimands = demotion;
// +1 merit for an on-budget period at ≥ 95% service; +2 per battle won; 3 merit = promotion;
// battle won at ≥ 90% service in its window, else −1 level; level < 0 = game over.
import { describe, expect, it } from 'vitest';
import { rules } from '../../src/engine/rules.config';
import { tick } from '../../src/engine/tick';
import type { BattlePlan, GameState, RankState } from '../../src/engine/types';
import { loc, quietRules as q, state } from './fixtures';

const rank = (extra: Partial<RankState> = {}): RankState => ({ level: 2, merit: 0, reprimands: 0, overspentStreak: 0, ...extra });
// Period 0 is just day 0, so it closes on the first tick.
const closing = (committed: number, extra: Partial<GameState> = {}) =>
  state({
    periods: [
      { index: 0, start: 0, end: 0, allowance: 100, committed },
      { index: 1, start: 1, end: 28, allowance: 100, committed: 0 },
    ],
    ...extra,
  });
const battle = (extra: Partial<BattlePlan> = {}): BattlePlan => ({
  id: 'ford',
  title: 'The Ford',
  letter: '',
  announcedOn: 0,
  start: 0,
  end: 0,
  depotIds: ['camp'],
  statedUplift: {},
  actualUplift: { grain: 2 },
  ...extra,
});

describe('fiscal period close', () => {
  it('more than 5% over → letter of reprimand', () => {
    const s = tick(closing(106), q);
    expect(s.rank).toEqual(rank({ reprimands: 1, overspentStreak: 1 }));
    expect(s.letters).toEqual([expect.objectContaining({ id: 'L1-1-reprimand', day: 1, kind: 'reprimand', from: 'The Royal Treasury' })]);
    expect(s.letters[0].body).toContain('reprimand 1 of 2');
  });

  it('second reprimand → demotion; reprimands reset', () => {
    const s = tick(closing(106, { rank: rank({ reprimands: 1, overspentStreak: 1 }) }), q);
    expect(s.rank).toEqual(rank({ level: 1, reprimands: 0, overspentStreak: 2 }));
    expect(s.letters.map((l) => l.kind)).toEqual(['reprimand', 'demotion']);
  });

  it('within 5% over: no reprimand, no merit, streak resets', () => {
    const s = tick(closing(105, { rank: rank({ overspentStreak: 3 }) }), q);
    expect(s.rank).toEqual(rank());
    expect(s.letters).toEqual([]);
  });

  it('on budget with ≥ 95% service → +1 merit and a commendation', () => {
    const s = tick(closing(100), q);
    expect(s.rank).toEqual(rank({ merit: 1 }));
    expect(s.letters.map((l) => l.kind)).toEqual(['commendation']);
  });

  it('on budget but service below 95% → no merit', () => {
    const s = tick(closing(0, { locations: [loc('grain', { onHand: 5 })] }), q); // 5 of 10 served
    expect(s.rank.merit).toBe(0);
  });

  it('third merit point → promotion; merit and reprimands reset', () => {
    const s = tick(closing(100, { rank: rank({ merit: 2, reprimands: 1 }) }), q);
    expect(s.rank).toEqual(rank({ level: 3 }));
    expect(s.letters.map((l) => l.kind)).toEqual(['commendation', 'promotion']);
  });

  it('no promotion past maxLevel', () => {
    const s = tick(closing(100, { rank: rank({ level: rules.rank.maxLevel, merit: 2 }) }), q);
    expect(s.rank.level).toBe(rules.rank.maxLevel);
    expect(s.rank.merit).toBe(3);
  });
});

describe('battles', () => {
  it('won: 100% supplied (demand 20 from 100 on hand) → +2 merit', () => {
    const s = tick(state({ battlePlans: [battle()] }), q);
    expect(s.battles).toEqual([{ battlePlanId: 'ford', day: 1, won: true, serviceLevel: 1 }]);
    expect(s.rank.merit).toBe(2);
    expect(s.letters).toEqual([expect.objectContaining({ id: 'L1-1-battle-won-ford', kind: 'battle-won', battlePlanId: 'ford' })]);
  });

  it('lost: 15 of 20 = 75% < 90% → down one level', () => {
    const s = tick(state({ battlePlans: [battle()], locations: [loc('grain', { onHand: 15 })] }), q);
    expect(s.battles).toEqual([{ battlePlanId: 'ford', day: 1, won: false, serviceLevel: 0.75 }]);
    expect(s.rank.level).toBe(1);
    expect(s.letters.map((l) => l.kind)).toEqual(['battle-lost', 'demotion']);
  });

  it('decided only when the window ends, over the whole window', () => {
    let s = state({ battlePlans: [battle({ end: 1 })], locations: [loc('grain', { onHand: 30 })] });
    s = tick(s, q); // day 0: 20 of 20
    expect(s.battles).toEqual([]);
    s = tick(s, q); // day 1: 10 of 20 → window 30 / 40 = 75%
    expect(s.battles).toEqual([{ battlePlanId: 'ford', day: 2, won: false, serviceLevel: 0.75 }]);
  });
});

describe('game status', () => {
  it('a lost battle at level 0 → level −1, game over; tick is then a no-op', () => {
    const s = tick(state({ rank: rank({ level: 0 }), battlePlans: [battle()], locations: [loc('grain', { onHand: 0 })] }), q);
    expect(s.status).toBe('lost');
    expect(s.rank.level).toBe(-1);
    expect(s.letters.map((l) => l.kind)).toEqual(['battle-lost', 'demotion', 'game-over']);
    expect(tick(s, q)).toBe(s);
  });

  it("'complete' after the last campaign day (market series length)", () => {
    let s = state({ market: { ticker: 'T', source: 'snapshot', firstDate: '', lastDate: '', values: [1, 1, 1] } });
    s = tick(tick(s, q), q);
    expect(s.status).toBe('playing');
    s = tick(s, q);
    expect(s).toMatchObject({ status: 'complete', today: 3 });
    expect(tick(s, q)).toBe(s);
  });

  it('letter ids are deterministic', () => {
    const run = () => tick(closing(106, { rank: rank({ reprimands: 1 }) }), q).letters.map((l) => l.id);
    expect(run()).toEqual(['L1-1-reprimand', 'L1-2-demotion']);
    expect(run()).toEqual(run());
  });
});
