// FIFO stock lots for perishables (ItemLocation.lots, oldest first, sum = onHand).
import type { Day, ItemLocation } from './types';

export type Lot = NonNullable<ItemLocation['lots']>[number];

/** Lots for a location; missing lots mean all stock was received `today`. Reconciles to onHand. */
export function lotsOf(loc: ItemLocation, today: Day): Lot[] {
  if (!loc.lots) return loc.onHand > 0 ? [{ qty: loc.onHand, receivedOn: today }] : [];
  const lots = loc.lots.filter((l) => l.qty > 0).map((l) => ({ ...l }));
  const sum = lots.reduce((s, l) => s + l.qty, 0);
  if (sum < loc.onHand) return addLot(lots, loc.onHand - sum, today);
  if (sum > loc.onHand) return consume(lots, sum - loc.onHand).lots;
  return lots;
}

/** Append a receipt (merged into the newest lot if received the same day). */
export function addLot(lots: readonly Lot[], qty: number, day: Day): Lot[] {
  if (qty <= 0) return [...lots];
  const last = lots[lots.length - 1];
  if (last && last.receivedOn === day) return [...lots.slice(0, -1), { qty: last.qty + qty, receivedOn: day }];
  return [...lots, { qty, receivedOn: day }];
}

/** Take up to `qty` oldest-first. */
export function consume(lots: readonly Lot[], qty: number): { lots: Lot[]; taken: number } {
  const out: Lot[] = [];
  let left = qty;
  for (const l of lots) {
    const take = Math.min(left, l.qty);
    left -= take;
    if (l.qty - take > 0) out.push({ qty: l.qty - take, receivedOn: l.receivedOn });
  }
  return { lots: out, taken: qty - left };
}

/**
 * End-of-day expiry: a lot received on day r is sellable on days r … r + shelfLife − 1 and
 * spoils at the end of the last one.
 */
export function expire(lots: readonly Lot[], today: Day, shelfLifeDays: number): { lots: Lot[]; spoiled: number } {
  const keep = lots.filter((l) => today - l.receivedOn + 1 < shelfLifeDays);
  const spoiled = lots.reduce((s, l) => s + l.qty, 0) - keep.reduce((s, l) => s + l.qty, 0);
  return { lots: keep, spoiled };
}
