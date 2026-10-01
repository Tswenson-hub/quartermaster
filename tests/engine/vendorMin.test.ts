// CO-MRP: order trigger + build to vendor minimum, one pack at a time (RELEX_RULES §4, §6).
import { describe, expect, it } from 'vitest';
import { scenarios } from '../../src/content';
import { engine } from '../../src/engine';
import { generatePlanLines } from '../../src/engine/replenishment';
import { snapshotSeries, toMarketSignal } from '../../src/store/market';
import { rules, type Rules } from '../../src/engine/rules.config';
import type { Vendor } from '../../src/engine/types';
import { refresh } from '../../src/engine/tick';
import { applyVendorMinimums, buildToMinimum, effectiveTrigger, type BuildCandidate } from '../../src/engine/vendorMin';
import { item, loc, source, state, vendor } from './fixtures';

// All items: forecast 10/day, MOP 40, pack 10, unit cost 2. Monday order, D2 check = end of day 5.
//   a: on hand 70  → proj 10  → must 30 (days of cover with the 30: 4.0)
//   b: on hand 110 → proj 50  → 5.0 days
//   c: on hand 105 → proj 45  → 4.5 days
//   d: on hand 250 → proj 190 → 19.0 days
function setup(minimum: Vendor['minimum'], extra = {}) {
  const s = state({
    items: { a: item('a'), b: item('b'), c: item('c'), d: item('d') },
    vendors: { v: vendor('v', { minimum }) },
    sourcing: ['a', 'b', 'c', 'd'].map((id) => source(id, 'v', { packSize: 10 })),
    locations: [loc('a', { onHand: 70 }), loc('b', { onHand: 110 }), loc('c', { onHand: 105 }), loc('d', { onHand: 250 })],
    ...extra,
  });
  return { s, lines: generatePlanLines(s) };
}
const run = (minimum: Vendor['minimum'], trigger: number, r: Rules = rules, extra = {}) => {
  const { s, lines } = setup(minimum, extra);
  return applyVendorMinimums({ ...s, vendorTriggers: { v: trigger } }, lines, r);
};
const table = (ps: { itemId: string; reason: string; qty: number }[]) => ps.map((p) => [p.itemId, p.reason, p.qty]);

