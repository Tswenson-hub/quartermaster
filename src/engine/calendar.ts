// Order calendar: order weekdays, lead times, D1/D2 (docs/RELEX_RULES.md §1).
import type { Day, GameState, Vendor, VendorId, Weekday } from './types';

export function weekdayOf(day: Day): Weekday {
  return (((day % 7) + 7) % 7) as Weekday;
}

export function isOrderDay(vendor: Vendor, day: Day): boolean {
  return vendor.orderDays.includes(weekdayOf(day));
}

/** First order day of `vendor` strictly after `day`. */
export function nextOrderDayAfter(vendor: Vendor, day: Day): Day {
  if (vendor.orderDays.length === 0) throw new Error(`Vendor ${vendor.id} has no order days`);
  for (let d = day + 1; d <= day + 7; d++) if (isOrderDay(vendor, d)) return d;
  throw new Error('unreachable');
}

/** First order day of `vendor` on or after `day`. */
export function nextOrderDayFrom(vendor: Vendor, day: Day): Day {
  return isOrderDay(vendor, day) ? day : nextOrderDayAfter(vendor, day);
}

/** Days until the next order opportunity after `day` (RELEX review period). */
export function reviewPeriodDays(vendor: Vendor, day: Day): number {
  return nextOrderDayAfter(vendor, day) - day;
}

export interface DeliveryDates {
  /** Delivery of an order placed on the given day. */
  d1: Day;
  /** Delivery of the next order opportunity — the coverage horizon. */
  d2: Day;
}

/** D1/D2 for an order placed on `orderDay` (need not be an order day; e.g. a manual order). */
export function deliveryDates(vendor: Vendor, orderDay: Day): DeliveryDates {
  return {
    d1: orderDay + vendor.leadTimeDays,
    d2: nextOrderDayAfter(vendor, orderDay) + vendor.leadTimeDays,
  };
}

const ALL_DAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6];
const isWeekday = (x: unknown): x is Weekday => Number.isInteger(x) && (x as number) >= 0 && (x as number) <= 6;

/**
 * A vendor's order weekdays after the player's schedule override (GameState.vendorOrderDays):
 * 'daily' → every day; 'weekly' → that weekday (an invalid weekday falls back to the vendor's
 * own days); no override → Vendor.orderDays. Unknown vendor → [].
 */
export function effectiveOrderDays(state: GameState, vendorId: VendorId): Weekday[] {
  const vendor = state.vendors[vendorId];
  if (!vendor) return [];
  const schedule = state.vendorOrderDays?.[vendorId];
  if (schedule?.kind === 'daily') return [...ALL_DAYS];
  if (schedule?.kind === 'weekly' && isWeekday(schedule.weekday)) return [schedule.weekday];
  return vendor.orderDays;
}

/**
 * The vendor with its effective order days, or undefined if it is unknown or has no order
 * days at all. Planning code goes through this, so nextOrderDayAfter never sees an empty calendar.
 */
export function effectiveVendor(state: GameState, vendorId: VendorId): Vendor | undefined {
  const vendor = state.vendors[vendorId];
  if (!vendor) return undefined;
  const orderDays = effectiveOrderDays(state, vendorId);
  if (orderDays.length === 0) return undefined;
  return orderDays === vendor.orderDays ? vendor : { ...vendor, orderDays };
}
