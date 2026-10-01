// Public engine API (see EngineApi in types.ts). The store imports from here only.
import { forecast } from './forecast';
import { project } from './projection';
import { planningParams } from './replenishment';
import { initGame, placeOrders, refresh, tick } from './tick';
import type { EngineApi, GameSetup, Scenario } from './types';

export const engine = {
  initGame: (scenario: Scenario, setup?: GameSetup) => initGame(scenario, setup),
  refresh: (state) => refresh(state),
  forecast: (state, itemId, depotId, from, to) => forecast(state, itemId, depotId, from, to),
  planningParams: (state, itemId, depotId) => planningParams(state, itemId, depotId),
  project: (state, itemId, depotId, from, to) => project(state, itemId, depotId, from, to),
  placeOrders: (state, decisions) => placeOrders(state, decisions),
  tick: (state) => tick(state),
} satisfies EngineApi;

export { initGame, refresh, forecast, planningParams, project, placeOrders, tick };
export * from './calendar';
export { rules } from './rules.config';
