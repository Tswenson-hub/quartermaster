import type { DepotId, Vendor, VendorId } from '../engine/types';

/**
 * Suppliers to the army. Weekdays: 0 = Monday … 6 = Sunday.
 *
 * `reliability` is the chance a delivery arrives on time and in full (1 = never fails).
 * `orderTrigger` (vendors with a minimum): fraction of the minimum the real must-order need must reach
 * before the system builds the order up to the minimum, one pack at a time (RELEX_RULES §4). Below
 * it, no proposal is made for that vendor. The player can change it per vendor.
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
    // Builds readily: half a minimum of real need is enough to fill the order.
    orderTrigger: 0.5,
    reliability: 0.9,
  },
  {
    // A week's haul down the mountain by mule. The smith wants it worth the trip.
    id: 'mountain-smithy',
    name: 'Ironhollow Mountain Smithy',
    orderDays: [2],
    leadTimeDays: 7,
    minimum: { kind: 'value', amount: 250 },
    // High trigger: a garrison's weekly need (~75% of the minimum) will NOT fire at default —
    // the player must lower it (or let need accumulate) to get the mules moving.
    orderTrigger: 0.8,
    reliability: 0.8,
  },
  {
    // Barges three days a week, three days downriver — when the river isn't in flood and the tolls are paid.
    id: 'river-merchants',
    name: 'Merchants of the Silverwash',
    orderDays: [0, 2, 4],
    leadTimeDays: 3,
    reliability: 0.75,
  },
  {
    // Brother Fennick's boy rides out every day but the Sabbath; the road to camp takes three days.
    id: 'apothecary',
    name: "Brother Fennick's Apothecary",
    orderDays: [0, 1, 2, 3, 4, 5],
    leadTimeDays: 3,
    reliability: 0.97,
  },
  {
    // The Crown's own stores: dependable, costly, and the chancery only signs warrants on Fridays.
    id: 'royal-armory',
    name: 'Royal Armory of Kingsreach',
    orderDays: [4],
    leadTimeDays: 4,
    minimum: { kind: 'value', amount: 400 },
    orderTrigger: 0.6,
    reliability: 0.99,
  },

  // --- Internal transfer lanes (DC → front). Not outside suppliers: transfers ship from DC stock,
  // cost nothing against the budget, and have no minimum. Order days/lead time describe the lane.
  {
    // The King's Road is paved and short: wagons leave every day but the Sabbath, arrive next day.
    id: 'lane-kingsreach-east',
    name: 'Kingsreach → Eastern Camp wagons',
    dcDepotId: 'kingsreach-dc',
    orderDays: [0, 1, 2, 3, 4, 5],
    leadTimeDays: 1,
    reliability: 0.98,
  },
  {
    // Escorted convoys to the siege lines, three times a week, two days on the road.
    id: 'lane-kingsreach-harrowmere',
    name: 'Kingsreach → Harrowmere convoy',
    dcDepotId: 'kingsreach-dc',
    orderDays: [0, 2, 4],
    leadTimeDays: 2,
    reliability: 0.95,
  },
];

/** Which front depot each DC transfer lane serves (the lane vendor's sourcing rules are scoped to it). */
export const DC_LANES: { vendorId: VendorId; dcDepotId: DepotId; frontDepotId: DepotId }[] = [
  { vendorId: 'lane-kingsreach-east', dcDepotId: 'kingsreach-dc', frontDepotId: 'eastern-camp' },
  { vendorId: 'lane-kingsreach-harrowmere', dcDepotId: 'kingsreach-dc', frontDepotId: 'harrowmere' },
];

export const VENDORS: Record<VendorId, Vendor> = Object.fromEntries(list.map((v) => [v.id, v]));
