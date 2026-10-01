// The UI's only door into game state. Screens import from here, never from src/store directly.
// Everything in this file is presentation-side shaping (grouping, sums for display).
// Replenishment maths (MOP, COP, D1/D2, quantities) always comes from the engine via src/store.

import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type {
  Day,
  DepotId,
  FiscalPeriod,
  ForecastOverride,
  GameState,
  ItemId,
  Letter,
  OrderProposal,
  PlanningException,
  PlanningParams,
  ProposalDecision,
  Scenario,
  SourcingRule,
  Vendor,
  VendorPlan,
  Weekday,
  Item,
  Depot,
  ItemLocationStats,
  VendorStats,
} from '../engine/types';
import {
  isScenarioOver,
  selectCampaignDay,
  selectCurrentPeriod,
  selectD2CheckDay,
  selectDecisionPreview,
  selectDifficultyOptions,
  selectExceptionsToday,
  selectForecast,
  selectItemLocationRows,
  selectVendorOrderDays,
  selectVendorRows,
  selectKpiSummary,
  selectLetterText,
  selectMarketInfo,
  selectPlanningParams,
  selectProjection,
  selectServiceLevel,
  useGameStore,
} from '../store';
import { scenarios } from '../content';
import { DIFFICULTY_FLAVOUR, RANKS, rankTitle } from '../content/ranks';
import { useUiStore } from './uiStore';

/** Playable levels, tutorial first. */
export function useScenarioList(): Scenario[] {
  return scenarios;
}

export function useGame(): GameState | null {
  return useGameStore((s) => s.game);
}

export function useScenario() {
  return useGameStore((s) => s.scenario);
}

export function useScenarioOver(): boolean {
  return useGameStore((s) => isScenarioOver(s.scenario, s.game));
}

/** True while a new game is fetching its market series. */
export function useStarting(): boolean {
  return useGameStore((s) => s.starting);
}

export function useGameActions() {
  return useGameStore(
    useShallow((s) => ({
      loadScenario: s.loadScenario,
      newGame: s.newGame,
      quitGame: s.quitGame,
      decideProposal: s.decideProposal,
      setVendorTrigger: s.setVendorTrigger,
      setVendorOrderDays: s.setVendorOrderDays,
      setForecastOverride: s.setForecastOverride,
      deleteOverride: s.deleteOverride,
      endDay: s.endDay,
    })),
  );
}

export { getApiKey, setApiKey } from '../store';

/** Difficulty presets (rules) with content's title and description. */
export function useDifficultyOptions() {
  return useMemo(() => selectDifficultyOptions().map((o) => ({ ...o, ...DIFFICULTY_FLAVOUR[o.id] })), []);
}

export function useMarketInfo() {
  const game = useGame();
  return useMemo(() => (game ? selectMarketInfo(game) : null), [game]);
}

// ---------------------------------------------------------------- rank & letters

export { rankTitle };

export function useRank() {
  const game = useGame();
  return useMemo(() => {
    if (!game) return null;
    const { level, merit, reprimands, overspentStreak } = game.rank;
    return {
      level,
      merit,
      reprimands,
      overspentStreak,
      title: rankTitle(level),
      flavour: RANKS[Math.min(Math.max(level, 0), RANKS.length - 1)]?.flavour ?? '',
      maxLevel: RANKS.length - 1,
    };
  }, [game]);
}

/** Letters with display text (content templates filled with the engine's facts), oldest first. */
export function useLetterTexts() {
  const game = useGame();
  return useMemo(() => (game ? game.letters.map((letter) => ({ letter, text: selectLetterText(game, letter) })) : []), [game]);
}

export function useLetters(): Letter[] {
  return useGame()?.letters ?? EMPTY_LETTERS;
}
const EMPTY_LETTERS: Letter[] = [];

// ---------------------------------------------------------------- item planning

export interface PlanningPoint {
  day: Day;
  /** Actual demand (past days only). */
  history?: number;
  /** Final forecast (incl. battle-plan uplift / overrides). */
  forecast: number;
  /** Engine baseline + uplift before any override (what the clerk would forecast). */
  system: number;
  /** A player override sets this day's forecast. */
  overridden: boolean;
  /** Projected end-of-day stock (today onward). */
  projected?: number;
}

