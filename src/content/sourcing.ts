import type { SourcingRule } from '../engine/types';

/**
 * Who supplies what, at what price (silver per unit) and in what pack multiple.
 *
 * Multi-sourced items:
 * - grain:  priority — abbey (1) first, river barges (2) as fallback.
 * - arrows: priority — guild fletchers (1), royal armory (2) at a premium in bigger lots.
 * - ale:    priority — abbey (1), river (2).
 * - oats:   split    — 60% abbey / 40% river, so a flooded river never starves the horses.
 * - bolts:  split    — 50% smithy / 50% royal armory.
 */
export const SOURCING: SourcingRule[] = [
  // Rations
  { itemId: 'grain', vendorId: 'abbey-granary', unitCost: 4, packSize: 10, priority: 1 },
  { itemId: 'grain', vendorId: 'river-merchants', unitCost: 5, packSize: 25, priority: 2 },
  { itemId: 'hardtack', vendorId: 'abbey-granary', unitCost: 9, packSize: 5, priority: 1 },
  { itemId: 'salt-pork', vendorId: 'river-merchants', unitCost: 30, packSize: 4, priority: 1 },
  { itemId: 'ale', vendorId: 'abbey-granary', unitCost: 12, packSize: 12, priority: 1 },
  { itemId: 'ale', vendorId: 'river-merchants', unitCost: 14, packSize: 6, priority: 2 },

  // Fodder (split-sourced)
  { itemId: 'oats', vendorId: 'abbey-granary', unitCost: 3, packSize: 20, priority: 1, splitShare: 0.6 },
  { itemId: 'oats', vendorId: 'river-merchants', unitCost: 3.5, packSize: 10, priority: 1, splitShare: 0.4 },

  // Munitions
  { itemId: 'arrows', vendorId: 'guild-fletchers', unitCost: 6, packSize: 12, priority: 1 },
  { itemId: 'arrows', vendorId: 'royal-armory', unitCost: 8, packSize: 50, priority: 2 },
  { itemId: 'bowstrings', vendorId: 'guild-fletchers', unitCost: 4, packSize: 10, priority: 1 },
  { itemId: 'bolts', vendorId: 'mountain-smithy', unitCost: 10, packSize: 10, priority: 1, splitShare: 0.5 },
  { itemId: 'bolts', vendorId: 'royal-armory', unitCost: 12, packSize: 20, priority: 1, splitShare: 0.5 },

  // Tools & armor
  { itemId: 'horseshoes', vendorId: 'mountain-smithy', unitCost: 5, packSize: 6, priority: 1 },
  { itemId: 'mail-rings', vendorId: 'mountain-smithy', unitCost: 40, packSize: 1, priority: 1 },

  // Siege
  { itemId: 'pitch', vendorId: 'river-merchants', unitCost: 7, packSize: 4, priority: 1 },
  { itemId: 'siege-rope', vendorId: 'royal-armory', unitCost: 15, packSize: 2, priority: 1 },

  // Medical
  { itemId: 'bandages', vendorId: 'apothecary', unitCost: 1, packSize: 20, priority: 1 },
  { itemId: 'poultices', vendorId: 'apothecary', unitCost: 3, packSize: 6, priority: 1 },
];
