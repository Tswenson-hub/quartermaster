// Read-only views over GameState for the UI. UI calls these instead of importing the engine.
import type { Day, DepotId, ForecastPoint, GameState, ItemId, PlanningException, PlanningParams } from '../engine/types';
import { engine } from './engine';

export function selectForecast(game: GameState, itemId: ItemId, depotId: DepotId, from: Day, to: Day): ForecastPoint[] {
  return engine.forecast(game, itemId, depotId, from, to);
}

/** MOP/COP/D1/D2 at the next order opportunity, for drawing reference lines on days with no proposal. */
export function selectPlanningParams(game: GameState, itemId: ItemId, depotId: DepotId): PlanningParams | undefined {
  return engine.planningParams(game, itemId, depotId);
}

/** Projected end-of-day stock, index 0 = `from`. `from` must be ≥ game.today. */
export function selectProjection(game: GameState, itemId: ItemId, depotId: DepotId, from: Day, to: Day): number[] {
  return engine.project(game, itemId, depotId, from, to);
}

export function selectCurrentPeriod(game: GameState) {
  return game.periods.find((p) => game.today >= p.start && game.today <= p.end);
}

export function selectExceptionsToday(game: GameState): PlanningException[] {
  return game.exceptions.filter((e) => e.day === game.today);
}

/** Service level so far = fulfilled / demand over all ticked days, 0–1. 1 when there has been no demand. */
export function selectServiceLevel(game: GameState): number {
  const demand = game.kpis.reduce((a, k) => a + k.demand, 0);
  const fulfilled = game.kpis.reduce((a, k) => a + k.fulfilled, 0);
  return demand === 0 ? 1 : fulfilled / demand;
}
