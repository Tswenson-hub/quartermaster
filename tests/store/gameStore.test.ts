import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fixtureScenario } from './fixture';

const memory = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => void memory.set(k, v),
  removeItem: (k: string) => void memory.delete(k),
});

const { useGameStore, SAVE_KEY, isScenarioOver } = await import('../../src/store');

beforeEach(() => {
  memory.clear();
  useGameStore.getState().newGame();
});

describe('gameStore', () => {
  it('loads a scenario into day 0 with proposals', () => {
    useGameStore.getState().loadScenario(fixtureScenario);
    const { game } = useGameStore.getState();
    expect(game?.today).toBe(0);
    // 30 on hand, 10/day, D2 = Thu + 2 = day 5 → projected well below MOP.
    expect(game?.proposals.length).toBeGreaterThan(0);
    expect(game?.proposals[0].reason).toBe('must');
  });

  it('accepting a proposal and ending the day creates an open order and commits spend', () => {
    const s = useGameStore.getState();
    s.loadScenario(fixtureScenario);
    const proposal = useGameStore.getState().game!.proposals[0];
    s.decideProposal(0, 'accepted');
    s.endDay();
    const { game, decisions } = useGameStore.getState();
    expect(game!.today).toBe(1);
    expect(decisions).toEqual({});
    expect(game!.openOrders).toHaveLength(1);
    expect(game!.openOrders[0].qty).toBe(proposal.qty);
    expect(game!.periods[0].committed).toBe(proposal.cost);
  });

  it('rejected proposals place no orders', () => {
    const s = useGameStore.getState();
    s.loadScenario(fixtureScenario);
    s.decideProposal(0, 'rejected');
    s.endDay();
    expect(useGameStore.getState().game!.openOrders).toHaveLength(0);
  });

  it('setOverride replaces same-range overrides and clears decisions', () => {
    const s = useGameStore.getState();
    s.loadScenario(fixtureScenario);
    s.decideProposal(0, 'accepted');
    const o = { itemId: 'grain', depotId: 'camp', from: 0, to: 6, mode: 'absolute' as const, value: 20 };
    s.setOverride(o);
    s.setOverride({ ...o, value: 25 });
    const { game, decisions } = useGameStore.getState();
    expect(game!.overrides).toEqual([{ ...o, value: 25 }]);
    expect(decisions).toEqual({});
  });

  it('is deterministic for the same seed and decisions', () => {
    const run = () => {
      const s = useGameStore.getState();
      s.loadScenario(fixtureScenario);
      for (let d = 0; d < 7; d++) {
        useGameStore.getState().game!.proposals.forEach((_, i) => s.decideProposal(i, 'accepted'));
        s.endDay();
      }
      return useGameStore.getState().game;
    };
    expect(run()).toEqual(run());
  });

  it('stops advancing after the last day', () => {
    const s = useGameStore.getState();
    s.loadScenario(fixtureScenario);
    for (let d = 0; d < 20; d++) s.endDay();
    const { scenario, game } = useGameStore.getState();
    expect(game!.today).toBe(fixtureScenario.lengthDays);
    expect(isScenarioOver(scenario, game)).toBe(true);
  });

  it('persists to localStorage and newGame clears the save', async () => {
    useGameStore.getState().loadScenario(fixtureScenario);
    useGameStore.getState().endDay();
    const raw = memory.get(SAVE_KEY)!;
    expect(JSON.parse(raw).state.game.today).toBe(1);

    // Simulate a fresh page load: wipe in-memory state (which also writes), then restore the save.
    useGameStore.setState({ scenario: null, game: null });
    memory.set(SAVE_KEY, raw);
    await useGameStore.persist.rehydrate();
    expect(useGameStore.getState().game?.today).toBe(1);

    useGameStore.getState().newGame();
    expect(memory.has(SAVE_KEY)).toBe(false);
  });
});

describe('selectors', () => {
  it('selectPlanningParams gives MOP and D2 on a non-order day', async () => {
    const { selectPlanningParams } = await import('../../src/store');
    const s = useGameStore.getState();
    s.loadScenario(fixtureScenario);
    s.endDay(); // day 1 = Tuesday, mill orders Mon/Thu
    const game = useGameStore.getState().game!;
    expect(game.proposals).toHaveLength(0);
    const pp = selectPlanningParams(game, 'grain', 'camp')!;
    expect(pp.orderDay).toBe(3);
    expect(pp.d1).toBe(5);
    expect(pp.d2).toBe(9); // next order Mon (7) + LT 2
    expect(pp.mustOrderPoint).toBeGreaterThanOrEqual(5);
  });
});
