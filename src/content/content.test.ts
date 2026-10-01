import { describe, expect, it } from 'vitest';
import { rules } from '../engine/rules.config';
import { generateHistory } from './history';
import { BASE_DEMAND, BATTLE_PLANS, ITEMS, SOURCING, VENDORS, scenarios } from './index';

describe('content', () => {
  it('first level is tutorial-1 with one item, vendor and depot', () => {
    const s = scenarios[0];
    expect(s.id).toBe('tutorial-1');
    expect(Object.keys(s.initial.items)).toHaveLength(1);
    expect(Object.keys(s.initial.vendors)).toHaveLength(1);
    expect(Object.keys(s.initial.depots)).toHaveLength(1);
    expect(s.lengthDays).toBe(14);
  });

  it('has 9 tutorial levels plus a sandbox with unique ids', () => {
    expect(scenarios).toHaveLength(10);
    expect(new Set(scenarios.map((s) => s.id)).size).toBe(10);
  });

  it('sourcing references known items/vendors; split shares sum to 1', () => {
    for (const r of SOURCING) {
      expect(ITEMS[r.itemId]).toBeDefined();
      expect(VENDORS[r.vendorId]).toBeDefined();
    }
    const multi = new Set(SOURCING.map((r) => r.itemId).filter((id, i, a) => a.indexOf(id) !== i));
    expect(multi.size).toBeGreaterThanOrEqual(3);
  });

  it('outside vendors take at least rules.minVendorLeadTimeDays to deliver', () => {
    for (const v of Object.values(VENDORS)) {
      if (v.dcDepotId) continue;
      expect(v.leadTimeDays, v.id).toBeGreaterThanOrEqual(rules.minVendorLeadTimeDays);
    }
  });

  it('vendor lead times are 1–7 days with valid weekdays', () => {
    for (const v of Object.values(VENDORS)) {
      expect(v.leadTimeDays).toBeGreaterThanOrEqual(1);
      expect(v.leadTimeDays).toBeLessThanOrEqual(7);
      expect(v.orderDays.length).toBeGreaterThan(0);
    }
  });

  it('battle plans arrive before they start and only touch known items', () => {
    for (const p of BATTLE_PLANS) {
      expect(p.announcedOn).toBeLessThan(p.start);
      expect(p.start).toBeLessThanOrEqual(p.end);
      for (const id of [...Object.keys(p.statedUplift), ...Object.keys(p.actualUplift)]) expect(ITEMS[id]).toBeDefined();
    }
  });

  for (const s of scenarios) {
    describe(s.id, () => {
      const st = s.initial;
      it('is internally consistent', () => {
        for (const l of st.locations) {
          expect(st.items[l.itemId]).toBeDefined();
          expect(st.depots[l.depotId]).toBeDefined();
          expect(l.history.length).toBeGreaterThanOrEqual(28);
          expect(l.history.every((d) => Number.isInteger(d) && d >= 0)).toBe(true);
          expect(st.sourcing.some((r) => r.itemId === l.itemId)).toBe(true);
        }
        for (const r of st.sourcing) expect(st.vendors[r.vendorId]).toBeDefined();
        const byItem = new Map<string, number>();
        for (const r of st.sourcing) if (r.splitShare !== undefined) byItem.set(r.itemId, (byItem.get(r.itemId) ?? 0) + r.splitShare);
        for (const total of byItem.values()) expect(total).toBeCloseTo(1);
        for (const p of st.battlePlans) {
          expect(p.end).toBeLessThan(s.lengthDays);
          for (const d of p.depotIds) expect(st.depots[d]).toBeDefined();
          for (const id of Object.keys(p.statedUplift)) expect(st.items[id]).toBeDefined();
        }
        expect(st.periods.at(-1)?.end).toBe(s.lengthDays - 1);
        expect(s.periodAllowance).toBeGreaterThan(0);
      });
      it('history is deterministic', () => {
        for (const l of st.locations) {
          const spec = { ...BASE_DEMAND[l.itemId] };
          expect(generateHistory(st.seed, l.itemId, l.depotId, spec)).toEqual(generateHistory(st.seed, l.itemId, l.depotId, spec));
        }
      });
    });
  }
});
