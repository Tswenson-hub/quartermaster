import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type {
  DepotId,
  ForecastOverride,
  GameState,
  ItemId,
  ProposalDecision,
  ProposalDecisionInput,
  Scenario,
} from '../engine/types';
import { engine } from './engine';

export const SAVE_KEY = 'quartermaster-save';
export const SAVE_VERSION = 1;

export interface DecisionEntry {
  decision: ProposalDecision;
  qty?: number;
}

export interface GameStore {
  scenario: Scenario | null;
  game: GameState | null;
  /** Player decisions on today's proposals, keyed by index into game.proposals. Cleared each day. */
  decisions: Record<number, DecisionEntry>;

  loadScenario(scenario: Scenario): void;
  decideProposal(index: number, decision: ProposalDecision, qty?: number): void;
  /** Add an override, replacing any existing one for the same item, depot and day range. */
  setOverride(override: ForecastOverride): void;
  clearOverride(itemId: ItemId, depotId: DepotId): void;
  /** Place accepted orders, then advance one day. No-op once the scenario's last day has passed. */
  endDay(): void;
  /** Drop the current game and its save. */
  newGame(): void;
}

export function isScenarioOver(scenario: Scenario | null, game: GameState | null): boolean {
  return !!scenario && !!game && game.today >= scenario.lengthDays;
}

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
      scenario: null,
      game: null,
      decisions: {},

      loadScenario: (scenario) => set({ scenario, game: engine.initGame(scenario), decisions: {} }),

      decideProposal: (index, decision, qty) => {
        const { game, decisions } = get();
        if (!game || !game.proposals[index]) return;
        set({ decisions: { ...decisions, [index]: qty === undefined ? { decision } : { decision, qty } } });
      },

      setOverride: (override) => {
        const { game } = get();
        if (!game) return;
        const overrides = game.overrides.filter(
          (o) =>
            !(o.itemId === override.itemId && o.depotId === override.depotId && o.from === override.from && o.to === override.to),
        );
        // Proposals are regenerated, so indices shift — earlier decisions no longer apply.
        set({ game: engine.refresh({ ...game, overrides: [...overrides, override] }), decisions: {} });
      },

      clearOverride: (itemId, depotId) => {
        const { game } = get();
        if (!game) return;
        const overrides = game.overrides.filter((o) => !(o.itemId === itemId && o.depotId === depotId));
        set({ game: engine.refresh({ ...game, overrides }), decisions: {} });
      },

      endDay: () => {
        const { scenario, game, decisions } = get();
        if (!game || isScenarioOver(scenario, game)) return;
        const inputs: ProposalDecisionInput[] = Object.entries(decisions).map(([i, d]) => ({ index: Number(i), ...d }));
        set({ game: engine.tick(engine.placeOrders(game, inputs)), decisions: {} });
      },

      newGame: () => {
        set({ scenario: null, game: null, decisions: {} });
        useGameStore.persist.clearStorage();
      },
    }),
    {
      name: SAVE_KEY,
      version: SAVE_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ scenario: s.scenario, game: s.game, decisions: s.decisions }),
    },
  ),
);
