// MOCK of src/store/gameStore.ts with the shape the lead announced. Delete once the real store
// lands; src/ui/hooks.ts is the only importer.

import { create } from 'zustand';
import type { DepotId, ForecastOverride, GameState, ItemId, OpenOrder, ProposalDecision, Scenario } from '../../engine/types';
import { mockGame, mockScenario } from './mockState';
import { alignMockProposals, selectForecast } from './mockSelectors';

type ScenarioMeta = Pick<Scenario, 'id' | 'title' | 'briefing' | 'teaches' | 'lengthDays'>;

export interface GameStore {
  scenario: ScenarioMeta | null;
  game: GameState | null;
  decisions: Record<number, { decision: ProposalDecision; qty?: number }>;
  loadScenario: (scenario: ScenarioMeta) => void;
  decideProposal: (index: number, decision: ProposalDecision, qty?: number) => void;
  setOverride: (override: ForecastOverride) => void;
  clearOverride: (itemId: ItemId, depotId: DepotId) => void;
  endDay: () => void;
  newGame: () => void;
}

const initialGame = () => alignMockProposals(structuredClone(mockGame));

export const useGameStore = create<GameStore>((set, get) => ({
  scenario: mockScenario,
  game: initialGame(),
  decisions: {},
  loadScenario: (scenario) => set({ scenario, game: initialGame(), decisions: {} }),
  decideProposal: (index, decision, qty) =>
    set((s) => ({ decisions: { ...s.decisions, [index]: { decision, qty } } })),
  setOverride: (override) =>
    set((s) =>
      s.game
        ? {
            game: alignMockProposals({
              ...s.game,
              overrides: [
                ...s.game.overrides.filter((o) => !(o.itemId === override.itemId && o.depotId === override.depotId)),
                override,
              ],
            }),
          }
        : s,
    ),
  clearOverride: (itemId, depotId) =>
    set((s) =>
      s.game
        ? {
            game: alignMockProposals({
              ...s.game,
              overrides: s.game.overrides.filter((o) => !(o.itemId === itemId && o.depotId === depotId)),
            }),
          }
        : s,
    ),
  // Crude mock tick: place accepted orders, consume forecast as demand, receive deliveries.
  endDay: () => {
    const { game, decisions } = get();
    if (!game) return;
    const placed: OpenOrder[] = [];
    let spend = 0;
    game.proposals.forEach((p, i) => {
      const d = decisions[i];
      if (d?.decision !== 'accepted') return;
      const qty = d.qty ?? p.qty;
      const cost = (p.cost / p.qty) * qty;
      spend += cost;
      placed.push({ id: `oo-${game.today}-${i}`, itemId: p.itemId, depotId: p.depotId, vendorId: p.vendorId, qty, orderedOn: game.today, deliveryOn: p.d1, cost });
    });
    const openOrders = [...game.openOrders, ...placed];
    const today = game.today;
    const locations = game.locations.map((l) => {
      const demand = selectForecast(game, l.itemId, l.depotId, today, today)[0]?.total ?? 0;
      const receipts = openOrders
        .filter((o) => o.itemId === l.itemId && o.depotId === l.depotId && o.deliveryOn === today)
        .reduce((a, o) => a + o.qty, 0);
      return { ...l, onHand: Math.max(0, l.onHand + receipts - demand), history: [...l.history, demand] };
    });
    const periods = game.periods.map((p) => (today >= p.start && today <= p.end ? { ...p, committed: p.committed + spend } : p));
    set({
      game: alignMockProposals({
        ...game,
        today: today + 1,
        locations,
        openOrders: openOrders.filter((o) => o.deliveryOn > today),
        proposals: game.proposals.filter((_, i) => !decisions[i]),
        periods,
      }),
      decisions: {},
    });
  },
  newGame: () => set({ game: initialGame(), decisions: {} }),
}));
