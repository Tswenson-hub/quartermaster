// The UI's only door into game state. Screens import from here, never from src/store directly.
// Everything in this file is presentation-side shaping (grouping, sums for display).
// Replenishment maths (MOP, COP, D1/D2, quantities) always comes from the engine via src/store.

import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { Day, DepotId, FiscalPeriod, GameState, ItemId, OrderProposal, PlanningException, PlanningParams, ProposalDecision, Scenario, SourcingRule, Vendor } from '../engine/types';
import {
  isScenarioOver,
  selectCurrentPeriod,
  selectExceptionsToday,
  selectForecast,
  selectPlanningParams,
  selectProjection,
  selectServiceLevel,
  useGameStore,
} from '../store';
import { sandboxScenario } from './mock/sandboxScenario';
import { useUiStore } from './uiStore';

// src/content may not export scenarios yet (content branch). Glob keeps the build green either way.
const contentModules = import.meta.glob<{ scenarios?: Scenario[] }>('../content/index.ts', { eager: true });
const contentScenarios = Object.values(contentModules)[0]?.scenarios ?? [];

/** Playable levels; the UI sandbox is appended only while content has none. */
export function useScenarioList(): Scenario[] {
  return contentScenarios.length ? contentScenarios : [sandboxScenario];
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

export function useGameActions() {
  return useGameStore(
    useShallow((s) => ({
      loadScenario: s.loadScenario,
      decideProposal: s.decideProposal,
      setOverride: s.setOverride,
      clearOverride: s.clearOverride,
      endDay: s.endDay,
      newGame: s.newGame,
    })),
  );
}

// ---------------------------------------------------------------- item planning

export interface PlanningPoint {
  day: Day;
  /** Actual demand (past days only). */
  history?: number;
  /** Final forecast (incl. battle-plan uplift / overrides). */
  forecast: number;
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
  /** Today's proposal for this item-location, if any (carries D1/D2). */
  proposal?: OrderProposal;
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
      // history's last entry is yesterday
      history: f.day < game.today ? loc.history[loc.history.length - (game.today - f.day)] : undefined,
      projected: f.day >= game.today ? proj[f.day - game.today] : undefined,
    }));
    const proposal = game.proposals.find((p) => p.itemId === itemId && p.depotId === depotId);
    return {
      itemId,
      depotId,
      today: game.today,
      onHand: loc.onHand,
      points,
      params: selectPlanningParams(game, itemId, depotId),
      proposal,
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
}

export interface VendorGroup {
  vendor: Vendor;
  lines: ProposalLine[];
  acceptedValue: number;
  acceptedUnits: number;
  /** Accepted + undecided lines. */
  openValue: number;
  openUnits: number;
}

function sourcingFor(sourcing: SourcingRule[], p: OrderProposal) {
  return sourcing.find((s) => s.itemId === p.itemId && s.vendorId === p.vendorId);
}

export function useVendorGroups(): VendorGroup[] {
  const game = useGame();
  const decisions = useGameStore((s) => s.decisions);
  const drafts = useUiStore((s) => s.draftQty);
  return useMemo(() => {
    if (!game) return [];
    const byVendor = new Map<string, VendorGroup>();
    for (const v of Object.values(game.vendors)) {
      byVendor.set(v.id, { vendor: v, lines: [], acceptedValue: 0, acceptedUnits: 0, openValue: 0, openUnits: 0 });
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
      };
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
  }, [game, decisions, drafts]);
}

// ---------------------------------------------------------------- treasury

export interface TreasuryView {
  period: FiscalPeriod | undefined;
  periods: FiscalPeriod[];
  /** Value of lines accepted today, committed when the day ends. */
  pendingToday: number;
  remaining: number;
}

export function useTreasury(): TreasuryView | null {
  const game = useGame();
  const groups = useVendorGroups();
  return useMemo(() => {
    if (!game) return null;
    const period = selectCurrentPeriod(game);
    const pendingToday = groups.reduce((a, g) => a + g.acceptedValue, 0);
    const remaining = period ? period.allowance - period.committed - pendingToday : 0;
    return { period, periods: game.periods, pendingToday, remaining };
  }, [game, groups]);
}

// ---------------------------------------------------------------- dispatch / KPIs

export function useExceptionsToday(): PlanningException[] {
  const game = useGame();
  return useMemo(() => (game ? selectExceptionsToday(game) : []), [game]);
}

/** Service level to date as a percentage (0–100). */
export function useServiceLevel(): number {
  const game = useGame();
  return useMemo(() => (game ? Math.round(selectServiceLevel(game) * 1000) / 10 : 100), [game]);
}
