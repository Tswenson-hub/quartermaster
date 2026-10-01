// Distribution centres: depotIds sourcing, transfers, short-ship, dependent demand, costs.
import { describe, expect, it } from 'vitest';
import { dependentDemand, plannedOrders } from '../../src/engine/dc';
import { forecast } from '../../src/engine/forecast';
import { kpiSummary } from '../../src/engine/kpi';
import { itemLocationStats, vendorStats } from '../../src/engine/masterData';
import { planningParams } from '../../src/engine/replenishment';
import { placeOrders, refresh, tick } from '../../src/engine/tick';
import type { GameState } from '../../src/engine/types';
import { flat, item, loc, quietRules as q, source, state, vendor } from './fixtures';

// Front depot "camp" buys grain from the DC lane "lane" (Mon/Thu, lead time 1, no cost to the
// budget); the DC "dc" buys from the outside vendor "v" (Mon/Thu, lead time 3).
// camp: 70 on hand, 10/day, MOP 40. dc: 100 on hand, no own demand, MOP 0.
const network = (extra: Partial<GameState> = {}) =>
  state({
    items: { grain: item('grain', { holdingCost: 1 }) },
    depots: { camp: { id: 'camp', name: 'Eastern Camp' }, dc: { id: 'dc', name: 'Royal Granary', kind: 'dc' } },
    vendors: { v: vendor('v'), lane: vendor('lane', { name: 'Granary carts', leadTimeDays: 1, dcDepotId: 'dc' }) },
    sourcing: [source('grain', 'lane', { depotIds: ['camp'] }), source('grain', 'v', { depotIds: ['dc'] })],
    locations: [loc('grain', { onHand: 70 }), loc('grain', { depotId: 'dc', onHand: 100, history: flat(0), minimumFill: 0 })],
    ...extra,
  });

describe('sourcing by depot', () => {
  it('depotIds scope rules: camp buys from the lane, the DC from the vendor', () => {
    expect(planningParams(network(), 'grain', 'camp')?.vendorId).toBe('lane');
    expect(planningParams(network(), 'grain', 'dc')?.vendorId).toBe('v');
  });
});

describe('dependent demand (DC forecast)', () => {
  // Simulated camp orders (each accepted, arriving D1 = order day + 1):
  //   day 0 (Mon): D2 = Thu 3 + 1 = 4; proj end of day 3 = 70 − 40 = 30 → 10
  //   day 3 (Thu): D2 = 8; through day 3: 70 + 10 − 40 = 40; days 4–7 −40 → 0 → 40
  //   day 7 (Mon): D2 = 11; through day 7: 40; days 8–10 −30 → 10 → 30
  //   then Thu 40 / Mon 30 alternate through day 27 (the 28-day horizon).
  const expected = [10, 0, 0, 40, 0, 0, 0, 30, 0, 0, 40, 0, 0, 0, 30, 0, 0, 40, 0, 0, 0, 30, 0, 0, 40, 0, 0, 0];

  it("the camp's planned orders by ship day", () => {
    expect(plannedOrders(network(), network().locations[0])).toEqual({ vendorId: 'lane', byDay: expected });
  });

  it('DC forecast = the depots’ planned transfer orders (lumpy, by ship day)', () => {
    const s = network();
    expect(dependentDemand(s, s.locations[1])).toEqual(expected);
    expect(forecast(s, 'grain', 'dc', 0, 27).map((p) => p.total)).toEqual(expected);
    expect(forecast(s, 'grain', 'dc', 28, 29).map((p) => p.total)).toEqual([0, 0]); // beyond the horizon
  });

  it('sums every depot on the lane', () => {
    const s = network({
      depots: { camp: { id: 'camp', name: 'Camp' }, north: { id: 'north', name: 'North' }, dc: { id: 'dc', name: 'DC', kind: 'dc' } },
      sourcing: [source('grain', 'lane', { depotIds: ['camp', 'north'] }), source('grain', 'v', { depotIds: ['dc'] })],
      locations: [loc('grain', { onHand: 70 }), loc('grain', { depotId: 'north', onHand: 70 }), loc('grain', { depotId: 'dc', onHand: 100, history: flat(0), minimumFill: 0 })],
    });
    expect(dependentDemand(s, s.locations[2])).toEqual(expected.map((x) => 2 * x));
  });
});

