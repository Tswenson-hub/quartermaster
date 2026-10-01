import { engine } from '../../src/engine';
import { rules } from '../../src/engine/rules.config';
import type { GameState, Scenario } from '../../src/engine/types';

/** Order-trigger lessons deliberately set triggers too high; the player is expected to lower them. */
export const isTriggerLesson = (scenario: Scenario) => scenario.teaches.includes('order trigger');

/**
 * Play a scenario accepting every proposal with qty > 0. With `lowerTriggers`, the player first
 * sets every vendor's order trigger to rules.vendorMinimum.defaultTrigger (as in the store test).
 */
export function acceptAll(scenario: Scenario, lowerTriggers = false): GameState {
  let s = engine.initGame(scenario);
  if (lowerTriggers) {
    const vendorTriggers = Object.fromEntries(Object.keys(s.vendors).map((id) => [id, rules.vendorMinimum.defaultTrigger]));
    s = engine.refresh({ ...s, vendorTriggers });
  }
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
