import { useMemo, useState, type ReactNode } from 'react';
import type { OrderSchedule, Weekday } from '../../engine/types';
import { ItemIcon, VendorTile } from '../components/ItemIcon';
import { Panel } from '../components/Panel';
import { Term } from '../components/Term';
import { fmtDaysOfSupply, fmtOrderDays, fmtPct, fmtQty, fmtSilver } from '../format';
import { useGameActions, useItemLocationRows, useVendorRows, type ItemLocationRow } from '../hooks';
import { useUiStore } from '../uiStore';

export function MasterDataScreen() {
  const tab = useUiStore((s) => s.masterTab);
  const setTab = useUiStore((s) => s.setMasterTab);

  return (
    <Panel
      title={<Term k="masterData">Master data</Term>}
      flavour="The quartermaster’s rolls: every store in every camp, and every merchant who serves them."
      actions={
        <div className="seg-toggle" role="tablist" aria-label="Master data">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'items'}
            className={`btn btn-small ${tab === 'items' ? 'on' : ''}`}
            data-testid="master-tab-items"
            onClick={() => setTab('items')}
          >
            Item-locations
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'vendors'}
            className={`btn btn-small ${tab === 'vendors' ? 'on' : ''}`}
            data-testid="master-tab-vendors"
            onClick={() => setTab('vendors')}
          >
            Vendors
          </button>
        </div>
      }
    >
      {tab === 'items' ? <ItemLocationsTab /> : <VendorsTab />}
    </Panel>
  );
}

// ---------------------------------------------------------------- item-locations

interface Column<R> {
  key: string;
  label: ReactNode;
  /** Plain-text label for the narrow card layout. */
  text: string;
  num?: boolean;
  sort: (r: R) => number | string;
  cell: (r: R) => ReactNode;
}

const dash = (v: number | undefined, f: (n: number) => string = fmtQty) => (v === undefined ? '—' : f(v));

const ITEM_COLUMNS: Column<ItemLocationRow>[] = [
  {
    key: 'item',
    label: 'Item',
    text: 'Item',
    sort: (r) => r.item?.name ?? r.stats.itemId,
    cell: (r) => (
      <span className="item-cell">
        <ItemIcon item={r.item} size={24} />
        <span>{r.item?.name ?? r.stats.itemId}</span>
      </span>
    ),
  },
  { key: 'depot', label: 'Depot', text: 'Depot', sort: (r) => r.depot?.name ?? r.stats.depotId, cell: (r) => r.depot?.name ?? r.stats.depotId },
  { key: 'vendor', label: 'Vendor', text: 'Vendor', sort: (r) => r.vendor?.name ?? '', cell: (r) => r.vendor?.name ?? '—' },
  { key: 'onHand', label: 'On hand', text: 'On hand', num: true, sort: (r) => r.stats.onHand, cell: (r) => fmtQty(r.stats.onHand) },
  {
    key: 'sales',
    label: <Term k="avgDailySales">Avg sales/day</Term>,
    text: 'Avg sales/day (28d)',
    num: true,
    sort: (r) => r.stats.avgDailySales,
    cell: (r) => r.stats.avgDailySales.toFixed(1),
  },
  {
    key: 'fc',
    label: <Term k="forecast">Avg forecast</Term>,
    text: 'Avg forecast (next 7d)',
    num: true,
    sort: (r) => r.stats.avgForecastNext,
    cell: (r) => r.stats.avgForecastNext.toFixed(1),
  },
  {
    key: 'ss',
    label: <Term k="safetyStock">SS</Term>,
    text: 'Safety stock',
    num: true,
    sort: (r) => r.stats.safetyStock ?? -1,
    cell: (r) => dash(r.stats.safetyStock),
  },
  {
    key: 'fill',
    label: <Term k="minimumFill">Min fill</Term>,
    text: 'Minimum fill',
    num: true,
    sort: (r) => r.stats.minimumFill,
    cell: (r) => fmtQty(r.stats.minimumFill),
  },
  {
    key: 'mop',
    label: <Term k="mop">MOP</Term>,
    text: 'MOP',
    num: true,
    sort: (r) => r.stats.mustOrderPoint ?? -1,
    cell: (r) => dash(r.stats.mustOrderPoint),
  },
  {
    key: 'dos',
    label: <Term k="daysOfSupply">DoS</Term>,
    text: 'Days of supply',
    num: true,
    sort: (r) => (Number.isFinite(r.stats.daysOfSupply) ? r.stats.daysOfSupply : Number.MAX_VALUE),
    cell: (r) => fmtDaysOfSupply(r.stats.daysOfSupply),
  },
  {
    key: 'sl',
    label: <Term k="serviceLevel">Service</Term>,
    text: 'Service level to date',
    num: true,
    sort: (r) => r.stats.serviceLevelToDate ?? 2,
    cell: (r) => fmtPct(r.stats.serviceLevelToDate),
  },
  {
    key: 'lt',
    label: <Term k="leadTime">LT</Term>,
    text: 'Lead time',
    num: true,
    sort: (r) => r.stats.leadTimeDays ?? -1,
    cell: (r) => dash(r.stats.leadTimeDays, (n) => `${n} d`),
  },
  {
    key: 'pack',
    label: <Term k="packSize">Pack</Term>,
    text: 'Pack size',
    num: true,
    sort: (r) => r.stats.packSize ?? -1,
    cell: (r) => dash(r.stats.packSize),
  },
  {
    key: 'cost',
    label: 'Unit cost',
    text: 'Unit cost',
    num: true,
    sort: (r) => r.stats.unitCost ?? -1,
    cell: (r) => dash(r.stats.unitCost, (n) => fmtSilver(n)),
  },
];

