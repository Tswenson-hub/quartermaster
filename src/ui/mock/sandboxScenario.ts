// Sandbox scenario for UI development. Offered on the title screen only when src/content has no
// scenarios yet; it runs through the real store + engine like any other level. Not game content.

import type {
  BattlePlan,
  Depot,
  Item,
  ItemLocation,
  OpenOrder,
  Scenario,
  SourcingRule,
  Vendor,
} from '../../engine/types';

const HISTORY_DAYS = 28; // pre-campaign history; last entry = yesterday (day -1)

/** Tiny deterministic LCG so the mock history is stable across reloads. */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const WEEK_SHAPE = [1.1, 1.0, 0.95, 1.0, 1.15, 0.9, 0.8];

function mockHistory(base: number, seed: number, days = HISTORY_DAYS): number[] {
  const rnd = lcg(seed);
  return Array.from({ length: days }, (_, d) =>
    Math.max(0, Math.round(base * WEEK_SHAPE[d % 7] * (0.8 + rnd() * 0.4))),
  );
}

const items: Record<string, Item> = {
  grain: { id: 'grain', name: 'Oat & Barley Meal', category: 'rations', icon: 'grain', unit: 'sack', shelfLifeDays: 60, holdingCost: 0.05, criticality: 5 },
  saltpork: { id: 'saltpork', name: 'Salt Pork', category: 'rations', icon: 'saltpork', unit: 'barrel', shelfLifeDays: 90, holdingCost: 0.2, criticality: 4 },
  fodder: { id: 'fodder', name: 'Hay Fodder', category: 'fodder', icon: 'fodder', unit: 'sheaf', shelfLifeDays: 21, holdingCost: 0.03, criticality: 4 },
  arrows: { id: 'arrows', name: 'Bodkin Arrows', category: 'munitions', icon: 'arrows', unit: 'quiver', holdingCost: 0.02, criticality: 5 },
  horseshoes: { id: 'horseshoes', name: 'Horseshoes', category: 'tools', icon: 'horseshoes', unit: 'set', holdingCost: 0.01, criticality: 3 },
  bandages: { id: 'bandages', name: 'Linen Bandages', category: 'medical', icon: 'bandages', unit: 'roll', shelfLifeDays: 180, holdingCost: 0.01, criticality: 3 },
};

const vendors: Record<string, Vendor> = {
  millbrook: { id: 'millbrook', name: 'Millbrook Granary', orderDays: [0, 3], leadTimeDays: 2, minimum: { kind: 'value', amount: 600 }, reliability: 0.95 },
  ironhold: { id: 'ironhold', name: 'Ironhold Smithy', orderDays: [0], leadTimeDays: 5, minimum: { kind: 'units', amount: 120 }, reliability: 0.85 },
  abbey: { id: 'abbey', name: 'Abbey of St. Wendel', orderDays: [0, 2, 4], leadTimeDays: 1, reliability: 0.98 },
};

const depots: Record<string, Depot> = {
  eastern: { id: 'eastern', name: 'Eastern Camp' },
  harrow: { id: 'harrow', name: 'Siege Lines at Harrowmere' },
};

const sourcing: SourcingRule[] = [
  { itemId: 'grain', vendorId: 'millbrook', unitCost: 3, packSize: 10, priority: 1 },
  { itemId: 'fodder', vendorId: 'millbrook', unitCost: 1, packSize: 20, priority: 1 },
  { itemId: 'saltpork', vendorId: 'millbrook', unitCost: 8, packSize: 4, priority: 1 },
  { itemId: 'saltpork', vendorId: 'abbey', unitCost: 9, packSize: 2, priority: 2 },
  { itemId: 'arrows', vendorId: 'ironhold', unitCost: 2, packSize: 12, priority: 1 },
  { itemId: 'horseshoes', vendorId: 'ironhold', unitCost: 4, packSize: 8, priority: 1 },
  { itemId: 'bandages', vendorId: 'abbey', unitCost: 1.5, packSize: 10, priority: 1 },
];

const loc = (itemId: string, depotId: string, onHand: number, base: number, seed: number, presentationStock = 0): ItemLocation => ({
  itemId,
  depotId,
  onHand,
  serviceLevel: 0.95,
  presentationStock,
  history: mockHistory(base, seed),
});

const locations: ItemLocation[] = [
  loc('grain', 'eastern', 95, 30, 11, 20),
  loc('saltpork', 'eastern', 40, 6, 12),
  loc('fodder', 'eastern', 160, 45, 13),
  loc('arrows', 'eastern', 220, 25, 14),
  loc('horseshoes', 'eastern', 30, 4, 15),
  loc('bandages', 'eastern', 55, 8, 16),
  loc('grain', 'harrow', 140, 20, 21, 10),
  loc('arrows', 'harrow', 90, 35, 22),
];

const battlePlans: BattlePlan[] = [
  {
    id: 'bp-harrowmere',
    title: 'The Assault on Harrowmere',
    letter:
      'Quartermaster — on the Monday next we storm the walls of Harrowmere. Expect the archers to loose thrice their wont, and the barber-surgeons to bind twice as many wounds. Fill the carts accordingly, and let no man say the bows fell silent for want of shafts. — Lord Marshal Aldric',
    announcedOn: 0,
    start: 7,
    end: 13,
    depotIds: ['harrow', 'eastern'],
    statedUplift: { arrows: 3, bandages: 2, grain: 1.2 },
    actualUplift: { arrows: 2.4, bandages: 2.6, grain: 1.1 },
  },
  {
    id: 'bp-feast',
    title: 'Feast of St. Wendel',
    letter:
      'The men shall feast on the Saint’s day. See that the pork barrels are full and the oats plentiful, for a fed army is a loyal army. — Captain Mirelle',
    announcedOn: -10,
    start: -7,
    end: -6,
    depotIds: ['eastern'],
    statedUplift: { saltpork: 2, grain: 1.3 },
    actualUplift: { saltpork: 2.2, grain: 1.25 },
  },
];

const openOrders: OpenOrder[] = [
  { id: 'oo-1', itemId: 'fodder', depotId: 'eastern', vendorId: 'millbrook', qty: 140, orderedOn: -3, deliveryOn: 1, cost: 140 },
  { id: 'oo-2', itemId: 'horseshoes', depotId: 'eastern', vendorId: 'ironhold', qty: 24, orderedOn: -4, deliveryOn: 2, cost: 96 },
  { id: 'oo-3', itemId: 'arrows', depotId: 'harrow', vendorId: 'ironhold', qty: 96, orderedOn: -4, deliveryOn: 1, cost: 192 },
];

export const sandboxScenario: Scenario = {
  id: 'ui-sandbox',
  title: 'The Harrowmere Campaign (UI sandbox)',
  briefing:
    'Keep the Eastern Camp and the siege lines at Harrowmere supplied. A letter from the Lord Marshal has just arrived.',
  teaches: ['MOP', 'D1 / D2', 'vendor minimums', 'battle plans', 'budget'],
  lengthDays: 28,
  periodLengthDays: 14,
  periodAllowance: 3000,
  initial: {
    seed: 1337,
    items,
    vendors,
    depots,
    sourcing,
    locations,
    overrides: [],
    battlePlans,
    openOrders,
    periods: [],
    morale: 72,
  },
};
