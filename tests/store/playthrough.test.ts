import { describe, expect, it, vi } from 'vitest';
import { scenarios } from '../../src/content';

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
      expect(game.today).toBe(scenario.lengthDays);
      if (scenario.id === 'tutorial-1') expect(selectServiceLevel(game)).toBe(1);
    });
  }

  // Accepting every system proposal should never starve the front.
  for (const scenario of scenarios) {
    it(`${scenario.id} keeps service level ≥ 95% when all proposals are accepted`, () => {
      const s = useGameStore.getState();
      s.loadScenario(scenario);
      for (let d = 0; d < scenario.lengthDays; d++) {
        useGameStore.getState().game!.proposals.forEach((_, i) => s.decideProposal(i, 'accepted'));
        s.endDay();
      }
      expect(selectServiceLevel(useGameStore.getState().game!)).toBeGreaterThanOrEqual(0.95);
    });
  }
});
