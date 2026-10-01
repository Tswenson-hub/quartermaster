import { describe, expect, it } from 'vitest';
import {
  deliveryDates,
  effectiveOrderDays,
  effectiveVendor,
  isOrderDay,
  nextOrderDayAfter,
  nextOrderDayFrom,
  reviewPeriodDays,
  weekdayOf,
} from '../../src/engine/calendar';
import type { GameState, Weekday } from '../../src/engine/types';
import { state, vendor } from './fixtures';

const monThu = vendor('v'); // Mon/Thu, LT 3

describe('calendar', () => {
  it('maps days to weekdays with day 0 = Monday', () => {
    expect([0, 3, 6, 7, 13, -1].map(weekdayOf)).toEqual([0, 3, 6, 0, 6, 6]);
  });

  it('finds order days', () => {
    expect(isOrderDay(monThu, 0)).toBe(true);
    expect(isOrderDay(monThu, 1)).toBe(false);
    expect(nextOrderDayAfter(monThu, 0)).toBe(3);
    expect(nextOrderDayAfter(monThu, 3)).toBe(7);
    expect(nextOrderDayFrom(monThu, 3)).toBe(3);
    expect(nextOrderDayFrom(monThu, 4)).toBe(7);
  });

  it('Mon order: D1 = Thu (3), D2 = next order Thu + 3 = Sun (6)', () => {
    expect(deliveryDates(monThu, 0)).toEqual({ d1: 3, d2: 6 });
    expect(reviewPeriodDays(monThu, 0)).toBe(3);
  });

  it('Thu order: D1 = Sun (6), D2 = next Mon (7) + 3 = Thu (10)', () => {
    expect(deliveryDates(monThu, 3)).toEqual({ d1: 6, d2: 10 });
    expect(reviewPeriodDays(monThu, 3)).toBe(4);
  });

  it('weekly vendor: D2 is a week after D1', () => {
    expect(deliveryDates(vendor('w', { orderDays: [2], leadTimeDays: 5 }), 2)).toEqual({ d1: 7, d2: 14 });
  });

  it('throws for a vendor with no order days', () => {
    expect(() => nextOrderDayAfter(vendor('x', { orderDays: [] }), 0)).toThrow();
  });
});

describe('effective order days (player schedule override)', () => {
  const s = (vendorOrderDays: GameState['vendorOrderDays'] = {}) => state({ vendorOrderDays });

  it('default: the vendor’s own days', () => {
    expect(effectiveOrderDays(s(), 'v')).toEqual([0, 3]);
    expect(effectiveVendor(s(), 'v')?.orderDays).toEqual([0, 3]);
  });

  it('daily → every weekday', () => {
    expect(effectiveOrderDays(s({ v: { kind: 'daily' } }), 'v')).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(effectiveVendor(s({ v: { kind: 'daily' } }), 'v')).toMatchObject({ id: 'v', leadTimeDays: 3, orderDays: [0, 1, 2, 3, 4, 5, 6] });
  });

  it('weekly → that weekday', () => {
    expect(effectiveOrderDays(s({ v: { kind: 'weekly', weekday: 4 } }), 'v')).toEqual([4]);
  });

  it('invalid weekly weekday falls back to the vendor’s days', () => {
    for (const weekday of [7, -1, 2.5, NaN]) {
      expect(effectiveOrderDays(s({ v: { kind: 'weekly', weekday: weekday as Weekday } }), 'v')).toEqual([0, 3]);
    }
  });

  it('unknown vendor or no days at all → undefined (the guard for nextOrderDayAfter)', () => {
    expect(effectiveOrderDays(s(), 'nobody')).toEqual([]);
    expect(effectiveVendor(s(), 'nobody')).toBeUndefined();
    expect(effectiveVendor(state({ vendors: { v: vendor('v', { orderDays: [] }) } }), 'v')).toBeUndefined();
    // A daily override rescues a vendor with no days of its own.
    expect(effectiveVendor(state({ vendors: { v: vendor('v', { orderDays: [] }) }, vendorOrderDays: { v: { kind: 'daily' } } }), 'v')).toBeDefined();
  });
});
