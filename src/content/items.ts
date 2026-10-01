import type { Item, ItemId } from '../engine/types';

/**
 * The quartermaster's catalogue: 14 supplies an army in the field cannot do without.
 *
 * - `shelfLifeDays` is days until a unit is unfit for issue. Undefined = keeps for the campaign.
 * - `holdingCost` is silver per unit per day: storage, guards, tarpaulins, rats, carting within camp.
 *   Bulky, fragile or hazardous goods cost more to keep than their price alone suggests.
 * - `criticality` 1–5: how badly a stockout hurts the front (5 = men starve or the line breaks).
 * - `icon` is a key into public/assets/manifest.json; see docs/CONTENT.md for the art to pick.
 */
const list: Item[] = [
  // --- Rations ---
  {
    id: 'grain',
    name: 'Grain',
    category: 'rations',
    icon: 'item.grain',
    unit: 'sack',
    // Threshed wheat/rye in sacks keeps a season if kept dry; damp tents and weevils shorten it.
    shelfLifeDays: 180,
    holdingCost: 0.04,
    criticality: 5,
  },
  {
    id: 'hardtack',
    name: 'Hardtack',
    category: 'rations',
    icon: 'item.hardtack',
    unit: 'crate',
    // Twice-baked ship's biscuit: famously long-lived.
    shelfLifeDays: 365,
    holdingCost: 0.05,
    criticality: 4,
  },
  {
    id: 'salt-pork',
    name: 'Salt Pork',
    category: 'rations',
    icon: 'item.salt-pork',
    unit: 'barrel',
    shelfLifeDays: 120,
    holdingCost: 0.15,
    criticality: 4,
  },
  {
    id: 'ale',
    name: 'Ale',
    category: 'rations',
    icon: 'item.ale',
    unit: 'cask',
    // Unhopped ale sours within days — the classic perishable.
    shelfLifeDays: 10,
    holdingCost: 0.12,
    criticality: 3,
  },
  // --- Fodder ---
  {
    id: 'oats',
    name: 'Oats & Fodder',
    category: 'fodder',
    icon: 'item.oats',
    unit: 'sack',
    shelfLifeDays: 90,
    holdingCost: 0.04,
    criticality: 4,
  },
  // --- Munitions ---
  {
    id: 'arrows',
    name: 'War Arrows',
    category: 'munitions',
    icon: 'item.arrows',
    unit: 'sheaf', // 24 arrows
    holdingCost: 0.02,
    criticality: 5,
  },
  {
    id: 'bowstrings',
    name: 'Bowstrings',
    category: 'munitions',
    icon: 'item.bowstrings',
    unit: 'bundle', // a dozen waxed hemp strings
    // Hemp strings rot and fray in field damp even when waxed.
    shelfLifeDays: 120,
    holdingCost: 0.01,
    criticality: 4,
  },
  {
    id: 'bolts',
    name: 'Crossbow Bolts',
    category: 'munitions',
    icon: 'item.bolts',
    unit: 'case', // 50 quarrels
    holdingCost: 0.03,
    criticality: 4,
  },
  // --- Tools ---
  {
    id: 'horseshoes',
    name: 'Horseshoes & Nails',
    category: 'tools',
    icon: 'item.horseshoes',
    unit: 'set', // four shoes plus nails
    holdingCost: 0.02,
    criticality: 3,
  },
  // --- Siege ---
  {
    id: 'pitch',
    name: 'Pitch',
    category: 'siege',
    icon: 'item.pitch',
    unit: 'pot',
    // Not perishable, but a fire hazard: it needs its own guarded, sanded store.
    holdingCost: 0.08,
    criticality: 3,
  },
  {
    id: 'siege-rope',
    name: 'Siege Rope',
    category: 'siege',
    icon: 'item.siege-rope',
    unit: 'coil',
    holdingCost: 0.05,
    criticality: 2,
  },
  // --- Medical ---
  {
    id: 'bandages',
    name: 'Linen Bandages',
    category: 'medical',
    icon: 'item.bandages',
    unit: 'roll',
    holdingCost: 0.005,
    criticality: 4,
  },
  {
    id: 'poultices',
    name: 'Herbal Poultices',
    category: 'medical',
    icon: 'item.poultices',
    unit: 'jar',
    // Fresh-made herb pastes (yarrow, comfrey) lose their virtue within a week.
    shelfLifeDays: 7,
    holdingCost: 0.03,
    criticality: 3,
  },
  // --- Armor ---
  {
    id: 'mail-rings',
    name: 'Mail Rings',
    category: 'armor',
    icon: 'item.mail-rings',
    unit: 'keg', // riveted rings for field repair of hauberks
    holdingCost: 0.1,
    criticality: 2,
  },
];

export const ITEMS: Record<ItemId, Item> = Object.fromEntries(list.map((i) => [i.id, i]));
export const ITEM_IDS: ItemId[] = list.map((i) => i.id);
