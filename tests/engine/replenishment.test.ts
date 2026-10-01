import { describe, expect, it } from 'vitest';
import { generateProposals, planningParams, roundToPack } from '../../src/engine/replenishment';
import { rules, zScore, type Rules } from '../../src/engine/rules.config';
import { flat, loc, source, state, vendor } from './fixtures';

// Golden setup (see fixtures): forecast 10/day, LT 3, order days Mon/Thu, MOP = 40, COP = 70.

describe('golden: Monday order, on hand 100', () => {
  it('D1 = 3, D2 = 6; projected at end of D2−1 = 100 − 6×10 = 40 = MOP → can-order, qty 0', () => {
    const [p] = generateProposals(state());
    expect(p).toMatchObject({
      itemId: 'grain',
      vendorId: 'v',
      d1: 3,
      d2: 6,
      projectedAtD2: 40,
      mustOrderPoint: 40,
      canOrderPoint: 70,
      reason: 'can',
      qty: 0,
      cost: 0,
    });
  });

  it('planningParams agrees on an order day', () => {
    expect(planningParams(state(), 'grain', 'camp')).toEqual({
      itemId: 'grain',
      depotId: 'camp',
      vendorId: 'v',
      orderDay: 0,
      d1: 3,
      d2: 6,
      safetyStock: 0,
      mustOrderPoint: 40,
      canOrderPoint: 70,
      orderUpTo: 40,
      projectedAtD2: 40,
    });
  });
});

describe('golden: must orders', () => {
  it('on hand 70 → proj 10 < MOP 40 → must, need 30 → pack 12 rounds up to 36', () => {
    const s = state({ locations: [loc('grain', { onHand: 70 })], sourcing: [source('grain', 'v', { packSize: 12 })] });
    expect(generateProposals(s)).toEqual([
      {
        itemId: 'grain',
        depotId: 'camp',
        vendorId: 'v',
        qty: 36,
        reason: 'must',
        d1: 3,
        d2: 6,
        projectedAtD2: 10,
        mustOrderPoint: 40,
        canOrderPoint: 70,
        cost: 72,
      },
    ]);
  });

  it('Thursday order: D1 = 6, D2 = 10, proj = 100 − 7×10 = 30 → must 10 → pack 12', () => {
    const s = state({ today: 3, sourcing: [source('grain', 'v', { packSize: 12 })] });
    expect(generateProposals(s)[0]).toMatchObject({ d1: 6, d2: 10, projectedAtD2: 30, reason: 'must', qty: 12 });
  });

  it('open order before D2 counts: on hand 70 + 50 on day 2 → proj 60 → can', () => {
    const s = state({
      locations: [loc('grain', { onHand: 70 })],
      openOrders: [{ id: 'a', itemId: 'grain', depotId: 'camp', vendorId: 'v', qty: 50, orderedOn: -1, deliveryOn: 2, cost: 0 }],
    });
    expect(generateProposals(s)[0]).toMatchObject({ projectedAtD2: 60, reason: 'can', qty: 0 });
  });

  it('open order arriving on D2 itself is excluded by default, included with measureAtD2 = end-of-d2', () => {
    const s = state({
      locations: [loc('grain', { onHand: 70 })],
      openOrders: [{ id: 'a', itemId: 'grain', depotId: 'camp', vendorId: 'v', qty: 50, orderedOn: -1, deliveryOn: 6, cost: 0 }],
    });
    expect(generateProposals(s)[0]).toMatchObject({ projectedAtD2: 10, reason: 'must', qty: 30 });
    const endOfD2: Rules = { ...rules, projection: { ...rules.projection, measureAtD2: 'end-of-d2' } };
    // 70 − 7×10 + 50 = 50
    expect(generateProposals(s, endOfD2)[0]).toMatchObject({ projectedAtD2: 50, reason: 'can' });
  });

  it('battle-plan uplift in the coverage window raises the need', () => {
    const s = state({
      battlePlans: [
        { id: 'b', title: '', letter: '', announcedOn: 0, start: 4, end: 5, depotIds: ['camp'], statedUplift: { grain: 2 }, actualUplift: {} },
      ],
    });
    // Forecast 10,10,10,10,20,20 → proj 100 − 80 = 20; avg 80/6; COP = 40 + 3×80/6 = 80
    expect(generateProposals(s)[0]).toMatchObject({ projectedAtD2: 20, reason: 'must', qty: 20, canOrderPoint: 80 });
  });

  it('above COP → no proposal', () => {
    expect(generateProposals(state({ locations: [loc('grain', { onHand: 130 })] }))).toEqual([]);
    expect(generateProposals(state({ locations: [loc('grain', { onHand: 129 })] }))[0].reason).toBe('can');
  });
});

