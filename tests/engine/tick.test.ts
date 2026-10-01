import { describe, expect, it } from 'vitest';
import { engine } from '../../src/engine';
import { initGame, placeOrders, refresh, tick } from '../../src/engine/tick';
import type { GameState, Scenario } from '../../src/engine/types';
import { flat, item, loc, quietRules as q, source, state } from './fixtures';

const run = (s: GameState, days: number) => {
  for (let i = 0; i < days; i++) s = tick(s, q);
  return s;
};

describe('placeOrders', () => {
  const s0 = refresh(state({ locations: [loc('grain', { onHand: 70 })] }), q);

  it('accepting the must proposal creates an open order and commits spend', () => {
    expect(s0.proposals).toHaveLength(1);
    const s = placeOrders(s0, [{ index: 0, decision: 'accepted' }], q);
    expect(s.openOrders).toEqual([
      expect.objectContaining({ itemId: 'grain', vendorId: 'v', qty: 30, orderedOn: 0, deliveryOn: 3, cost: 60 }),
    ]);
    expect(s.periods[0].committed).toBe(60);
    // Now covered by the open order: proj at D2 = 40 → can, no below-MOP exception.
    expect(s.proposals[0]).toMatchObject({ reason: 'can', projectedAtD2: 40 });
    expect(s.exceptions.some((e) => e.kind === 'below-mop')).toBe(false);
  });

  it('edited qty is rounded to pack size and cost recomputed', () => {
    const packed = refresh({ ...s0, sourcing: [source('grain', 'v', { packSize: 12 })] }, q);
    const s = placeOrders(packed, [{ index: 0, decision: 'accepted', qty: 25 }], q);
    expect(s.openOrders[0]).toMatchObject({ qty: 36, cost: 72 });
  });

  it('rejected / deferred / bad indexes do nothing', () => {
    const decisions = [
      { index: 0, decision: 'rejected' as const },
      { index: 0, decision: 'deferred' as const },
      { index: 9, decision: 'accepted' as const },
    ];
    expect(placeOrders(s0, decisions, q)).toBe(s0);
  });
});

describe('tick (noise off)', () => {
  it('golden: on hand 70, order 30 on Mon arrives Thu: 60, 50, 40, then 40 + 30 − 10 = 60', () => {
    let s = placeOrders(refresh(state({ locations: [loc('grain', { onHand: 70 })] }), q), [{ index: 0, decision: 'accepted' }], q);
    const onHand: number[] = [];
    for (let i = 0; i < 4; i++) {
      s = tick(s, q);
      onHand.push(s.locations[0].onHand);
    }
    expect(onHand).toEqual([60, 50, 40, 60]);
    expect(s.today).toBe(4);
    expect(s.openOrders).toEqual([]);
    expect(s.locations[0].history).toEqual(flat(10, 18));
    expect(s.kpis[0]).toEqual({ day: 0, demand: 10, fulfilled: 10, spoiled: 0, holdingCost: 0, spend: 60, forecast: 10 });
    expect(s.kpis.map((k) => k.spend)).toEqual([60, 0, 0, 0]);
  });

  it('does not mutate its input', () => {
    const s = state();
    const snapshot = structuredClone(s);
    tick(s, q);
    expect(s).toEqual(snapshot);
  });

  it('stockout: demand 10 with 5 on hand → 5 lost; morale −5×crit 3×0.05 then +0.5', () => {
    const s = tick(state({ locations: [loc('grain', { onHand: 5 })] }), q);
    expect(s.kpis[0]).toMatchObject({ demand: 10, fulfilled: 5 });
    expect(s.locations[0].onHand).toBe(0);
    expect(s.morale).toBeCloseTo(80 - 0.75 + 0.5, 10);
    expect(s.exceptions).toContainEqual(expect.objectContaining({ kind: 'stockout', day: 0, itemId: 'grain', depotId: 'camp' }));
    // Survives a refresh (e.g. the player edits an override the next morning).
    expect(refresh(s, q).exceptions.some((e) => e.kind === 'stockout')).toBe(true);
  });

  it('no stockout exception when demand is met', () => {
    expect(tick(state(), q).exceptions.some((e) => e.kind === 'stockout')).toBe(false);
  });

  it('KPI forecast sums the morning forecast over locations (stated uplift, not actual)', () => {
    const s = tick(
      state({
        items: { grain: item('grain'), salt: item('salt') },
        sourcing: [source('grain'), source('salt')],
        locations: [loc('grain'), loc('salt', { history: flat(4) })],
        battlePlans: [
          { id: 'b', title: '', letter: '', announcedOn: 0, start: 0, end: 0, depotIds: ['camp'], statedUplift: { grain: 1.5 }, actualUplift: { grain: 2 } },
        ],
      }),
      q,
    );
    expect(s.kpis[0]).toMatchObject({ forecast: 19, demand: 24 }); // 15 + 4 vs 20 + 4
  });

  it('morale recovers but caps at 100', () => {
    expect(tick(state({ morale: 100 }), q).morale).toBe(100);
  });

  it('holding cost on end-of-day stock', () => {
    const s = tick(state({ items: { grain: item('grain', { holdingCost: 0.1 }) } }), q);
    expect(s.kpis[0].holdingCost).toBeCloseTo(9, 10); // 90 × 0.1
  });

  it("spoilage 'cover-excess': stock beyond shelf life × baseline spoils at 1/shelfLife per day", () => {
    const s = tick(state({ items: { grain: item('grain', { shelfLifeDays: 5 }) } }), { ...q, spoilage: { mode: 'cover-excess' } });
    // 100 − 10 = 90; sellable 50; excess 40 → 8 spoil
    expect(s.locations[0].onHand).toBe(82);
    expect(s.kpis[0].spoiled).toBe(8);
    expect(s.exceptions.some((e) => e.kind === 'spoilage' && e.day === 0)).toBe(true);
  });

  it('actual battle-plan uplift drives demand even when unannounced; deviation is flagged', () => {
    const s = tick(
      state({
        battlePlans: [
          { id: 'b', title: '', letter: '', announcedOn: 5, start: 0, end: 0, depotIds: ['camp'], statedUplift: { grain: 1.5 }, actualUplift: { grain: 2 } },
        ],
      }),
      q,
    );
    expect(s.kpis[0].demand).toBe(20);
    expect(s.exceptions).toContainEqual(expect.objectContaining({ kind: 'forecast-deviation', day: 0, itemId: 'grain' }));
  });

  it('period close: overspend 10 on allowance 50 → next allowance 90, morale −10', () => {
    const s = tick(
      state({
        periods: [
          { index: 0, start: 0, end: 0, allowance: 50, committed: 60 },
          { index: 1, start: 1, end: 1, allowance: 100, committed: 0 },
        ],
      }),
      q,
    );
    expect(s.periods[1].allowance).toBe(90);
    expect(s.morale).toBeCloseTo(80 - 10 + 0.5, 10);
    expect(s.exceptions).toContainEqual(expect.objectContaining({ kind: 'over-budget', day: 0 }));
  });

  it('stockout-risk when stock runs dry before the next possible delivery', () => {
    const s = refresh(state({ locations: [loc('grain', { onHand: 15 })] }), q);
    expect(s.exceptions).toContainEqual(expect.objectContaining({ kind: 'stockout-risk', itemId: 'grain' }));
  });
});

