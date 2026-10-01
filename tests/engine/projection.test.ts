import { describe, expect, it } from 'vitest';
import { project, projectStock } from '../../src/engine/projection';
import { rules } from '../../src/engine/rules.config';
import type { OpenOrder } from '../../src/engine/types';
import { loc, state } from './fixtures';

const order = (qty: number, deliveryOn: number, extra: Partial<OpenOrder> = {}): OpenOrder => ({
  id: `o${deliveryOn}`,
  itemId: 'grain',
  depotId: 'camp',
  vendorId: 'v',
  qty,
  orderedOn: 0,
  deliveryOn,
  cost: 0,
  ...extra,
});

describe('projection', () => {
  it('end-of-day stock: on hand 100, forecast 10/day', () => {
    expect(project(state(), 'grain', 'camp', 0, 5)).toEqual([90, 80, 70, 60, 50, 40]);
  });

  it('adds open orders on their delivery day; ignores other locations', () => {
    const s = state({ openOrders: [order(50, 2), order(99, 2, { depotId: 'north' })] });
    expect(project(s, 'grain', 'camp', 0, 3)).toEqual([90, 80, 120, 110]);
  });

  it('lost sales: stock clamps at 0, then the receipt rebuilds it', () => {
    const s = state({ locations: [loc('grain', { onHand: 20 })], openOrders: [order(30, 4)] });
    expect(project(s, 'grain', 'camp', 0, 5)).toEqual([10, 0, 0, 0, 20, 10]);
  });

  it('backorder mode lets stock go negative', () => {
    expect(projectStock(20, [10, 10, 10, 10, 10, 10], [0, 0, 0, 0, 30], false)).toEqual([10, 0, -10, -20, 0, -10]);
    expect(rules.projection.lostSales).toBe(true);
  });

  it('days before today are NaN; slicing respects from', () => {
    const p = project(state({ today: 1 }), 'grain', 'camp', 0, 3);
    expect(p[0]).toBeNaN();
    expect(p.slice(1)).toEqual([90, 80, 70]);
    expect(project(state(), 'grain', 'camp', 2, 3)).toEqual([70, 60]);
  });
});
