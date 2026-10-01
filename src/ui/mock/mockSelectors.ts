// MOCK stand-ins for src/store/selectors.ts (same signatures). Crude fake-engine maths so the
// screens have plausible data; the real numbers come from src/engine via the lead's selectors.

import type { Day, DepotId, ForecastPoint, GameState, ItemId } from '../../engine/types';
import { mockPlanningParams } from './mockState';

const WEEK_SHAPE = [1.1, 1.0, 0.95, 1.0, 1.15, 0.9, 0.8];

function findLocation(game: GameState, itemId: ItemId, depotId: DepotId) {
  return game.locations.find((l) => l.itemId === itemId && l.depotId === depotId);
}

export function selectForecast(game: GameState, itemId: ItemId, depotId: DepotId, from: Day, to: Day): ForecastPoint[] {
  const loc = findLocation(game, itemId, depotId);
  if (!loc) return [];
  const recent = loc.history.slice(-14);
  const level = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : 0;
  const out: ForecastPoint[] = [];
  for (let day = from; day <= to; day++) {
    const baseline = level * WEEK_SHAPE[day % 7];
    let factor = 1;
    for (const bp of game.battlePlans) {
      if (bp.announcedOn <= game.today && day >= bp.start && day <= bp.end && bp.depotIds.includes(depotId)) {
        factor *= bp.statedUplift[itemId] ?? 1;
      }
    }
    const eventUplift = baseline * (factor - 1);
    const ov = game.overrides.find((o) => o.itemId === itemId && o.depotId === depotId && day >= o.from && day <= o.to);
    const override = ov ? (ov.mode === 'absolute' ? ov.value : (baseline + eventUplift) * ov.value) : undefined;
    const total = Math.round(override ?? baseline + eventUplift);
    out.push({ day, baseline: Math.round(baseline), eventUplift: Math.round(eventUplift), override, total });
  }
  return out;
}

export function selectProjection(game: GameState, itemId: ItemId, depotId: DepotId, from: Day, to: Day): number[] {
  const loc = findLocation(game, itemId, depotId);
  if (!loc) return [];
  const fc = selectForecast(game, itemId, depotId, game.today, to);
  let stock = loc.onHand;
  const out: number[] = [];
  for (let day = game.today; day <= to; day++) {
    for (const o of game.openOrders) {
      if (o.itemId === itemId && o.depotId === depotId && o.deliveryOn === day) stock += o.qty;
    }
    stock -= fc[day - game.today]?.total ?? 0;
    if (day >= from) out.push(stock);
  }
  return out;
}

/**
 * MOP / COP / safety stock for one item-location. Not in the lead's announced selector set yet —
 * requested so Item Planning can draw MOP/COP lines even when no proposal exists today.
 */
export function selectPlanningParams(_game: GameState, itemId: ItemId, depotId: DepotId) {
  return mockPlanningParams[`${itemId}@${depotId}`];
}

/** Make the mock proposals' projectedAtD2 agree with the mock projection line. */
export function alignMockProposals(game: GameState): GameState {
  return {
    ...game,
    proposals: game.proposals.map((p) => ({
      ...p,
      projectedAtD2: selectProjection(game, p.itemId, p.depotId, p.d2, p.d2)[0] ?? p.projectedAtD2,
    })),
  };
}
