// Public engine API (see EngineApi in types.ts). The store imports from here only.
import { forecast } from './forecast';
import { project } from './projection';
import { initGame, placeOrders, refresh, tick } from './tick';
import type { EngineApi } from './types';

export const engine = {
  initGame: (scenario) => initGame(scenario),
  refresh: (state) => refresh(state),
  forecast: (state, itemId, depotId, from, to) => forecast(state, itemId, depotId, from, to),
  project: (state, itemId, depotId, from, to) => project(state, itemId, depotId, from, to),
  placeOrders: (state, decisions) => placeOrders(state, decisions),
  tick: (state) => tick(state),
} satisfies EngineApi;

export { initGame, refresh, forecast, project, placeOrders, tick };
export * from './calendar';
export { rules } from './rules.config';
