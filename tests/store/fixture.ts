import type { Scenario } from '../../src/engine/types';

/** Tiny level for store tests: 1 item, 1 vendor (Mon/Thu, LT 2), 1 depot, steady demand of 10/day. */
export const fixtureScenario: Scenario = {
  id: 'fixture-1',
  title: 'Fixture',
  briefing: 'Test level',
  teaches: ['MOP', 'D2'],
  lengthDays: 14,
  periodLengthDays: 7,
  periodAllowance: 1000,
  initial: {
    seed: 42,
    items: {
      grain: { id: 'grain', name: 'Grain', category: 'rations', icon: 'grain', unit: 'sack', holdingCost: 0.1, criticality: 3 },
    },
    vendors: {
      mill: { id: 'mill', name: 'Mill', orderDays: [0, 3], leadTimeDays: 2, reliability: 1 },
    },
    depots: { camp: { id: 'camp', name: 'Camp' } },
    sourcing: [{ itemId: 'grain', vendorId: 'mill', unitCost: 2, packSize: 10, priority: 1 }],
    locations: [
      { itemId: 'grain', depotId: 'camp', onHand: 30, serviceLevel: 0.95, presentationStock: 5, history: Array(28).fill(10) },
    ],
    overrides: [],
    battlePlans: [],
    periods: [],
    morale: 80,
  },
};
