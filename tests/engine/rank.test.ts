// Career (§9, §11) with default rules.rank: reprimand > 5% over; 2 reprimands = demotion;
// +1 merit for an on-budget period at ≥ 95% service; +2 per battle won; 3 merit = promotion;
// battle won at ≥ 90% service in its window, else −1 level; level < 0 = game over.
import { describe, expect, it } from 'vitest';
import { rules } from '../../src/engine/rules.config';
import { tick } from '../../src/engine/tick';
import type { BattlePlan, GameState, RankState } from '../../src/engine/types';
import { item, loc, quietRules as q, state } from './fixtures';

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

  it('only the battle plan\'s items at its depots count', () => {
    // Grain (in the plan) fully served; salt (not in the plan) and a grain at another depot run dry.
    const s = tick(
      state({
        items: { grain: item('grain'), salt: item('salt') },
        sourcing: [],
        locations: [loc('grain'), loc('salt', { onHand: 0 }), loc('grain', { depotId: 'north', onHand: 0 })],
        battlePlans: [battle()],
      }),
      q,
    );
    expect(s.battles[0]).toMatchObject({ won: true, serviceLevel: 1 });
    expect(s.locations.map((l) => l.fulfilled)).toEqual([[20], [0], [0]]);
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

  it("'complete' after the last campaign day (lengthDays)", () => {
    let s = state({ lengthDays: 3 });
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

describe('letter facts (rank after each event)', () => {
  const facts = (s: GameState) => s.letters.map((l) => [l.kind, l.facts]);

  it('reprimand then demotion: period figures; rank after each step', () => {
    const s = tick(closing(106, { rank: rank({ reprimands: 1, merit: 1 }) }), q);
    expect(facts(s)).toEqual([
      ['reprimand', { rankLevel: 2, periodIndex: 0, committed: 106, allowance: 100, serviceLevel: 1, reprimands: 2, merit: 1 }],
      ['demotion', { rankLevel: 1, periodIndex: 0, committed: 106, allowance: 100, serviceLevel: 1, reprimands: 0, merit: 0 }],
    ]);
  });

  it('commendation then promotion', () => {
    const s = tick(closing(100, { rank: rank({ merit: 2, reprimands: 1 }) }), q);
    expect(facts(s)).toEqual([
      ['commendation', { rankLevel: 2, periodIndex: 0, committed: 100, allowance: 100, serviceLevel: 1, reprimands: 1, merit: 3 }],
      ['promotion', { rankLevel: 3, merit: 0, reprimands: 0 }],
    ]);
  });

  it('battle won / lost carry the window service level', () => {
    expect(facts(tick(state({ battlePlans: [battle()] }), q))).toEqual([
      ['battle-won', { rankLevel: 2, serviceLevel: 1, merit: 2, reprimands: 0 }],
    ]);
    const lost = tick(state({ rank: rank({ level: 0 }), battlePlans: [battle()], locations: [loc('grain', { onHand: 15 })] }), q);
    expect(facts(lost)).toEqual([
      ['battle-lost', { rankLevel: 0, serviceLevel: 0.75, merit: 0, reprimands: 0 }],
      ['demotion', { rankLevel: -1, serviceLevel: 0.75, reprimands: 0, merit: 0 }],
      ['game-over', { rankLevel: -1 }],
    ]);
    expect(lost.letters[1].battlePlanId).toBe('ford');
  });

  it('every letter has facts', () => {
    const s = tick(closing(106, { rank: rank({ level: 0, reprimands: 1 }) }), q);
    expect(s.letters.length).toBeGreaterThan(0);
    expect(s.letters.every((l) => l.facts !== undefined)).toBe(true);
  });
});

describe('per-plan winServiceLevel', () => {
  // 15 of 20 served = 75%: lost at the 90% default, won if the plan only asks for 70%.
  const short = (winServiceLevel?: number) =>
    tick(state({ battlePlans: [battle({ winServiceLevel })], locations: [loc('grain', { onHand: 15 })] }), q).battles[0];

  it('plan.winServiceLevel ?? rules.rank.battleWinServiceLevel', () => {
    expect(short().won).toBe(false);
    expect(short(0.7)).toMatchObject({ won: true, serviceLevel: 0.75 });
    expect(short(0.8).won).toBe(false);
  });
});
