import { engine } from '../../src/engine';
import type { GameState, Scenario } from '../../src/engine/types';

/** Play a scenario accepting every proposal with qty > 0. */
export function acceptAll(scenario: Scenario): GameState {
  let s = engine.initGame(scenario);
  for (let d = 0; d < scenario.lengthDays; d++) {
    s = engine.placeOrders(
      s,
      s.proposals.map((p, index) => ({ index, decision: p.qty > 0 ? ('accepted' as const) : ('rejected' as const) })),
    );
    s = engine.tick(s);
  }
  return s;
}

export const serviceLevel = (s: GameState) => {
  const demand = s.kpis.reduce((a, k) => a + k.demand, 0);
  return demand === 0 ? 1 : s.kpis.reduce((a, k) => a + k.fulfilled, 0) / demand;
};
