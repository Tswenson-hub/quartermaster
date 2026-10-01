// Order calendar: order weekdays, lead times, D1/D2 (docs/RELEX_RULES.md §1).
import type { Day, Vendor, Weekday } from './types';

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
