// M2: lot-based spoilage, reliability-driven late deliveries, vendor-minimum surcharge.
import { describe, expect, it } from 'vitest';
import { addLot, consume, expire, lotsOf } from '../../src/engine/lots';
import { placeOrders, refresh, tick } from '../../src/engine/tick';
import type { GameState, OpenOrder, Vendor } from '../../src/engine/types';
import { item, loc, quietRules as q, source, state, vendor } from './fixtures';

const order = (extra: Partial<OpenOrder>): OpenOrder => ({
  id: 'o',
  itemId: 'grain',
  depotId: 'camp',
  vendorId: 'v',
  qty: 30,
  orderedOn: 0,
  deliveryOn: 3,
  cost: 60,
  ...extra,
});

describe('lots', () => {
  it('missing lots = all stock received today; reconciles to onHand', () => {
    expect(lotsOf(loc('grain', { onHand: 50 }), 4)).toEqual([{ qty: 50, receivedOn: 4 }]);
    expect(lotsOf(loc('grain', { onHand: 0 }), 4)).toEqual([]);
    expect(lotsOf(loc('grain', { onHand: 50, lots: [{ qty: 40, receivedOn: 1 }] }), 4)).toEqual([
      { qty: 40, receivedOn: 1 },
      { qty: 10, receivedOn: 4 },
    ]);
    expect(lotsOf(loc('grain', { onHand: 30, lots: [{ qty: 20, receivedOn: 1 }, { qty: 20, receivedOn: 2 }] }), 4)).toEqual([
      { qty: 10, receivedOn: 1 },
      { qty: 20, receivedOn: 2 },
    ]);
  });

  it('FIFO consume, same-day receipts merge', () => {
    const lots = addLot(addLot([{ qty: 5, receivedOn: 0 }], 10, 2), 3, 2);
    expect(lots).toEqual([{ qty: 5, receivedOn: 0 }, { qty: 13, receivedOn: 2 }]);
    expect(consume(lots, 7)).toEqual({ lots: [{ qty: 11, receivedOn: 2 }], taken: 7 });
    expect(consume(lots, 99).taken).toBe(18);
  });

  it('a lot received day r with shelf life L spoils at the end of day r + L − 1', () => {
    const lots = [{ qty: 5, receivedOn: 0 }, { qty: 7, receivedOn: 1 }];
    expect(expire(lots, 1, 3).spoiled).toBe(0);
    expect(expire(lots, 2, 3)).toEqual({ lots: [{ qty: 7, receivedOn: 1 }], spoiled: 5 });
    expect(expire(lots, 0, 1).spoiled).toBe(5);
  });
});

describe('tick: lot-based spoilage', () => {
  const perishable = (extra: Partial<GameState> = {}) =>
    state({ items: { grain: item('grain', { shelfLifeDays: 3 }) }, ...extra });

  it('opening stock (no lots) ages from day 0: 90, 80, then the remaining 70 spoil on day 2', () => {
    let s = perishable();
    const onHand: number[] = [];
    for (let i = 0; i < 3; i++) {
      s = tick(s, q);
      onHand.push(s.locations[0].onHand);
    }
    expect(onHand).toEqual([90, 80, 0]);
    expect(s.kpis.map((k) => k.spoiled)).toEqual([0, 0, 70]);
    expect(s.locations[0].lots).toEqual([]);
    expect(s.exceptions).toContainEqual(expect.objectContaining({ kind: 'spoilage', day: 2 }));
  });

  it('demand takes the oldest lot first; the fresh receipt survives', () => {
    let s = perishable({ openOrders: [order({ deliveryOn: 1, orderedOn: -2 })] });
    s = tick(tick(tick(s, q), q), q);
    // Day 0: [90@0]; day 1: +30@1, sell 10 → [80@0, 30@1]; day 2: sell 10 → 70@0 spoils.
    expect(s.locations[0]).toMatchObject({ onHand: 30, lots: [{ qty: 30, receivedOn: 1 }] });
    expect(s.kpis[2].spoiled).toBe(70);
  });

  it('non-perishables carry no lots', () => {
    expect(tick(state(), q).locations[0].lots).toBeUndefined();
  });
});

