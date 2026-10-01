import type { Day } from '../engine/types';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const weekdayName = (day: Day) => WEEKDAYS[((day % 7) + 7) % 7];

/** "Thu 10" — weekday + day number. */
export const fmtDay = (day: Day) => `${weekdayName(day)} ${day}`;

export const fmtSilver = (n: number) => `${Math.round(n).toLocaleString('en-GB')} s`;

export const fmtQty = (n: number) => Math.round(n).toLocaleString('en-GB');

/** "Mon/Thu", or "Every day" when all seven weekdays are order days. */
export const fmtOrderDays = (days: readonly number[]) =>
  days.length >= 7 ? 'Every day' : [...days].sort((a, b) => a - b).map(weekdayName).join('/') || '—';

/** Days of supply for display: one decimal, capped at "999+". */
export const fmtDaysOfSupply = (d: number) => (!Number.isFinite(d) || d > 999 ? '999+' : (Math.round(d * 10) / 10).toString());

export const fmtPct = (f: number | null | undefined) => (f === null || f === undefined ? '—' : `${Math.round(f * 1000) / 10}%`);
