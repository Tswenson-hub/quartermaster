import { describe, expect, it, vi } from 'vitest';
import { scenarios } from '../../src/content';
import { rules } from '../../src/engine/rules.config';

vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
const { useGameStore, selectServiceLevel } = await import('../../src/store');

describe('playthrough: accept every proposal', () => {
  for (const scenario of scenarios) {
    it(`${scenario.id} runs to the end`, () => {
      const s = useGameStore.getState();
      s.loadScenario(scenario);
      for (let d = 0; d < scenario.lengthDays; d++) {
        useGameStore.getState().game!.proposals.forEach((_, i) => s.decideProposal(i, 'accepted'));
        s.endDay();
      }
      const game = useGameStore.getState().game!;
      expect(game.today).toBe(game.startDay + scenario.lengthDays);
      if (scenario.id === 'tutorial-1') expect(selectServiceLevel(game)).toBe(1);
    });
  }

  // Accepting every system proposal should never starve the front. Exceptions are lessons whose point is
  // a player action, simulated here before accept-all:
  // - 'order trigger': deliberately high triggers, so the player lowers every vendor's to the rules default;
  // - 'forecast override': an understated or unannounced surge, so the player overrides it correctly
  //   (simulated by revealing the true uplift: statedUplift = actualUplift).
  for (const base of scenarios) {
    const triggerLesson = base.teaches.includes('order trigger');
    const overrideLesson = base.teaches.includes('forecast override');
    const scenario: typeof base = overrideLesson
      ? { ...base, initial: { ...base.initial, battlePlans: base.initial.battlePlans.map((b) => ({ ...b, statedUplift: b.actualUplift })) } }
      : base;
    const note = triggerLesson ? ' (triggers lowered)' : overrideLesson ? ' (surge overridden)' : '';
    it(`${scenario.id} keeps service level ≥ 95% when all proposals are accepted${note}`, () => {
      const s = useGameStore.getState();
      s.loadScenario(scenario);
      if (triggerLesson) {
        for (const id of Object.keys(scenario.initial.vendors)) s.setVendorTrigger(id, rules.vendorMinimum.defaultTrigger);
      }
      for (let d = 0; d < scenario.lengthDays; d++) {
        useGameStore.getState().game!.proposals.forEach((_, i) => s.decideProposal(i, 'accepted'));
        s.endDay();
      }
      expect(selectServiceLevel(useGameStore.getState().game!)).toBeGreaterThanOrEqual(0.95);
    });
  }
});