describe('tick: late deliveries', () => {
  const fixedLate = { ...q, delivery: { lateDaysMin: 2, lateDaysMax: 2 } };
  const withVendor = (v: Partial<Vendor>) =>
    state({ today: 3, vendors: { v: vendor('v', v) }, openOrders: [order({})] });

  it('reliability 0: due day 3 → pushed to day 5, flagged, and not delayed twice', () => {
    let s = tick(withVendor({ reliability: 0 }), fixedLate);
    expect(s.openOrders).toEqual([expect.objectContaining({ deliveryOn: 5 })]);
    expect(s.locations[0].onHand).toBe(90);
    expect(s.exceptions).toContainEqual(expect.objectContaining({ kind: 'delivery-late', day: 3, vendorId: 'v' }));
    s = tick(tick(s, fixedLate), fixedLate);
    expect(s.openOrders).toEqual([]);
    expect(s.locations[0].onHand).toBe(100); // 100 − 3×10 + 30
  });

  it('reliability 1 never fails', () => {
    const s = tick(withVendor({ reliability: 1 }), fixedLate);
    expect(s.openOrders).toEqual([]);
    expect(s.locations[0].onHand).toBe(120);
  });

  it('failure rate tracks 1 − reliability (seeded)', () => {
    let late = 0;
    for (let seed = 0; seed < 400; seed++) {
      const s = tick({ ...withVendor({ reliability: 0.8 }), seed }, q);
      if (s.openOrders.length > 0) late++;
    }
    expect(late / 400).toBeGreaterThan(0.15);
    expect(late / 400).toBeLessThan(0.25);
  });
});

describe('placeOrders: vendor-minimum surcharge', () => {
  // One must line: 30 units @ 2 silver; no can items to top up.
  const short = (minimum: Vendor['minimum']) =>
    refresh(state({ locations: [loc('grain', { onHand: 70 })], vendors: { v: vendor('v', { minimum }) } }), q);
  const acceptAll = (s: GameState) => placeOrders(s, s.proposals.map((_, index) => ({ index, decision: 'accepted' as const })), q);

  it('short order with a surcharge: accepted, surcharge added once to the cost', () => {
    const s0 = short({ kind: 'units', amount: 100, surcharge: 15 });
    expect(s0.exceptions).toContainEqual(expect.objectContaining({ kind: 'vendor-min-shortfall' }));
    const s = acceptAll(s0);
    expect(s.openOrders).toEqual([expect.objectContaining({ qty: 30, cost: 75 })]);
    expect(s.periods[0].committed).toBe(75);
  });

  it('short order without a surcharge is dropped', () => {
    const s0 = short({ kind: 'units', amount: 100 });
    expect(acceptAll(s0)).toBe(s0);
  });

  it('minimum met: no surcharge; value minimums use cost', () => {
    expect(acceptAll(short({ kind: 'value', amount: 60, surcharge: 15 })).openOrders[0].cost).toBe(60);
  });

  it('surcharge applies once per vendor order per day, across lines and calls', () => {
    const s0 = refresh(
      state({
        items: { grain: item('grain'), salt: item('salt') },
        vendors: { v: vendor('v', { minimum: { kind: 'units', amount: 100, surcharge: 15 } }) },
        sourcing: [source('grain'), source('salt')],
        locations: [loc('grain', { onHand: 70 }), loc('salt', { onHand: 70 })],
      }),
      q,
    );
    const first = placeOrders(s0, [{ index: 0, decision: 'accepted' }], q);
    expect(first.openOrders.map((o) => o.cost)).toEqual([75]);
    const salt = first.proposals.findIndex((p) => p.itemId === 'salt');
    const second = placeOrders(first, [{ index: salt, decision: 'accepted' }], q);
    expect(second.openOrders.map((o) => o.cost)).toEqual([75, 60]);
    expect(second.periods[0].committed).toBe(135);
  });
});
