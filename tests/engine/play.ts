import { engine } from '../../src/engine';
import { rules } from '../../src/engine/rules.config';
import type { GameState, Scenario } from '../../src/engine/types';

/** Order-trigger lessons deliberately set triggers too high; the player is expected to lower them. */
export const isTriggerLesson = (scenario: Scenario) => scenario.teaches.includes('order trigger');

/** Forecast-override lessons hide or understate a surge; the player is expected to override it. */
export const isOverrideLesson = (scenario: Scenario) => scenario.teaches.includes('forecast override');

/**
 * The player action a lesson expects, applied before accept-all (mirrors tests/store/playthrough.test.ts):
 * - 'order trigger': lower every vendor's trigger to the rules default (in the scenario's vendor data, so
 *   the warm-up runs on it too, and via acceptAll's lowerTriggers);
 * - 'forecast override': override the surge correctly, simulated as statedUplift = actualUplift.
 */
export function asPlayerWouldFix(scenario: Scenario): { scenario: Scenario; lowerTriggers: boolean; note: string } {
  const lowerTriggers = isTriggerLesson(scenario);
  const override = isOverrideLesson(scenario);
  let fixed: Scenario = scenario;
  if (override) {
    fixed = {
      ...fixed,
      initial: { ...fixed.initial, battlePlans: fixed.initial.battlePlans.map((b) => ({ ...b, statedUplift: b.actualUplift })) },
    };
  }
  if (lowerTriggers) {
    // Lower the vendors' own triggers too, so the warm-up (the previous quartermaster) also runs on
    // sane triggers; otherwise the player inherits an army starved by the lesson's high trigger.
    const trigger = rules.vendorMinimum.defaultTrigger;
    fixed = {
      ...fixed,
      initial: {
        ...fixed.initial,
        vendors: Object.fromEntries(Object.entries(fixed.initial.vendors).map(([id, v]) => [id, { ...v, orderTrigger: trigger }])),
      },
    };
  }
  const note = lowerTriggers ? ' (triggers lowered)' : override ? ' (surge overridden)' : '';
  return { scenario: fixed, lowerTriggers, note };
}

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

/** Service level from takeover (the player's days); warm-up days belong to the previous quartermaster. */
export const serviceLevel = (s: GameState) => {
  const rows = s.kpis.filter((k) => k.day >= (s.startDay ?? 0));
  const demand = rows.reduce((a, k) => a + k.demand, 0);
  return demand === 0 ? 1 : rows.reduce((a, k) => a + k.fulfilled, 0) / demand;
};