describe('transfers', () => {
  const s0 = refresh(network(), q);
  const accept = (s: GameState) => placeOrders(s, s.proposals.map((_, index) => ({ index, decision: 'accepted' as const })), q);

  it('only the camp proposes today (DC proj 100 − 50 = 50 ≥ COP 25)', () => {
    expect(s0.proposals.map((p) => [p.depotId, p.vendorId, p.qty, p.cost])).toEqual([['camp', 'lane', 10, 0]]);
  });

  it('a transfer depletes the DC at placement and costs nothing against the budget', () => {
    const s = accept(s0);
    expect(s.openOrders).toEqual([expect.objectContaining({ vendorId: 'lane', qty: 10, cost: 0, deliveryOn: 1, promisedOn: 1 })]);
    expect(s.locations.map((l) => l.onHand)).toEqual([70, 90]);
    expect(s.periods[0].committed).toBe(0);
    expect(tick(s, q).kpis[0].spend).toBe(0);
  });

  it('short-ship: ship what the DC has, raise dc-short (kept through the tick)', () => {
    const short = refresh(network({ locations: [loc('grain', { onHand: 70 }), loc('grain', { depotId: 'dc', onHand: 4, history: flat(0), minimumFill: 0 })] }), q);
    const s = accept(short);
    // (The DC, now short itself, also orders 40 from the outside vendor; only the transfer matters here.)
    expect(s.openOrders.filter((o) => o.vendorId === 'lane')).toEqual([expect.objectContaining({ qty: 4, cost: 0 })]);
    expect(s.locations[1].onHand).toBe(0);
    const e = s.exceptions.find((x) => x.kind === 'dc-short')!;
    expect(e).toMatchObject({ day: 0, itemId: 'grain', depotId: 'camp', vendorId: 'lane' });
    expect(e.message).toBe('Royal Granary could ship only 4 of 10 sack to Eastern Camp; 6 short.');
    expect(tick(s, q).exceptions.some((x) => x.kind === 'dc-short' && x.day === 0)).toBe(true);
  });

  it('empty DC: no order at all, only dc-short', () => {
    const empty = refresh(network({ locations: [loc('grain', { onHand: 70 }), loc('grain', { depotId: 'dc', onHand: 0, history: flat(0), minimumFill: 0 })] }), q);
    const s = accept(empty);
    expect(s.openOrders.filter((o) => o.vendorId === 'lane')).toEqual([]);
    expect(s.exceptions.filter((x) => x.kind === 'dc-short')).toHaveLength(1);
  });

  it('perishable DC stock ships oldest lots first', () => {
    const s = accept(
      refresh(
        network({
          items: { grain: item('grain', { shelfLifeDays: 30 }) },
          locations: [loc('grain', { onHand: 70 }), loc('grain', { depotId: 'dc', onHand: 100, history: flat(0), minimumFill: 0, lots: [{ qty: 6, receivedOn: -5 }, { qty: 94, receivedOn: -1 }] })],
        }),
        q,
      ),
    );
    expect(s.locations[1].lots).toEqual([{ qty: 90, receivedOn: -1 }]);
  });
});

describe('DC in tick, KPIs and master data', () => {
  const day1 = () => tick(placeOrders(refresh(network(), q), [{ index: 0, decision: 'accepted' }], q), q);

  it('the DC has no consumption; its history records what it shipped', () => {
    const s = day1();
    expect(s.locations[1]).toMatchObject({ onHand: 90 });
    expect(s.locations[1].history.at(-1)).toBe(10);
    expect(s.locations[1].fulfilled).toEqual([10]);
    // Army KPIs cover the camp only: demand 10, forecast 10.
    expect(s.kpis[0]).toMatchObject({ demand: 10, fulfilled: 10, forecast: 10, absError: 0 });
  });

  it('DC holding cost = item cost × 0.5', () => {
    // camp ends day 0 at 60 (× 1), DC at 90 (× 0.5) → 60 + 45
    expect(day1().kpis[0].holdingCost).toBe(105);
  });

  it('network days of supply: all stock ÷ front forecast only', () => {
    expect(kpiSummary(network()).daysOfSupply).toBe(17); // (70 + 100) / 10
  });

  it('master data: DC lanes carry dcDepotId; DC item rows are included', () => {
    const vs = vendorStats(network());
    expect(vs.find((v) => v.vendorId === 'lane')).toMatchObject({ dcDepotId: 'dc', itemsSupplied: 1 });
    expect(vs.find((v) => v.vendorId === 'v')?.dcDepotId).toBeUndefined();
    const rows = itemLocationStats(network());
    expect(rows.map((r) => [r.depotId, r.vendorId])).toEqual([
      ['camp', 'lane'],
      ['dc', 'v'],
    ]);
    expect(rows[1].avgForecastNext).toBeCloseTo((10 + 40) / 7, 12);
  });
});
