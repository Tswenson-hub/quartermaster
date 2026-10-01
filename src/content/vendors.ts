import type { Vendor, VendorId } from '../engine/types';

/**
 * Suppliers to the army. Weekdays: 0 = Monday … 6 = Sunday.
 *
 * `reliability` is read as the chance a delivery arrives on time and in full (1 = never fails).
 * Each vendor has a distinct order rhythm so D2 (the next order opportunity's delivery) differs.
 */
const list: Vendor[] = [
  {
    // Steady and close, but the lay brothers only load the carts after Monday and Thursday prayers.
    id: 'abbey-granary',
    name: "St. Aldric's Abbey Granary",
    orderDays: [0, 3],
    leadTimeDays: 3,
    reliability: 0.95,
  },
  {
    // The guild dispatches once a week and will not fire up the shop for a handful of sheaves.
    id: 'guild-fletchers',
    name: 'Worshipful Guild of Fletchers',
    orderDays: [1],
    leadTimeDays: 5,
    minimum: { kind: 'units', amount: 120 },
    reliability: 0.9,
  },
  {
    // A week's haul down the mountain by mule. The smith wants it worth the trip.
    id: 'mountain-smithy',
    name: 'Ironhollow Mountain Smithy',
    orderDays: [2],
    leadTimeDays: 7,
    minimum: { kind: 'value', amount: 250 },
    reliability: 0.8,
  },
  {
    // Fast barges three days a week — when the river isn't in flood and the tolls are paid.
    id: 'river-merchants',
    name: 'Merchants of the Silverwash',
    orderDays: [0, 2, 4],
    leadTimeDays: 2,
    reliability: 0.75,
  },
  {
    // Brother Fennick's boy rides out every day but the Sabbath.
    id: 'apothecary',
    name: "Brother Fennick's Apothecary",
    orderDays: [0, 1, 2, 3, 4, 5],
    leadTimeDays: 1,
    reliability: 0.97,
  },
  {
    // The Crown's own stores: dependable, costly, and the chancery only signs warrants on Fridays.
    id: 'royal-armory',
    name: 'Royal Armory of Kingsreach',
    orderDays: [4],
    leadTimeDays: 4,
    minimum: { kind: 'value', amount: 400 },
    reliability: 0.99,
  },
];

export const VENDORS: Record<VendorId, Vendor> = Object.fromEntries(list.map((v) => [v.id, v]));
