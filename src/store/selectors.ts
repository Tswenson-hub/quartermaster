// Read-only views over GameState for the UI. UI calls these instead of importing the engine.
import type { Day, DepotId, ForecastPoint, GameState, ItemId, PlanningException } from '../engine/types';
import { engine } from './engine';

export function selectForecast(game: GameState, itemId: ItemId, depotId: DepotId, from: Day, to: Day): ForecastPoint[] {
  return engine.forecast(game, itemId, depotId, from, to);
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
