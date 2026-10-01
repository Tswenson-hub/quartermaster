// Vendor minimums — CO-MRP order trigger and build-to-minimum (docs/RELEX_RULES.md §4, §6).
import type { PlanLine } from './replenishment';
import { rules as defaultRules, type Rules } from './rules.config';
import type { GameState, OrderProposal, PlanningException, Vendor, VendorId, VendorPlan } from './types';

export type VendorMinimum = NonNullable<Vendor['minimum']>;

/** A line the build loop can grow. qty is pack-rounded; must lines start at their must qty. */
export interface BuildCandidate {
  itemId: string;
  qty: number;
  packSize: number;
  unitCost: number;
  projectedAtD2: number;
  avgDailyForecast: number;
  criticality: number;
  must: boolean;
}

export type BuildOutcome =
  /** No must-order need: nothing to order from this vendor. */
  | 'no-need'
  /** The must lines alone meet the minimum. */
  | 'met'
  /** Need ≥ trigger: built up to the minimum. */
  | 'built'
  /** Need ≥ trigger but every candidate is exhausted (no forecast anywhere) before the minimum. */
  | 'built-short'
  /** Need < trigger: no order is proposed. */
  | 'below-trigger';

export interface BuildResult {
  outcome: BuildOutcome;
  /** Must-order need ÷ minimum (0–∞). */
  needRatio: number;
  lines: BuildCandidate[];
  /** Item that received each added pack, in order (for explaining the build). */
  steps: string[];
}

/** Projected days of cover at D2 including qty already on the line. No forecast → Infinity. */
export function daysOfCover(c: Pick<BuildCandidate, 'projectedAtD2' | 'qty' | 'avgDailyForecast'>): number {
  return c.avgDailyForecast > 0 ? (c.projectedAtD2 + c.qty) / c.avgDailyForecast : Infinity;
}

export function minimumTotal(lines: readonly Pick<BuildCandidate, 'qty' | 'unitCost'>[], min: VendorMinimum): number {
  return lines.reduce((s, l) => s + (min.kind === 'value' ? l.qty * l.unitCost : l.qty), 0);
}

/**
 * CO-MRP for one vendor order. needRatio = (must lines' pack-rounded total) ÷ minimum.
 * ≥ 1 → 'met'; ≥ trigger → add one pack at a time to the candidate with the greatest need
 * (lowest days of cover at D2 incl. packs already added; ties: higher criticality, then
 * itemId), re-ranking after every pack, until the minimum is reached; < trigger → no order.
 */
export function buildToMinimum(
  candidates: readonly BuildCandidate[],
  min: VendorMinimum,
  trigger: number,
  r: Rules = defaultRules,
): BuildResult {
  const lines = candidates.map((c) => ({ ...c }));
  const steps: string[] = [];
  const need = minimumTotal(lines.filter((l) => l.must), min);
  const needRatio = min.amount > 0 ? need / min.amount : Infinity;
  if (need <= 0) return { outcome: 'no-need', needRatio: 0, lines, steps };
  if (need >= min.amount) return { outcome: 'met', needRatio, lines, steps };
  if (needRatio < trigger) return { outcome: 'below-trigger', needRatio, lines, steps };

  const key = (l: BuildCandidate): [number, number] =>
    r.vendorMinimum.buildPriority === 'criticality' ? [-l.criticality, daysOfCover(l)] : [daysOfCover(l), -l.criticality];
  let total = need;
  while (total < min.amount && steps.length < r.vendorMinimum.maxPacks) {
    let pick: BuildCandidate | undefined;
    for (const l of lines) {
      if (!Number.isFinite(daysOfCover(l))) continue;
      if (!pick) {
        pick = l;
        continue;
      }
      const [a0, a1] = key(l);
      const [b0, b1] = key(pick);
      if (a0 < b0 || (a0 === b0 && (a1 < b1 || (a1 === b1 && l.itemId < pick.itemId)))) pick = l;
    }
    if (!pick) break;
    pick.qty += Math.max(1, pick.packSize);
    steps.push(pick.itemId);
    total = minimumTotal(lines, min);
  }
  return { outcome: total >= min.amount ? 'built' : 'built-short', needRatio, lines, steps };
}