describe('CO-MRP build to minimum (golden)', () => {
  it('need 30 of 100 = 30% < 50% trigger → no order, shortfall explains the trigger', () => {
    const out = run({ kind: 'units', amount: 100 }, 0.5);
    expect(out.proposals).toEqual([]);
    expect(out.exceptions).toEqual([
      expect.objectContaining({
        kind: 'vendor-min-shortfall',
        vendorId: 'v',
        message: 'v: must-order need is 30% of the 100 units minimum, below the 50% order trigger — no order proposed. Lower the trigger to build up to the minimum.',
      }),
    ]);
  });

  it('trigger 30%: builds one pack at a time to the lowest days of cover, re-ranked after each pack', () => {
    // Days of cover before each pack (a, b, c):     pick  total
    //   4.0  5.0  4.5                                a     40
    //   5.0  5.0  4.5                                c     50
    //   5.0  5.0  5.5   (tie → itemId)               a     60
    //   6.0  5.0  5.5                                b     70
    //   6.0  6.0  5.5                                c     80
    //   6.0  6.0  6.5   (tie → itemId)               a     90
    //   7.0  6.0  6.5                                b    100 ✓   d (19 days) never picked
    const out = run({ kind: 'units', amount: 100 }, 0.3);
    expect(table(out.proposals)).toEqual([
      ['a', 'must', 60],
      ['b', 'vendor-min-fill', 20],
      ['c', 'vendor-min-fill', 20],
    ]);
    expect(out.proposals.map((p) => p.cost)).toEqual([120, 40, 40]);
    // a's real need is 30; the build added 30 more. b and c are entirely build.
    expect(out.proposals.map((p) => [p.itemId, p.qty - p.builtQty!, p.builtQty])).toEqual([
      ['a', 30, 30],
      ['b', 0, 20],
      ['c', 0, 20],
    ]);
    expect(out.exceptions).toEqual([]);
  });

  it('the build sequence itself', () => {
    const { lines } = setup({ kind: 'units', amount: 100 });
    const cands: BuildCandidate[] = lines.map((l) => ({
      itemId: l.proposal.itemId,
      qty: l.proposal.reason === 'must' ? l.proposal.qty : 0,
      packSize: 10,
      unitCost: 2,
      projectedAtD2: l.proposal.projectedAtD2,
      avgDailyForecast: l.avgDailyForecast,
      criticality: 3,
      must: l.proposal.reason === 'must',
    }));
    const res = buildToMinimum(cands, { kind: 'units', amount: 100 }, 0.3);
    expect(res).toMatchObject({ outcome: 'built', needRatio: 0.3 });
    expect(res.steps).toEqual(['a', 'c', 'a', 'b', 'c', 'a', 'b']);
  });

  it('trigger exactly equal to the need ratio builds', () => {
    expect(run({ kind: 'units', amount: 100 }, 0.3).proposals).toHaveLength(3);
    expect(run({ kind: 'units', amount: 100 }, 0.31).proposals).toEqual([]);
  });

  it('value minimum: need 60 of 160 silver = 37.5%; build a, c, a, b, c → 160', () => {
    const out = run({ kind: 'value', amount: 160 }, 0.3);
    expect(table(out.proposals)).toEqual([
      ['a', 'must', 50],
      ['b', 'vendor-min-fill', 10],
      ['c', 'vendor-min-fill', 20],
    ]);
  });

  it("buildPriority 'criticality': the most critical item takes the first pack", () => {
    const r: Rules = { ...rules, vendorMinimum: { ...rules.vendorMinimum, buildPriority: 'criticality' } };
    const out = run({ kind: 'units', amount: 40 }, 0.3, r, {
      items: { a: item('a'), b: item('b'), c: item('c'), d: item('d', { criticality: 5 }) },
    });
    expect(table(out.proposals)).toEqual([
      ['a', 'must', 30],
      ['d', 'vendor-min-fill', 10],
    ]);
  });

  it('must lines alone meet the minimum → unchanged', () => {
    expect(table(run({ kind: 'units', amount: 30 }, 0.5).proposals)).toEqual([['a', 'must', 30]]);
    expect(run({ kind: 'units', amount: 30 }, 0.5).proposals[0].builtQty).toBe(0);
  });

  it('no must need → no order and no exception', () => {
    const { s } = setup({ kind: 'units', amount: 100 });
    const s2 = { ...s, locations: s.locations.filter((l) => l.itemId !== 'a') };
    const out = applyVendorMinimums(s2, generatePlanLines(s2));
    expect(out.proposals).toEqual([]);
    expect(out.exceptions).toEqual([]);
  });

  it('vendor without a minimum: must lines only', () => {
    expect(table(run(undefined, 0.5).proposals)).toEqual([['a', 'must', 30]]);
    expect(run(undefined, 0.5).proposals[0].builtQty).toBe(0);
  });

  it('candidates without forecast cannot absorb packs → built-short', () => {
    const c = (itemId: string, must: boolean, avg: number): BuildCandidate => ({
      itemId,
      qty: must ? 10 : 0,
      packSize: 10,
      unitCost: 1,
      projectedAtD2: 0,
      avgDailyForecast: avg,
      criticality: 1,
      must,
    });
    expect(buildToMinimum([c('x', true, 0), c('y', false, 0)], { kind: 'units', amount: 50 }, 0).outcome).toBe('built-short');
  });
});

