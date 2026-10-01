// Vendor minimums — CO-MRP order trigger and build-to-minimum (docs/RELEX_RULES.md §4, §6).
import type { PlanLine } from './replenishment';
import { rules as defaultRules, type Rules } from './rules.config';
import type { GameState, OrderProposal, PlanningException, Vendor, VendorId } from './types';

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
    r.vendorMin.buildPriority === 'criticality' ? [-l.criticality, daysOfCover(l)] : [daysOfCover(l), -l.criticality];
  let total = need;
  while (total < min.amount && steps.length < r.vendorMin.maxPacks) {
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

/** Order trigger for a vendor (0–1 of its minimum). */
export type TriggerLookup = (vendorId: VendorId) => number;

/**
 * Apply CO-MRP per (vendor, depot) order to today's plan lines. Returns the proposals to show
 * (qty > 0 only; lines grown by the build keep 'must', others become 'vendor-min-fill') and
 * vendor-min-shortfall exceptions for orders held back below the trigger.
 */
export function applyVendorMinimums(
  state: GameState,
  input: readonly PlanLine[],
  triggerFor: TriggerLookup = () => defaultRules.vendorMin.defaultOrderTrigger,
  r: Rules = defaultRules,
): { proposals: OrderProposal[]; exceptions: PlanningException[] } {
  const proposals: OrderProposal[] = [];
  const exceptions: PlanningException[] = [];

  const groups = new Map<string, PlanLine[]>();
  for (const l of input) {
    const key = `${l.proposal.vendorId}\u0000${l.proposal.depotId}`;
    groups.set(key, [...(groups.get(key) ?? []), l]);
  }

  for (const group of groups.values()) {
    const vendor = state.vendors[group[0].proposal.vendorId];
    const min = vendor?.minimum;
    if (!min) {
      proposals.push(...group.map((l) => l.proposal).filter((p) => p.qty > 0));
      continue;
    }
    const trigger = triggerFor(vendor.id);
    const result = buildToMinimum(
      group.map((l) => ({
        itemId: l.proposal.itemId,
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

    if (result.outcome === 'below-trigger') {
      const unit = min.kind === 'value' ? ' silver' : ' units';
      exceptions.push({
        kind: 'vendor-min-shortfall',
        day: state.today,
        vendorId: vendor.id,
        depotId: group[0].proposal.depotId,
        message:
          `${vendor.name}: must-order need is ${pct(result.needRatio)} of the ${whole(min.amount)}${unit} minimum, ` +
          `below the ${pct(trigger)} order trigger — no order proposed. Lower the trigger to build up to the minimum.`,
      });
      continue;
    }
    if (result.outcome === 'built-short') {
      exceptions.push({
        kind: 'vendor-min-shortfall',
        day: state.today,
        vendorId: vendor.id,
        depotId: group[0].proposal.depotId,
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
  return { proposals, exceptions };
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}
/** Whole units / coins for message text (the UI shows messages verbatim). */
function whole(n: number): number {
  return Math.round(n);
}