export interface PlanningView {
  itemId: ItemId;
  depotId: DepotId;
  today: Day;
  onHand: number;
  points: PlanningPoint[];
  /** MOP/COP/D1/D2 at the next order opportunity; undefined if the item has no source. */
  params?: PlanningParams;
  /** Day whose end-of-day projection is compared to the MOP (store's selectD2CheckDay). */
  d2CheckDay?: Day;
  /** Today's proposal for this item-location, if any (carries D1/D2). */
  proposal?: OrderProposal;
  /** Player forecast overrides for this item-location. */
  overrides: ForecastOverride[];
}

export function usePlanningView(itemId: ItemId, depotId: DepotId, pastDays = 21, futureDays = 21): PlanningView | null {
  const game = useGame();
  return useMemo(() => {
    if (!game) return null;
    const loc = game.locations.find((l) => l.itemId === itemId && l.depotId === depotId);
    if (!loc) return null;
    const from = Math.max(0, game.today - pastDays);
    const to = game.today + futureDays;
    const fc = selectForecast(game, itemId, depotId, from, to);
    const proj = selectProjection(game, itemId, depotId, game.today, to);
    const points: PlanningPoint[] = fc.map((f) => ({
      day: f.day,
      forecast: f.total,
      system: f.baseline + f.eventUplift,
      overridden: f.override !== undefined,
      // history's last entry is yesterday
      history: f.day < game.today ? loc.history[loc.history.length - (game.today - f.day)] : undefined,
      projected: f.day >= game.today ? proj[f.day - game.today] : undefined,
    }));
    const proposal = game.proposals.find((p) => p.itemId === itemId && p.depotId === depotId);
    const params = selectPlanningParams(game, itemId, depotId);
    return {
      itemId,
      depotId,
      today: game.today,
      onHand: loc.onHand,
      points,
      params,
      d2CheckDay: params ? selectD2CheckDay(params) : undefined,
      proposal,
      overrides: game.overrides.filter((o) => o.itemId === itemId && o.depotId === depotId),
    };
  }, [game, itemId, depotId, pastDays, futureDays]);
}

// ---------------------------------------------------------------- order proposals

export interface ProposalLine {
  index: number;
  proposal: OrderProposal;
  decision?: ProposalDecision;
  /** Qty shown to the player: decided qty, else draft edit, else engine proposal. */
  qty: number;
  edited: boolean;
  unitCost: number;
  packSize: number;
  /** Display cost at `qty` (engine re-prices on accept). */
  cost: number;
  /** Accepted, but the engine would not ship it (e.g. order fell below the vendor minimum). */
  dropped: boolean;
}

export interface VendorGroup {
  vendor: Vendor;
  lines: ProposalLine[];
  acceptedValue: number;
  acceptedUnits: number;
  /** Accepted + undecided lines. */
  openValue: number;
  openUnits: number;
  /** Accepted lines the engine would drop (won't ship). */
  droppedCount: number;
  /** Today's order-trigger result for this vendor (RELEX_RULES §4, §6). */
  plan?: VendorPlan;
  /** The player has set this vendor's trigger (vs. the default). */
  customTrigger: boolean;
  /** Order weekdays in effect, after the player's schedule override. */
  orderDays: Weekday[];
  /** The player has overridden this vendor's order days. */
  customSchedule: boolean;
}

/** What ending the day would order — the engine's own placeOrders on today's decisions. */
export function useDecisionPreview() {
  const game = useGame();
  const decisions = useGameStore((s) => s.decisions);
  return useMemo(() => (game ? selectDecisionPreview(game, decisions) : null), [game, decisions]);
}

function sourcingFor(sourcing: SourcingRule[], p: OrderProposal) {
  return sourcing.find((s) => s.itemId === p.itemId && s.vendorId === p.vendorId);
}