function useSorted<R>(rows: R[], columns: Column<R>[]) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const sorted = useMemo(() => {
    const col = sort && columns.find((c) => c.key === sort.key);
    if (!col || !sort) return rows;
    return [...rows].sort((a, b) => {
      const x = col.sort(a);
      const y = col.sort(b);
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * sort.dir;
    });
  }, [rows, columns, sort]);
  const toggle = (key: string) => setSort((s) => (s?.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }));
  return { sorted, sort, toggle };
}

function ItemLocationsTab() {
  const rows = useItemLocationRows();
  const planItem = useUiStore((s) => s.planItem);
  const { sorted, sort, toggle } = useSorted(rows, ITEM_COLUMNS);

  return (
    <>
      <p className="master-count" data-testid="master-item-count">
        {rows.length} active <Term k="itemLocation">item-locations</Term>
      </p>
      <div className="table-scroll">
        <table className="simple-table card-table master-table">
          <thead>
            <tr>
              {ITEM_COLUMNS.map((c) => (
                <th
                  key={c.key}
                  className={c.num ? 'num' : undefined}
                  aria-sort={sort?.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}
                >
                  <button type="button" className="sort-btn" onClick={() => toggle(c.key)}>
                    {c.label}
                    <span className="sort-arrow" aria-hidden>
                      {sort?.key === c.key ? (sort.dir === 1 ? '▲' : '▼') : '↕'}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr
                key={`${r.stats.itemId}@${r.stats.depotId}`}
                className="clickable"
                data-testid="master-item-row"
                tabIndex={0}
                onClick={() => planItem(r.stats.itemId, r.stats.depotId)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    planItem(r.stats.itemId, r.stats.depotId);
                  }
                }}
                title="Open in Item Planning"
              >
                {ITEM_COLUMNS.map((c) => (
                  <td key={c.key} className={c.num ? 'num' : c.key === 'item' ? 'cell-item' : undefined} data-label={c.text}>
                    {c.cell(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p className="empty">The rolls are being copied out. No item-locations yet.</p>}
    </>
  );
}

// ---------------------------------------------------------------- vendors

const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const scheduleValue = (s: OrderSchedule | undefined) => (!s ? 'default' : s.kind === 'daily' ? 'daily' : `w${s.weekday}`);

function parseSchedule(v: string): OrderSchedule | null {
  if (v === 'daily') return { kind: 'daily' };
  if (v.startsWith('w')) return { kind: 'weekly', weekday: Number(v.slice(1)) as Weekday };
  return null;
}

function VendorsTab() {
  const rows = useVendorRows();
  const { setVendorOrderDays } = useGameActions();
  const clearDrafts = useUiStore((s) => s.clearDrafts);

  return (
    <>
      <p className="muted small master-hint">
        Changing a vendor’s <Term k="orderDay">order days</Term> redraws today’s proposals and clears decisions already made.
        It also moves the <Term k="reviewPeriod">review period</Term>, so <Term k="safetyStock">safety stock</Term>,{' '}
        <Term k="mop">MOP</Term> and <Term k="d2">D2</Term> change with it.
      </p>
      <div className="table-scroll">
        <table className="simple-table card-table master-table">
          <thead>
            <tr>
              <th>Vendor</th>
              <th>
                <Term k="orderDay">Order days</Term>
              </th>
              <th className="num">
                <Term k="leadTime">LT</Term>
              </th>
              <th className="num">
                <Term k="vendorMin">Minimum</Term>
              </th>
              <th className="num">
                <Term k="orderTrigger">Trigger</Term>
              </th>
              <th className="num">Reliability</th>
              <th className="num">Items</th>
              <th className="num">Orders</th>
              <th className="num">Units</th>
              <th className="num">Spend</th>
              <th className="num">
                <Term k="onTimeRate">On time</Term>
              </th>
              <th className="num">
                <Term k="actualLeadTime">Actual / promised LT</Term>
              </th>
              <th className="num">Late</th>
              <th className="num">Open / overdue</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ stats: v, vendor }) => {
              const name = vendor?.name ?? v.vendorId;
              const min = v.minimum;
              return (
                <tr key={v.vendorId} data-testid="master-vendor-row">
                  <td className="cell-item">
                    <span className="item-cell">
                      <VendorTile id={v.vendorId} name={name} size={24} />
                      <span>{name}</span>
                    </span>
                  </td>
                  <td data-label="Order days" className="order-days-cell">
                    <div data-testid={`order-days-text-${v.vendorId}`}>
                      {fmtOrderDays(v.orderDays)}
                      {v.schedule && <span className="muted"> (default {fmtOrderDays(v.defaultOrderDays)})</span>}
                    </div>
                    <select
                      data-testid={`order-days-${v.vendorId}`}
                      aria-label={`Order days for ${name}`}
                      value={scheduleValue(v.schedule)}
                      onChange={(e) => {
                        setVendorOrderDays(v.vendorId, parseSchedule(e.target.value));
                        clearDrafts();
                      }}
                    >
                      <option value="default">Vendor default ({fmtOrderDays(v.defaultOrderDays)})</option>
                      <option value="daily">Every day</option>
                      {WEEKDAY_NAMES.map((d, i) => (
                        <option key={d} value={`w${i}`}>
                          Weekly on {d}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="num" data-label="Lead time">
                    {v.leadTimeDays} d
                  </td>
                  <td className="num" data-label="Minimum">
                    {!min ? '—' : min.kind === 'value' ? fmtSilver(min.amount) : `${fmtQty(min.amount)} units`}
                  </td>
                  <td className="num" data-label="Trigger">
                    {!min ? '—' : fmtPct(v.trigger)}
                    {min && v.customTrigger && <div className="your-schedule">yours</div>}
                  </td>
                  <td className="num" data-label="Reliability">
                    {fmtPct(v.reliability)}
                  </td>
                  <td className="num" data-label="Items supplied">
                    {v.itemsSupplied}
                  </td>
                  <td className="num" data-label="Orders" data-testid={`vendor-orders-${v.vendorId}`}>
                    {v.ordersPlaced}
                  </td>
                  <td className="num" data-label="Units">
                    {fmtQty(v.unitsOrdered)}
                  </td>
                  <td className="num" data-label="Spend">
                    {fmtSilver(v.spend)}
                  </td>
                  <td className="num" data-label="On time">
                    {fmtPct(v.onTimeRate)}
                  </td>
                  <td className="num" data-label="Actual / promised LT">
                    {v.avgLeadTimeActual === null ? '—' : v.avgLeadTimeActual.toFixed(1)} / {v.leadTimeDays} d
                  </td>
                  <td className="num" data-label="Late">
                    {v.late}
                    {v.avgDaysLate !== null && <div className="muted small">avg {v.avgDaysLate.toFixed(1)} d</div>}
                  </td>
                  <td className={`num ${v.overdueOpen > 0 ? 'bad-text' : ''}`} data-label="Open / overdue">
                    {v.openOrders} / {v.overdueOpen}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p className="empty">No merchants on the rolls yet.</p>}
    </>
  );
}
