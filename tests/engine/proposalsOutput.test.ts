// What the store/UI sees: no zero-qty lines, and message text with whole numbers only.
import { describe, expect, it } from 'vitest';
import { scenarios } from '../../src/content';
import { engine } from '../../src/engine';
import { refresh } from '../../src/engine/tick';
import type { GameState } from '../../src/engine/types';
import { item, loc, quietRules as q, source, state, vendor } from './fixtures';

const threeItems = (amount: number) =>
  state({
    items: { a: item('a'), b: item('b'), c: item('c') },
    vendors: { v: vendor('v', { minimum: { kind: 'units', amount } }) },
    sourcing: ['a', 'b', 'c'].map((id) => source(id, 'v', { packSize: 10 })),
    // a: must 30; b, c: between MOP and COP
    locations: [loc('a', { onHand: 70 }), loc('b', { onHand: 110 }), loc('c', { onHand: 105 })],
  });

function playSandbox(check: (s: GameState) => void) {
  const sandbox = scenarios.find((x) => x.id === 'sandbox')!;
  let s = engine.initGame(sandbox);
  for (let d = 0; d < sandbox.lengthDays; d++) {
    check(s);
    s = engine.tick(engine.placeOrders(s, s.proposals.map((_, index) => ({ index, decision: 'accepted' as const }))));
  }
  check(s);
}

describe('proposals exposed by refresh', () => {
  it('unfilled can items are not proposed', () => {
    expect(refresh(threeItems(0), q).proposals.map((p) => [p.itemId, p.reason, p.qty])).toEqual([['a', 'must', 30]]);
  });

  it('items pulled in for a vendor minimum appear with qty > 0', () => {
    // Min 50, need 30 (60% ≥ 50% trigger): a (4.0 days) +10, then c (4.5) +10; b stays out.
    expect(refresh(threeItems(50), q).proposals.map((p) => [p.itemId, p.reason, p.qty])).toEqual([
      ['a', 'must', 40],
      ['c', 'vendor-min-fill', 10],
    ]);
  });

  it('sandbox accept-all: every proposal on every day has qty > 0', () => {
    playSandbox((s) => expect(s.proposals.filter((p) => p.qty <= 0)).toEqual([]));
  });

  it('sandbox accept-all: builtQty always set, 0 ≤ builtQty ≤ qty, and only build lines are pure build', () => {
    playSandbox((s) => {
      for (const p of s.proposals) {
        expect(p.builtQty).toBeGreaterThanOrEqual(0);
        expect(p.builtQty).toBeLessThanOrEqual(p.qty);
        if (p.reason === 'vendor-min-fill') expect(p.builtQty).toBe(p.qty);
      }
    });
  });
});

describe('exception messages', () => {
  it('below-MOP message uses whole units', () => {
    // History mean 71/7 → proj at D2 = 70 − 6 × 71/7 = 9.14…
    const s = refresh(state({ locations: [loc('grain', { onHand: 70, history: [10, 10, 10, 10, 10, 10, 11] })] }), q);
    const p = s.proposals[0];
    expect(p.projectedAtD2).toBeCloseTo(70 - (6 * 71) / 7, 10);
    expect(s.exceptions.find((x) => x.kind === 'below-mop')!.message).toBe(
      `Projected stock at D2 (day 6) is 9, below the MOP of ${p.mustOrderPoint}.`,
    );
    expect(Number.isInteger(p.mustOrderPoint)).toBe(true);
  });

  it('sandbox accept-all: no decimals in any message', () => {
    playSandbox((s) => expect(s.exceptions.filter((e) => /\d\.\d/.test(e.message)).map((e) => e.message)).toEqual([]));
  });
});
