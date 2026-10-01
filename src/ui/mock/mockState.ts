// MOCK data for UI development only. Stands in for content + engine output until the real
// store (src/store/gameStore.ts) lands. Nothing in here is game logic the UI relies on.

import type {
  BattlePlan,
  DailyKpi,
  Depot,
  FiscalPeriod,
  GameState,
  Item,
  ItemLocation,
  OpenOrder,
  OrderProposal,
  PlanningException,
  Scenario,
  SourcingRule,
  Vendor,
} from '../../engine/types';

const TODAY = 21; // Monday of week 4

/** Tiny deterministic LCG so the mock history is stable across reloads. */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const WEEK_SHAPE = [1.1, 1.0, 0.95, 1.0, 1.15, 0.9, 0.8];

function mockHistory(base: number, seed: number, days = TODAY): number[] {
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
      'Quartermaster — on the Monday after next we storm the walls of Harrowmere. Expect the archers to loose thrice their wont, and the barber-surgeons to bind twice as many wounds. Fill the carts accordingly, and let no man say the bows fell silent for want of shafts. — Lord Marshal Aldric',
    announcedOn: 21,
    start: 28,
    end: 34,
    depotIds: ['harrow', 'eastern'],
    statedUplift: { arrows: 3, bandages: 2, grain: 1.2 },
    actualUplift: { arrows: 2.4, bandages: 2.6, grain: 1.1 },
  },
  {
    id: 'bp-feast',
    title: 'Feast of St. Wendel',
    letter:
      'The men shall feast on the Saint’s day. See that the pork barrels are full and the oats plentiful, for a fed army is a loyal army. — Captain Mirelle',
    announcedOn: 10,
    start: 14,
    end: 15,
    depotIds: ['eastern'],
    statedUplift: { saltpork: 2, grain: 1.3 },
    actualUplift: { saltpork: 2.2, grain: 1.25 },
  },
];

const openOrders: OpenOrder[] = [
  { id: 'oo-1', itemId: 'fodder', depotId: 'eastern', vendorId: 'millbrook', qty: 140, orderedOn: 17, deliveryOn: 22, cost: 140 },
  { id: 'oo-2', itemId: 'horseshoes', depotId: 'eastern', vendorId: 'ironhold', qty: 24, orderedOn: 14, deliveryOn: 23, cost: 96 },
  { id: 'oo-3', itemId: 'arrows', depotId: 'harrow', vendorId: 'ironhold', qty: 96, orderedOn: 16, deliveryOn: 22, cost: 192 },
];

const periods: FiscalPeriod[] = [
  { index: 0, start: 0, end: 27, allowance: 6000, committed: 4310 },
  { index: 1, start: 28, end: 55, allowance: 6000, committed: 0 },
];

/** Mock MOP/COP per item-location — the engine will compute these from rules.config.ts. */
export const mockPlanningParams: Record<string, { mustOrderPoint: number; canOrderPoint: number; safetyStock: number }> = {
  'grain@eastern': { mustOrderPoint: 70, canOrderPoint: 130, safetyStock: 50 },
  'saltpork@eastern': { mustOrderPoint: 14, canOrderPoint: 26, safetyStock: 14 },
  'fodder@eastern': { mustOrderPoint: 90, canOrderPoint: 180, safetyStock: 90 },
  'arrows@eastern': { mustOrderPoint: 60, canOrderPoint: 110, safetyStock: 60 },
  'horseshoes@eastern': { mustOrderPoint: 10, canOrderPoint: 18, safetyStock: 10 },
  'bandages@eastern': { mustOrderPoint: 20, canOrderPoint: 36, safetyStock: 20 },
  'grain@harrow': { mustOrderPoint: 45, canOrderPoint: 85, safetyStock: 35 },
  'arrows@harrow': { mustOrderPoint: 80, canOrderPoint: 150, safetyStock: 80 },
};