describe('tick (seeded noise)', () => {
  it('is deterministic given the seed, and the seed matters', () => {
    const a = run(state({ locations: [loc('grain', { onHand: 500 })] }), 0);
    const tickN = (s: GameState) => {
      for (let i = 0; i < 10; i++) s = tick(s);
      return s;
    };
    expect(tickN(a)).toEqual(tickN(a));
    const histA = tickN(a).locations[0].history.slice(-10);
    const histB = tickN({ ...a, seed: 43 }).locations[0].history.slice(-10);
    expect(histA).not.toEqual(histB);
    expect(histA.every((d) => Number.isInteger(d) && d >= 0)).toBe(true);
  });
});

describe('initGame + EngineApi', () => {
  const scenario: Scenario = {
    id: 't',
    title: 'T',
    briefing: '',
    teaches: [],
    lengthDays: 56,
    periodLengthDays: 28,
    periodAllowance: 500,
    initial: (({ today: _t, proposals: _p, exceptions: _e, kpis: _k, openOrders: _o, ...rest }) => ({ ...rest, periods: [] }))(
      state({ locations: [loc('grain', { onHand: 70 })] }),
    ),
  };

  it('builds periods and day-0 proposals', () => {
    const s = initGame(scenario, q);
    expect(s.today).toBe(0);
    expect(s.periods.map((p) => [p.start, p.end, p.allowance])).toEqual([
      [0, 27, 500],
      [28, 55, 500],
    ]);
    expect(s.proposals[0]).toMatchObject({ reason: 'must', qty: 30 });
    expect(s.exceptions).toContainEqual(expect.objectContaining({ kind: 'below-mop', itemId: 'grain' }));
  });

  it('engine object plays a week end to end', () => {
    let s = engine.initGame(scenario);
    for (let d = 0; d < 7; d++) {
      s = engine.placeOrders(
        s,
        s.proposals.map((p, index) => ({ index, decision: p.qty > 0 ? ('accepted' as const) : ('rejected' as const) })),
      );
      s = engine.tick(s);
    }
    expect(s.today).toBe(7);
    expect(s.kpis).toHaveLength(7);
    expect(engine.project(s, 'grain', 'camp', 7, 9)).toHaveLength(3);
    expect(engine.planningParams(s, 'grain', 'camp')?.orderDay).toBe(7);
  });
});
