import { rules, type Rules } from '../../src/engine/rules.config';
import type { GameState, Item, ItemLocation, SourcingRule, Vendor } from '../../src/engine/types';

/** Rules with noise off so demand equals the history rate exactly. */
export const quietRules: Rules = { ...rules, demand: { ...rules.demand, noiseCv: 0 } };

export const flat = (qty: number, days = 14): number[] => new Array<number>(days).fill(qty);

export function item(id: string, extra: Partial<Item> = {}): Item {
  return { id, name: id, category: 'rations', icon: id, unit: 'sack', holdingCost: 0, criticality: 3, ...extra };
}

export function vendor(id: string, extra: Partial<Vendor> = {}): Vendor {
  // Default: orders Mon (0) and Thu (3), lead time 3.
  return { id, name: id, orderDays: [0, 3], leadTimeDays: 3, reliability: 1, ...extra };
}

export function loc(itemId: string, extra: Partial<ItemLocation> = {}): ItemLocation {
  return { itemId, depotId: 'camp', onHand: 100, serviceLevel: 0.95, minimumFill: 40, history: flat(10), ...extra };
}

export function source(itemId: string, vendorId = 'v', extra: Partial<SourcingRule> = {}): SourcingRule {
  return { itemId, vendorId, unitCost: 2, packSize: 1, priority: 1, ...extra };
}

/**
 * The golden setup: one item "grain" at "camp", flat history 10/day (σ = 0 → safety stock 0,
 * so MOP = presentation stock 40), vendor "v" orders Mon/Thu with lead time 3, today = day 0 (Mon).
 */
export function state(extra: Partial<GameState> = {}): GameState {
  return {
    seed: 42,
    today: 0,
    lengthDays: 56,
    items: { grain: item('grain') },
    vendors: { v: vendor('v') },
    depots: { camp: { id: 'camp', name: 'Eastern Camp' } },
    sourcing: [source('grain')],
    locations: [loc('grain')],
    overrides: [],
    battlePlans: [],
    openOrders: [],
    proposals: [],
    periods: [{ index: 0, start: 0, end: 27, allowance: 1000, committed: 0 }],
    exceptions: [],
    kpis: [],
    morale: 80,
    difficulty: 'normal',
    market: { ticker: 'FLAT', source: 'snapshot', synthetic: true, firstDate: '', lastDate: '', values: Array<number>(56).fill(1) },
    vendorTriggers: {},
    vendorOrderDays: {},
    deliveries: [],
    vendorPlans: [],
    rank: { level: 2, merit: 0, reprimands: 0, overspentStreak: 0 },
    letters: [],
    battles: [],
    status: 'playing',
    ...extra,
  };
}
