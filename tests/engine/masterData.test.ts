import { describe, expect, it } from 'vitest';
import { itemLocationStats, vendorStats } from '../../src/engine/masterData';
import { tick } from '../../src/engine/tick';
import type { DeliveryRecord, OpenOrder } from '../../src/engine/types';
import { flat, loc, quietRules as q, source, state, vendor } from './fixtures';

describe('itemLocationStats', () => {
  it('golden row on the fixture (Mon, Mon/Thu LT 3, 10/day, 100 on hand)', () => {
    expect(itemLocationStats(state())).toEqual([
      {
        itemId: 'grain',
        depotId: 'camp',
        vendorId: 'v',
        onHand: 100,
        avgDailySales: 10,
        avgForecastNext: 10,
        safetyStock: 0,
        minimumFill: 40,
        mustOrderPoint: 40,
        orderDay: 0,
        reviewPeriodDays: 3,
        leadTimeDays: 3,
        packSize: 1,
        unitCost: 2,
        daysOfSupply: 10,
        campaignDemand: 0,
        campaignFulfilled: 0,
        serviceLevelToDate: null,
      },
    ]);
  });

  it('avg sales over the last 28 days of history; avg forecast over the next 7 (overrides count)', () => {
    const s = state({
      locations: [loc('grain', { history: [...flat(5, 30), ...flat(10, 28)] })],
      overrides: [{ itemId: 'grain', depotId: 'camp', from: 0, to: 6, mode: 'aggregate', value: 140 }],
    });
    const row = itemLocationStats(s)[0];
    expect(row.avgDailySales).toBe(10);
    expect(row.avgForecastNext).toBeCloseTo(20, 9); // aggregate 140 over 7 days
  });

  it('service level to date: null before demand, then fulfilled / demand', () => {
    let s = state({ locations: [loc('grain', { onHand: 15 })] });
    expect(itemLocationStats(s)[0].serviceLevelToDate).toBeNull();
    s = tick(tick(s, q), q); // day 0: 10/10; day 1: 5/10
    expect(itemLocationStats(s)[0]).toMatchObject({ campaignDemand: 20, campaignFulfilled: 15, serviceLevelToDate: 0.75 });
  });

  it('one row per location, same order; unsourced items have no planning fields', () => {
    const s = state({ sourcing: [], locations: [loc('grain'), loc('grain', { depotId: 'north' })] });
    const rows = itemLocationStats(s);
    expect(rows.map((r) => r.depotId)).toEqual(['camp', 'north']);
    expect(rows[0]).toMatchObject({ vendorId: undefined, safetyStock: undefined, mustOrderPoint: undefined, reviewPeriodDays: undefined });
  });
});

describe('vendorStats', () => {
  const rec = (orderedOn: number, promisedOn: number, receivedOn: number, qty = 10): DeliveryRecord => ({
    orderId: `r${orderedOn}`,
    itemId: 'grain',
    depotId: 'camp',
    vendorId: 'v',
    qty,
    cost: qty * 2,
    orderedOn,
    promisedOn,
    receivedOn,
  });
  const open = (orderedOn: number, promisedOn: number, deliveryOn: number, qty = 10): OpenOrder => ({
    id: `o${orderedOn}`,
    itemId: 'grain',
    depotId: 'camp',
    vendorId: 'v',
    qty,
    orderedOn,
    deliveryOn,
    promisedOn,
    cost: qty * 2,
  });

  it('performance from a hand-made log; opening orders (orderedOn < 0) excluded', () => {
    const s = state({
      today: 9,
      // on time (lead 3), late by 2 (lead 5), and an opening order that doesn't count
      deliveries: [rec(0, 3, 3), rec(1, 4, 6, 20), rec(-2, 1, 2)],
      // overdue (promised 8, now due 9), not yet due, and an opening order
      openOrders: [open(5, 8, 9, 5), open(7, 10, 10), open(-1, 2, 12)],
    });
    expect(vendorStats(s)).toEqual([
      {
        vendorId: 'v',
        defaultOrderDays: [0, 3],
        orderDays: [0, 3],
        nextOrderDay: 10, // day 9 is Wed → Thu
        leadTimeDays: 3,
        reliability: 1,
        trigger: 0.5,
        customTrigger: false,
        itemsSupplied: 1,
        ordersPlaced: 4,
        unitsOrdered: 45,
        spend: 90,
        delivered: 2,
        onTime: 1,
        late: 1,
        onTimeRate: 0.5,
        avgLeadTimeActual: 4,
        avgDaysLate: 2,
        openOrders: 2,
        openUnits: 15,
        openValue: 30,
        overdueOpen: 1,
      },
    ]);
  });

  it('no history: rates are null', () => {
    expect(vendorStats(state())[0]).toMatchObject({ delivered: 0, onTimeRate: null, avgLeadTimeActual: null, avgDaysLate: null, ordersPlaced: 0 });
  });

  it('schedule override, custom trigger, minimum, items supplied', () => {
    const s = state({
      today: 1,
      vendors: { v: vendor('v', { minimum: { kind: 'units', amount: 50 } }) },
      sourcing: [source('grain'), source('salt'), source('grain', 'v', { priority: 2 })],
      vendorOrderDays: { v: { kind: 'daily' } },
      vendorTriggers: { v: 0.25 },
    });
    expect(vendorStats(s)[0]).toMatchObject({
      defaultOrderDays: [0, 3],
      orderDays: [0, 1, 2, 3, 4, 5, 6],
      schedule: { kind: 'daily' },
      nextOrderDay: 1,
      minimum: { kind: 'units', amount: 50 },
      trigger: 0.25,
      customTrigger: true,
      itemsSupplied: 2,
    });
  });

  it('a vendor with no order days has no next order day', () => {
    expect(vendorStats(state({ vendors: { v: vendor('v', { orderDays: [] }) } }))[0].nextOrderDay).toBeUndefined();
  });
});