describe('order trigger lookup and vendorPlans', () => {
  it('player override ?? vendor default ?? rules default', () => {
    const { s } = setup({ kind: 'units', amount: 100 });
    expect(effectiveTrigger(s, 'v')).toBe(rules.vendorMinimum.defaultTrigger);
    const withVendor = { ...s, vendors: { v: { ...s.vendors.v, orderTrigger: 0.2 } } };
    expect(effectiveTrigger(withVendor, 'v')).toBe(0.2);
    expect(effectiveTrigger({ ...withVendor, vendorTriggers: { v: 0.9 } }, 'v')).toBe(0.9);
  });

  it('refresh fills one VendorPlan per vendor ordering today', () => {
    const { s } = setup({ kind: 'units', amount: 100 });
    const below = refresh({ ...s, vendorTriggers: { v: 0.5 } });
    expect(below.vendorPlans).toEqual([{ vendorId: 'v', need: 30, minimum: 100, trigger: 0.5, ratio: 0.3, status: 'below-trigger' }]);
    expect(below.proposals).toEqual([]);
    const built = refresh({ ...s, vendorTriggers: { v: 0.3 } });
    expect(built.vendorPlans[0]).toMatchObject({ status: 'built', ratio: 0.3 });
    expect(built.proposals.reduce((a, p) => a + p.qty, 0)).toBe(100);
    expect(refresh({ ...s, vendors: { v: vendor('v') } }).vendorPlans).toEqual([
      { vendorId: 'v', need: 60, trigger: rules.vendorMinimum.defaultTrigger, ratio: 1, status: 'no-minimum' },
    ]);
    expect(refresh({ ...s, vendors: { v: vendor('v', { minimum: { kind: 'units', amount: 20 } }) } }).vendorPlans[0].status).toBe('meets-minimum');
  });

  it('one minimum per vendor across depots', () => {
    const { s } = setup({ kind: 'units', amount: 100 }, {
      depots: { camp: { id: 'camp', name: 'Camp' }, north: { id: 'north', name: 'North' } },
    });
    const two = { ...s, locations: [...s.locations, loc('a', { depotId: 'north', onHand: 70 })], vendorTriggers: { v: 0.6 } };
    // Need 30 + 30 = 60% of 100 → built across both depots.
    const out = refresh(two);
    expect(out.vendorPlans).toEqual([expect.objectContaining({ need: 60, status: 'built' })]);
    expect(out.proposals.reduce((a, p) => a + p.qty, 0)).toBe(100);
  });
});

describe('VendorPlan.ratio is exactly need ÷ minimum', () => {
  it('golden: need 30 of 100 → 0.3; value minimum need 60 silver of 160 → 0.375', () => {
    const units = refresh({ ...setup({ kind: 'units', amount: 100 }).s, vendorTriggers: { v: 0.3 } }).vendorPlans[0];
    expect(units).toMatchObject({ need: 30, minimum: 100, ratio: 0.3 });
    const value = refresh({ ...setup({ kind: 'value', amount: 160 }).s, vendorTriggers: { v: 0.3 } }).vendorPlans[0];
    expect(value).toMatchObject({ need: 60, minimum: 160, ratio: 60 / 160 });
  });

  it('every plan, every day, every scenario and difficulty (accept-all)', () => {
    for (const sc of scenarios) {
      for (const difficulty of ['easy', 'normal', 'hard'] as const) {
        const market = toMarketSignal(snapshotSeries(rules.difficulty[difficulty].ticker), sc.lengthDays);
        let s = engine.initGame(sc, { difficulty, market });
        for (let d = 0; d <= sc.lengthDays; d++) {
          for (const p of s.vendorPlans) {
            if (p.minimum === undefined) expect(p.ratio).toBe(1);
            else expect(p.ratio, `${sc.id} ${difficulty} day ${s.today} ${p.vendorId}`).toBe(p.need / p.minimum);
          }
          if (s.status !== 'playing') break;
          s = engine.tick(engine.placeOrders(s, s.proposals.map((_, index) => ({ index, decision: 'accepted' as const }))));
        }
      }
    }
  });
});
