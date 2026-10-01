import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { rules } from '../engine/rules.config';
import type {
  Day,
  DepotId,
  Difficulty,
  ForecastOverride,
  GameState,
  ItemId,
  ProposalDecision,
  ProposalDecisionInput,
  Scenario,
  VendorId,
} from '../engine/types';
import { engine } from './engine';
import { loadMarketSeries, snapshotSeries, toMarketSignal, type MarketSeries } from './market';

export const SAVE_KEY = 'quartermaster-save';
/** Bump when GameState changes shape; older saves are discarded. */
export const SAVE_VERSION = 2;

export interface DecisionEntry {
  decision: ProposalDecision;
  qty?: number;
}

/** A player forecast override: one day's quantity, or a total over a range that the engine breaks out. */
export type OverrideInput =
  | { itemId: ItemId; depotId: DepotId; day: Day; qty: number }
  | { itemId: ItemId; depotId: DepotId; from: Day; to: Day; total: number };

/** Which overrides to delete: all for the item-location, or only the one with this exact range. */
export interface OverrideMatch {
  itemId: ItemId;
  depotId: DepotId;
  from?: Day;
  to?: Day;
}

export interface GameStore {
  scenario: Scenario | null;
  game: GameState | null;
  /** Player decisions on today's proposals, keyed by index into game.proposals. Cleared each day. */
  decisions: Record<number, DecisionEntry>;
  /** True while newGame is fetching the market series. */
  starting: boolean;

  /** Start a game: fetch the difficulty's market series (live, cached or bundled snapshot), then init. */
  newGame(scenario: Scenario, difficulty?: Difficulty): Promise<void>;
  /** Start synchronously on the bundled market snapshot (offline, tests, e2e). */
  loadScenario(scenario: Scenario, difficulty?: Difficulty): void;
  decideProposal(index: number, decision: ProposalDecision, qty?: number): void;
  /** Player's order trigger for a vendor with a minimum (fraction of the minimum); null restores the default. */
  setVendorTrigger(vendorId: VendorId, trigger: number | null): void;
  /** Add a forecast override. It IS the forecast on its days until deleted (RELEX_RULES §8). */
  setForecastOverride(input: OverrideInput): void;
  deleteOverride(match: OverrideMatch): void;
  /** @deprecated use setForecastOverride */
  setOverride(override: ForecastOverride): void;
  /** @deprecated use deleteOverride */
  clearOverride(itemId: ItemId, depotId: DepotId): void;
  /** Place accepted orders, then advance one day. No-op once the game is over. */
  endDay(): void;
  /** Drop the current game and its save. */
  quitGame(): void;
}

export function isScenarioOver(scenario: Scenario | null, game: GameState | null): boolean {
  return !!scenario && !!game && (game.status !== 'playing' || game.today >= scenario.lengthDays);
}

function startGame(scenario: Scenario, difficulty: Difficulty, series: MarketSeries) {
  const market = toMarketSignal(series, scenario.lengthDays);
  return { scenario, game: engine.initGame(scenario, { difficulty, market }), decisions: {}, starting: false };
}

function toOverride(input: OverrideInput): ForecastOverride {
  return 'day' in input
    ? { itemId: input.itemId, depotId: input.depotId, from: input.day, to: input.day, mode: 'absolute', value: input.qty }
    : { itemId: input.itemId, depotId: input.depotId, from: input.from, to: input.to, mode: 'aggregate', value: input.total };
}

const sameRange = (a: ForecastOverride, b: ForecastOverride) =>
  a.itemId === b.itemId && a.depotId === b.depotId && a.from === b.from && a.to === b.to;

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => {
      /** Change inputs, recompute proposals. Proposal indices shift, so today's decisions are cleared. */
      const updateGame = (change: (game: GameState) => GameState) => {
        const { game } = get();
        if (!game) return;
        set({ game: engine.refresh(change(game)), decisions: {} });
      };
      const addOverride = (override: ForecastOverride) =>
        updateGame((g) => ({ ...g, overrides: [...g.overrides.filter((o) => !sameRange(o, override)), override] }));
      const removeOverrides = (m: OverrideMatch) =>
        updateGame((g) => ({
          ...g,
          overrides: g.overrides.filter(
            (o) =>
              !(
                o.itemId === m.itemId &&
                o.depotId === m.depotId &&
                (m.from === undefined || o.from === m.from) &&
                (m.to === undefined || o.to === m.to)
              ),
          ),
        }));

      return {
        scenario: null,
        game: null,
        decisions: {},
        starting: false,

        newGame: async (scenario, difficulty = 'normal') => {
          set({ starting: true });
          const series = await loadMarketSeries(rules.difficulty[difficulty].ticker);
          set(startGame(scenario, difficulty, series));
        },

        loadScenario: (scenario, difficulty = 'normal') =>
          set(startGame(scenario, difficulty, snapshotSeries(rules.difficulty[difficulty].ticker))),

        decideProposal: (index, decision, qty) => {
          const { game, decisions } = get();
          if (!game || !game.proposals[index]) return;
          set({ decisions: { ...decisions, [index]: qty === undefined ? { decision } : { decision, qty } } });
        },

        setVendorTrigger: (vendorId, trigger) =>
          updateGame((g) => {
            const vendorTriggers = { ...g.vendorTriggers };
            if (trigger === null) delete vendorTriggers[vendorId];
            else vendorTriggers[vendorId] = Math.max(0, trigger);
            return { ...g, vendorTriggers };
          }),

        setForecastOverride: (input) => addOverride(toOverride(input)),
        deleteOverride: removeOverrides,
        setOverride: addOverride,
        clearOverride: (itemId, depotId) => removeOverrides({ itemId, depotId }),

        endDay: () => {
          const { scenario, game, decisions } = get();
          if (!game || isScenarioOver(scenario, game)) return;
          const inputs: ProposalDecisionInput[] = Object.entries(decisions).map(([i, d]) => ({ index: Number(i), ...d }));
          set({ game: engine.tick(engine.placeOrders(game, inputs)), decisions: {} });
        },

        quitGame: () => {
          set({ scenario: null, game: null, decisions: {}, starting: false });
          useGameStore.persist.clearStorage();
        },
      };
    },
    {
      name: SAVE_KEY,
      version: SAVE_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ scenario: s.scenario, game: s.game, decisions: s.decisions }),
      // Saves from an older contract can't be resumed safely; start fresh.
      migrate: () => ({ scenario: null, game: null, decisions: {} }),
    },
  ),
);