/** Effective order trigger: player override ?? vendor default ?? rules default. */
export function effectiveTrigger(state: GameState, vendorId: VendorId, r: Rules = defaultRules): number {
  return state.vendorTriggers?.[vendorId] ?? state.vendors[vendorId]?.orderTrigger ?? r.vendorMinimum.defaultTrigger;
}

const STATUS: Record<BuildOutcome, VendorPlan['status']> = {
  'no-need': 'below-trigger',
  met: 'meets-minimum',
  built: 'built',
  'built-short': 'built',
  'below-trigger': 'below-trigger',
};

/**
 * Apply CO-MRP per vendor order (all depots ordering from that vendor today). Returns the
 * proposals to show (qty > 0 only; lines grown by the build keep 'must', others become
 * 'vendor-min-fill'), one VendorPlan per vendor ordering today, and vendor-min-shortfall
 * exceptions for orders held back below the trigger.
 */
export function applyVendorMinimums(
  state: GameState,
  input: readonly PlanLine[],
  r: Rules = defaultRules,
): { proposals: OrderProposal[]; vendorPlans: VendorPlan[]; exceptions: PlanningException[] } {
  const proposals: OrderProposal[] = [];
  const vendorPlans: VendorPlan[] = [];
  const exceptions: PlanningException[] = [];

  const groups = new Map<VendorId, PlanLine[]>();
  for (const l of input) groups.set(l.proposal.vendorId, [...(groups.get(l.proposal.vendorId) ?? []), l]);

  for (const [vendorId, group] of groups) {
    const vendor = state.vendors[vendorId];
    const min = vendor?.minimum;
    const trigger = effectiveTrigger(state, vendorId, r);
    if (!min) {
      const lines = group.map((l) => l.proposal).filter((p) => p.qty > 0);
      proposals.push(...lines);
      vendorPlans.push({ vendorId, need: lines.reduce((s, p) => s + p.cost, 0), trigger, ratio: 1, status: 'no-minimum' });
      continue;
    }
    const result = buildToMinimum(
      group.map((l) => ({
        itemId: `${l.proposal.itemId}\u0000${l.proposal.depotId}`,
        qty: l.proposal.reason === 'must' ? l.proposal.qty : 0,
        packSize: l.packSize,
        unitCost: l.unitCost,
        projectedAtD2: l.proposal.projectedAtD2,
        avgDailyForecast: l.avgDailyForecast,
        criticality: state.items[l.proposal.itemId]?.criticality ?? 0,
        must: l.proposal.reason === 'must',
      })),
      min,
      trigger,
      r,
    );
    const need = minimumTotal(group.filter((l) => l.proposal.reason === 'must').map((l) => ({ qty: l.proposal.qty, unitCost: l.unitCost })), min);
    vendorPlans.push({ vendorId, need, minimum: min.amount, trigger, ratio: result.needRatio, status: STATUS[result.outcome] });

    if (result.outcome === 'below-trigger' || result.outcome === 'no-need') {
      if (result.outcome === 'below-trigger') {
        const unit = min.kind === 'value' ? ' silver' : ' units';
        exceptions.push({
          kind: 'vendor-min-shortfall',
          day: state.today,
          vendorId,
          message:
            `${vendor.name}: must-order need is ${pct(result.needRatio)} of the ${whole(min.amount)}${unit} minimum, ` +
            `below the ${pct(trigger)} order trigger — no order proposed. Lower the trigger to build up to the minimum.`,
        });
      }
      continue;
    }
    if (result.outcome === 'built-short') {
      exceptions.push({
        kind: 'vendor-min-shortfall',
        day: state.today,
        vendorId,
        message: `${vendor.name}: could not build the order up to the minimum (no item with demand to add).`,
      });
    }
    group.forEach((l, i) => {
      const qty = result.lines[i].qty;
      if (qty <= 0) return;
      const reason = l.proposal.reason === 'must' ? 'must' : 'vendor-min-fill';
      proposals.push({ ...l.proposal, qty, reason, cost: qty * l.unitCost });
    });
  }
  return { proposals, vendorPlans, exceptions };
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}
/** Whole units / coins for message text (the UI shows messages verbatim). */
function whole(n: number): number {
  return Math.round(n);
}
