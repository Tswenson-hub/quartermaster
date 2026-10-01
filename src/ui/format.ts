import type { Day } from '../engine/types';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const weekdayName = (day: Day) => WEEKDAYS[((day % 7) + 7) % 7];

/** "Thu 10" — weekday + day number. */
export const fmtDay = (day: Day) => `${weekdayName(day)} ${day}`;

export const fmtSilver = (n: number) => `${Math.round(n).toLocaleString('en-GB')} s`;

export const fmtQty = (n: number) => Math.round(n).toLocaleString('en-GB');
