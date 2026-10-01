// Vendor minimums (docs/RELEX_RULES.md §6): top up `can` items until the minimum is met,
// otherwise flag a shortfall for the player.
import type { PlanLine } from './replenishment';
import { rules as defaultRules, type Rules } from './rules.config';
import type { GameState, PlanningException, Vendor } from './types';

/** Days of cover at D2 including qty already proposed. No forecast → Infinity. */
export function daysOfCoverAtD2(line: PlanLine): number {
  const stock = line.proposal.projectedAtD2 + line.proposal.qty;
  return line.avgDailyForecast > 0 ? stock / line.avgDailyForecast : Infinity;
}

function groupTotal(lines: PlanLine[], vendor: Vendor): number {
  if (!vendor.minimum) return 0;
  return lines.reduce((s, l) => s + (vendor.minimum!.kind === 'value' ? l.proposal.cost : l.proposal.qty), 0);
}

/**
 * Apply vendor minimums per (vendor, depot) order. Only groups that already order something
 * are topped up. Fill adds one pack at a time to the best-ranked `can` line still below its
 * COP (ranked by rules.vendorMinFillPriority, ties by itemId); filled lines become
 * 'vendor-min-fill'. Returns new lines (inputs untouched) and shortfall exceptions.
 */
export function applyVendorMinimums(
  state: GameState,
  input: PlanLine[],
  r: Rules = defaultRules,
): { lines: PlanLine[]; exceptions: PlanningException[] } {
  const lines = input.map((l) => ({ ...l, proposal: { ...l.proposal } }));
  const exceptions: PlanningException[] = [];

  const groups = new Map<string, PlanLine[]>();
  for (const l of lines) {
    const key = `${l.proposal.vendorId}\u0000${l.proposal.depotId}`;
    groups.set(key, [...(groups.get(key) ?? []), l]);
  }

  for (const group of groups.values()) {
    const vendor = state.vendors[group[0].proposal.vendorId];
    const min = vendor?.minimum;
    if (!min || !group.some((l) => l.proposal.qty > 0)) continue;

    const rank = (l: PlanLine) => {
      const crit = state.items[l.proposal.itemId]?.criticality ?? 0;
      return r.vendorMinFillPriority === 'criticality' ? [-crit, daysOfCoverAtD2(l)] : [daysOfCoverAtD2(l), -crit];
    };
    let total = groupTotal(group, vendor);
    while (total < min.amount) {
      const candidates = group.filter(
        (l) =>
          (l.proposal.reason === 'can' || l.proposal.reason === 'vendor-min-fill') &&
          l.proposal.projectedAtD2 + l.proposal.qty < l.proposal.canOrderPoint,
      );
      if (candidates.length === 0) break;
      candidates.sort((a, b) => {
        const [a0, a1] = rank(a);
        const [b0, b1] = rank(b);
        return a0 - b0 || a1 - b1 || a.proposal.itemId.localeCompare(b.proposal.itemId);
      });
      const pick = candidates[0];
      pick.proposal.qty += Math.max(1, pick.packSize);
      pick.proposal.cost = pick.proposal.qty * pick.unitCost;
      pick.proposal.reason = 'vendor-min-fill';
      total = groupTotal(group, vendor);
    }

    if (total < min.amount) {
      const unit = min.kind === 'value' ? ' silver' : ' units';
      exceptions.push({
        kind: 'vendor-min-shortfall',
        day: state.today,
        vendorId: vendor.id,
        depotId: group[0].proposal.depotId,
        message: `${vendor.name}: order totals ${round2(total)}${unit}, below the minimum of ${min.amount}${unit}.`,
      });
    }
  }
  return { lines, exceptions };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