describe('non-order days and sourcing', () => {
  it('no proposals on Tuesday; planningParams looks ahead to Thursday', () => {
    const s = state({ today: 1 });
    expect(generateProposals(s)).toEqual([]);
    // From Tue: 9 days of forecast through day 9 → 100 − 90 = 10
    expect(planningParams(s, 'grain', 'camp')).toMatchObject({ orderDay: 3, d1: 6, d2: 10, projectedAtD2: 10, mustOrderPoint: 40 });
  });

  it('preferred source wins when both order today; a backup ordering sooner is used otherwise', () => {
    const s = state({
      vendors: { v: vendor('v'), w: vendor('w', { orderDays: [0, 1], leadTimeDays: 1 }) },
      sourcing: [source('grain', 'v'), source('grain', 'w', { priority: 2 })],
    });
    expect(planningParams(s, 'grain', 'camp')?.vendorId).toBe('v');
    expect(planningParams({ ...s, today: 1 }, 'grain', 'camp')).toMatchObject({ vendorId: 'w', orderDay: 1, d1: 2, d2: 8 });
  });

  it('unsourced item → undefined', () => {
    expect(planningParams(state({ sourcing: [] }), 'grain', 'camp')).toBeUndefined();
  });
});

describe('safety stock and MOP', () => {
  it('default rule: ceil(z(0.95) × σ × √(LT + review period))', () => {
    expect(zScore(0.95)).toBeCloseTo(1.6449, 3);
    // 1.6449 × 5 × √6 = 20.15 → 21
    expect(rules.safetyStock({ serviceLevel: 0.95, forecastErrorStdDev: 5, leadTimeDays: 3, reviewPeriodDays: 3, avgDailyForecast: 10 })).toBe(21);
  });

  it('MOP = safety stock from history error + presentation stock', () => {
    const history = [10, 10, 10, 20];
    const p = planningParams(state({ locations: [loc('grain', { history })] }), 'grain', 'camp')!;
    const expected = Math.ceil(zScore(0.95) * Math.sqrt(100 / 3) * Math.sqrt(6)); // = 24
    expect(p.safetyStock).toBe(expected);
    expect(p.mustOrderPoint).toBe(expected + 40);
  });
});

describe('pack rounding', () => {
  it("'up' always rounds up; exact multiples unchanged", () => {
    expect([0, 1, 12, 13, 30].map((n) => roundToPack(n, 12))).toEqual([0, 12, 12, 24, 36]);
  });

  it("'nearest' rounds up when the fraction ≥ threshold", () => {
    const half: Rules = { ...rules, packRounding: { mode: 'nearest', threshold: 0.5 } };
    expect(roundToPack(30, 12, half)).toBe(36); // 2.5 packs
    expect(roundToPack(30, 12, { ...rules, packRounding: { mode: 'nearest', threshold: 0.6 } })).toBe(24);
  });

  it('a must order that rounds to 0 still orders one pack', () => {
    const r: Rules = { ...rules, packRounding: { mode: 'nearest', threshold: 0.5 } };
    const s = state({ locations: [loc('grain', { onHand: 97 })], sourcing: [source('grain', 'v', { packSize: 12 })] });
    // proj 37, need 3 → 0.25 pack → 0 → bumped to 12
    expect(generateProposals(s, r)[0]).toMatchObject({ reason: 'must', qty: 12 });
  });
});

describe('golden: deficit before D2 (lost sales must not hide demand D1..D2)', () => {
  // On hand 20, 20/day, MOP 16 (presentation). Mon order: D1 = 3, D2 = 6.
  // Days 0–2 clamp at 0 (sales before D1 are lost either way); days 3–5 need 60 more.
  const s = state({
    locations: [loc('grain', { onHand: 20, history: flat(20), presentationStock: 16 })],
  });

  it('projectedAtD2 = −60 and qty = MOP − (−60) = 76', () => {
    expect(generateProposals(s)[0]).toMatchObject({ d1: 3, d2: 6, projectedAtD2: -60, mustOrderPoint: 16, reason: 'must', qty: 76 });
  });

  it('with the order arriving at D1, stock at end of D2−1 is exactly MOP', () => {
    const qty = generateProposals(s)[0].qty;
    // Arrives day 3 on an empty camp; days 3, 4, 5 consume 60.
    expect(qty - 3 * 20).toBe(16);
  });
});