const proposal = (
  itemId: string,
  depotId: string,
  vendorId: string,
  qty: number,
  reason: OrderProposal['reason'],
  d1: number,
  d2: number,
  projectedAtD2: number,
): OrderProposal => {
  const p = mockPlanningParams[`${itemId}@${depotId}`];
  const unitCost = sourcing.find((s) => s.itemId === itemId && s.vendorId === vendorId)!.unitCost;
  return { itemId, depotId, vendorId, qty, reason, d1, d2, projectedAtD2, mustOrderPoint: p.mustOrderPoint, canOrderPoint: p.canOrderPoint, cost: qty * unitCost };
};

// Today is Monday (21). Millbrook: D1 = Wed 23, next order Thu → D2 = Sat 26.
// Ironhold: D1 = Sat 26, next order Mon 28 → D2 = Fri 33. Abbey: D1 = Tue 22, next Wed → D2 = Thu 24.
const proposals: OrderProposal[] = [
  proposal('grain', 'eastern', 'millbrook', 110, 'must', 23, 26, -60),
  proposal('saltpork', 'eastern', 'millbrook', 8, 'can', 23, 26, 18),
  proposal('fodder', 'eastern', 'millbrook', 40, 'vendor-min-fill', 23, 26, 115),
  proposal('arrows', 'harrow', 'ironhold', 72, 'must', 26, 33, 12),
  proposal('horseshoes', 'eastern', 'ironhold', 16, 'can', 26, 33, 16),
  proposal('bandages', 'eastern', 'abbey', 30, 'must', 22, 24, 9),
];

const exceptions: PlanningException[] = [
  { kind: 'stockout-risk', day: TODAY, itemId: 'grain', depotId: 'eastern', message: 'The meal sacks will run dry before Saturday’s wagon unless you order today.' },
  { kind: 'below-mop', day: TODAY, itemId: 'arrows', depotId: 'harrow', message: 'Arrows at Harrowmere fall below the Must Order Point before the next smithy delivery.' },
  { kind: 'vendor-min-shortfall', day: TODAY, vendorId: 'millbrook', message: 'Millbrook’s cart is not yet full enough to meet their minimum order value.' },
  { kind: 'forecast-deviation', day: TODAY - 1, itemId: 'fodder', depotId: 'eastern', message: 'The horses ate 22% more hay than foretold this week.' },
  { kind: 'delivery-late', day: TODAY - 1, itemId: 'horseshoes', vendorId: 'ironhold', message: 'Ironhold’s horseshoe wagon is mired in the Fenmarch mud — two days late.' },
  { kind: 'spoilage', day: TODAY - 2, itemId: 'fodder', depotId: 'eastern', message: '12 sheaves of hay rotted in the rain.' },
];

const kpis: DailyKpi[] = Array.from({ length: TODAY }, (_, day) => ({
  day,
  demand: 140 + (day % 7) * 6,
  fulfilled: 140 + (day % 7) * 6 - (day === 9 || day === 16 ? 18 : 0),
  spoiled: day === 19 ? 12 : 0,
  holdingCost: 9 + (day % 5),
  spend: day % 7 === 0 || day % 7 === 3 ? 520 + day * 7 : 30,
}));

export const mockGame: GameState = {
  seed: 1337,
  today: TODAY,
  items,
  vendors,
  depots,
  sourcing,
  locations,
  overrides: [],
  battlePlans,
  openOrders,
  proposals,
  periods,
  exceptions,
  kpis,
  morale: 72,
};

export const mockScenario: Pick<Scenario, 'id' | 'title' | 'briefing' | 'teaches' | 'lengthDays'> = {
  id: 'mock-harrowmere',
  title: 'The Harrowmere Campaign (mock)',
  briefing: 'Keep the Eastern Camp and the siege lines supplied through the assault.',
  teaches: ['MOP', 'D2', 'vendor minimums', 'battle plans'],
  lengthDays: 56,
};
