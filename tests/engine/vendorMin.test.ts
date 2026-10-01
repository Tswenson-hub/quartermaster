import { describe, expect, it } from 'vitest';
import { generatePlanLines } from '../../src/engine/replenishment';
import { rules, type Rules } from '../../src/engine/rules.config';
import type { Vendor } from '../../src/engine/types';
import { applyVendorMinimums } from '../../src/engine/vendorMin';
import { item, loc, source, state, vendor } from './fixtures';

// A: on hand 70 → proj 10, must 30.  B: 110 → proj 50 (5.0 days cover).  C: 105 → proj 45 (4.5 days).
// All: MOP 40, COP 70, pack 10, unit cost 2.
function setup(minimum: Vendor['minimum'], extra = {}) {
  const s = state({
    items: { a: item('a'), b: item('b'), c: item('c') },
    vendors: { v: vendor('v', { minimum }) },
    sourcing: ['a', 'b', 'c'].map((id) => source(id, 'v', { packSize: 10 })),
    locations: [loc('a', { onHand: 70 }), loc('b', { onHand: 110 }), loc('c', { onHand: 105 })],
    ...extra,
  });
  return { s, lines: generatePlanLines(s) };
}
const qtys = (lines: ReturnType<typeof generatePlanLines>) =>
  Object.fromEntries(lines.map((l) => [l.proposal.itemId, [l.proposal.reason, l.proposal.qty]]));

describe('vendor minimums', () => {
  it('raw proposals: A must 30, B and C can with qty 0', () => {
    expect(qtys(setup(undefined).lines)).toEqual({ a: ['must', 30], b: ['can', 0], c: ['can', 0] });
  });

  it('min 60 units: fill one pack at a time by lowest days of cover → C, B, C', () => {
    const { s, lines } = setup({ kind: 'units', amount: 60 });
    const out = applyVendorMinimums(s, lines);
    expect(qtys(out.lines)).toEqual({ a: ['must', 30], b: ['vendor-min-fill', 10], c: ['vendor-min-fill', 20] });
    expect(out.lines.find((l) => l.proposal.itemId === 'c')!.proposal.cost).toBe(40);
    expect(out.exceptions).toEqual([]);
    expect(lines[2].proposal.qty).toBe(0); // input not mutated
  });

  it('min 100 units: can items stop at COP; 80 < 100 → shortfall flagged', () => {
    const { s, lines } = setup({ kind: 'units', amount: 100 });
    const out = applyVendorMinimums(s, lines);
    // B fills to 70 (= COP); C to 75 (was 65 < 70 before its last pack).
    expect(qtys(out.lines)).toEqual({ a: ['must', 30], b: ['vendor-min-fill', 20], c: ['vendor-min-fill', 30] });
    expect(out.exceptions).toHaveLength(1);
    expect(out.exceptions[0]).toMatchObject({ kind: 'vendor-min-shortfall', vendorId: 'v', depotId: 'camp' });
  });

  it('value minimum: 80 silver = A (60) + one pack of C (20)', () => {
    const { s, lines } = setup({ kind: 'value', amount: 80 });
    expect(qtys(applyVendorMinimums(s, lines).lines)).toEqual({ a: ['must', 30], b: ['can', 0], c: ['vendor-min-fill', 10] });
  });

  it("criticality ranking fills the most critical item first", () => {
    const r: Rules = { ...rules, vendorMinFillPriority: 'criticality' };
    const { s, lines } = setup(
      { kind: 'units', amount: 40 },
      { items: { a: item('a'), b: item('b', { criticality: 5 }), c: item('c') } },
    );
    expect(qtys(applyVendorMinimums(s, lines, r).lines).b).toEqual(['vendor-min-fill', 10]);
  });

  it('no top-up when nothing must be ordered from the vendor', () => {
    const { s } = setup({ kind: 'units', amount: 60 });
    const s2 = { ...s, locations: s.locations.filter((l) => l.itemId !== 'a') };
    const out = applyVendorMinimums(s2, generatePlanLines(s2));
    expect(out.lines.every((l) => l.proposal.qty === 0)).toBe(true);
    expect(out.exceptions).toEqual([]);
  });
});