export function useVendorGroups(): VendorGroup[] {
  const game = useGame();
  const decisions = useGameStore((s) => s.decisions);
  const drafts = useUiStore((s) => s.draftQty);
  const preview = useDecisionPreview();
  return useMemo(() => {
    if (!game) return [];
    const dropped = new Set(preview?.dropped ?? []);
    const byVendor = new Map<string, VendorGroup>();
    for (const v of Object.values(game.vendors)) {
      byVendor.set(v.id, {
        vendor: v,
        lines: [],
        acceptedValue: 0,
        acceptedUnits: 0,
        openValue: 0,
        openUnits: 0,
        droppedCount: 0,
        plan: game.vendorPlans.find((vp) => vp.vendorId === v.id),
        customTrigger: game.vendorTriggers[v.id] !== undefined,
        orderDays: selectVendorOrderDays(game, v.id),
        customSchedule: game.vendorOrderDays[v.id] !== undefined,
      });
    }
    game.proposals.forEach((p, index) => {
      const g = byVendor.get(p.vendorId);
      if (!g) return;
      const src = sourcingFor(game.sourcing, p);
      const unitCost = src?.unitCost ?? p.cost / Math.max(1, p.qty);
      const d = decisions[index];
      const qty = d?.qty ?? drafts[index] ?? p.qty;
      const line: ProposalLine = {
        index,
        proposal: p,
        decision: d?.decision,
        qty,
        edited: qty !== p.qty,
        unitCost,
        packSize: src?.packSize ?? 1,
        cost: qty * unitCost,
        dropped: dropped.has(index),
      };
      if (line.dropped) g.droppedCount++;
      g.lines.push(line);
      if (line.decision === 'accepted') {
        g.acceptedValue += line.cost;
        g.acceptedUnits += qty;
      }
      if (line.decision === 'accepted' || !line.decision) {
        g.openValue += line.cost;
        g.openUnits += qty;
      }
    });
    return [...byVendor.values()].sort((a, b) => b.lines.length - a.lines.length);
  }, [game, decisions, drafts, preview]);
}

// ---------------------------------------------------------------- treasury

export interface TreasuryView {
  period: FiscalPeriod | undefined;
  periods: FiscalPeriod[];
  /** What ending the day now would spend (engine preview, excl. dropped lines). */
  pendingToday: number;
  remaining: number;
}

export function useTreasury(): TreasuryView | null {
  const game = useGame();
  const preview = useDecisionPreview();
  return useMemo(() => {
    if (!game) return null;
    const period = selectCurrentPeriod(game);
    const pendingToday = preview?.spend ?? 0;
    const remaining = period ? period.allowance - period.committed - pendingToday : 0;
    return { period, periods: game.periods, pendingToday, remaining };
  }, [game, preview]);
}

// ---------------------------------------------------------------- dispatch / KPIs

export function useExceptionsToday(): PlanningException[] {
  const game = useGame();
  return useMemo(() => (game ? selectExceptionsToday(game) : []), [game]);
}

/** Days played since the player took command (0 on the takeover morning). */
export function commandDays(game: GameState): number {
  return Math.max(0, game.today - game.startDay);
}

/** Service level since the player took command, as a percentage (0–100); 100 before any day is played. */
export function useServiceLevel(): number {
  const game = useGame();
  return useMemo(() => {
    if (!game) return 100;
    const days = commandDays(game);
    // The inherited warm-up record is not the player's doing.
    const sl = days === 0 ? 1 : game.startDay === 0 ? selectServiceLevel(game) : selectKpiSummary(game, days).serviceLevel;
    return Math.round(sl * 1000) / 10;
  }, [game]);
}

/** "Day N of M" since taking command, and how many days the previous quartermaster ran. */
export function useCampaignDay() {
  const game = useGame();
  return useMemo(() => (game ? selectCampaignDay(game) : null), [game]);
}

export function useKpiSummary(lastDays?: number) {
  const game = useGame();
  return useMemo(() => (game ? selectKpiSummary(game, lastDays) : null), [game, lastDays]);
}

// ---------------------------------------------------------------- master data

export interface ItemLocationRow {
  stats: ItemLocationStats;
  item?: Item;
  depot?: Depot;
  vendor?: Vendor;
}

/** Master Data item-location rows (engine-computed), joined with display records. */
export function useItemLocationRows(): ItemLocationRow[] {
  const game = useGame();
  return useMemo(
    () =>
      game
        ? selectItemLocationRows(game).map((stats) => ({
            stats,
            item: game.items[stats.itemId],
            depot: game.depots[stats.depotId],
            vendor: stats.vendorId ? game.vendors[stats.vendorId] : undefined,
          }))
        : [],
    [game],
  );
}

export interface VendorRow {
  stats: VendorStats;
  vendor?: Vendor;
}

/** Master Data vendor rows (master data + performance), joined with the vendor record. */
export function useVendorRows(): VendorRow[] {
  const game = useGame();
  return useMemo(
    () => (game ? selectVendorRows(game).map((stats) => ({ stats, vendor: game.vendors[stats.vendorId] })) : []),
    [game],
  );
}
