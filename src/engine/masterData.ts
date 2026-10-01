// Master Data screen: per item-location and per vendor master data plus derived figures.
import { effectiveOrderDays, effectiveVendor, nextOrderDayFrom, reviewPeriodDays } from './calendar';
import { forecastLocation } from './forecast';
import { daysOfSupply } from './kpi';
import { planningDetail } from './replenishment';
import { rules as defaultRules, type Rules } from './rules.config';
import { promisedOn } from './tick';
import type { GameState, ItemLocation, ItemLocationStats, VendorStats } from './types';
import { effectiveTrigger } from './vendorMin';

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
const mean = (xs: readonly number[]) => (xs.length === 0 ? 0 : sum(xs) / xs.length);
const meanOrNull = (xs: readonly number[]) => (xs.length === 0 ? null : sum(xs) / xs.length);

/** Last n entries; n ≤ 0 → [] (slice(-0) would return everything). */
const tail = (xs: readonly number[], n: number) => (n <= 0 ? [] : xs.slice(-n));

/** Campaign-to-date demand and fulfilment. A location without fulfilled[] (older save) counts as fully served. */
function campaignToDate(loc: ItemLocation, today: number): { demand: number; fulfilled: number } {
  const demand = tail(loc.history, Math.min(today, loc.history.length));
  const fulfilled = loc.fulfilled ? tail(loc.fulfilled, demand.length) : demand;
  return { demand: sum(demand), fulfilled: sum(fulfilled) };
}

/** One row per GameState.locations entry, same order. */
export function itemLocationStats(state: GameState, r: Rules = defaultRules): ItemLocationStats[] {
  const fw = Math.max(1, r.masterData.forecastWindowDays);
  return state.locations.map((loc) => {
    const detail = planningDetail(state, loc, r);
    const vendor = detail && effectiveVendor(state, detail.vendorId);
    const { demand, fulfilled } = campaignToDate(loc, state.today);
    return {
      itemId: loc.itemId,
      depotId: loc.depotId,
      vendorId: detail?.vendorId,
      onHand: loc.onHand,
      avgDailySales: mean(tail(loc.history, r.masterData.salesWindowDays)),
      avgForecastNext: mean(forecastLocation(state, loc, state.today, state.today + fw - 1, r).map((p) => p.total)),
      safetyStock: detail?.safetyStock,
      minimumFill: loc.minimumFill,
      mustOrderPoint: detail?.mustOrderPoint,
      orderDay: detail?.orderDay,
      reviewPeriodDays: detail && vendor ? reviewPeriodDays(vendor, detail.orderDay) : undefined,
      leadTimeDays: vendor?.leadTimeDays,
      packSize: detail?.rule.packSize,
      unitCost: detail?.rule.unitCost,
      daysOfSupply: daysOfSupply(state, loc, r),
      campaignDemand: demand,
      campaignFulfilled: fulfilled,
      serviceLevelToDate: demand > 0 ? fulfilled / demand : null,
    };
  });
}

/**
 * One row per vendor. Performance (orders, deliveries, open orders) counts campaign orders
 * only (orderedOn ≥ 0): a scenario's opening orders are excluded.
 */
export function vendorStats(state: GameState, r: Rules = defaultRules): VendorStats[] {
  return Object.values(state.vendors).map((vendor) => {
    const id = vendor.id;
    const delivered = (state.deliveries ?? []).filter((d) => d.vendorId === id && d.orderedOn >= 0);
    const open = state.openOrders.filter((o) => o.vendorId === id && o.orderedOn >= 0);
    const late = delivered.filter((d) => d.receivedOn > d.promisedOn);
    const effective = effectiveVendor(state, id);
    const schedule = state.vendorOrderDays?.[id];
    return {
      vendorId: id,
      defaultOrderDays: vendor.orderDays,
      orderDays: effectiveOrderDays(state, id),
      ...(schedule ? { schedule } : {}),
      nextOrderDay: effective ? nextOrderDayFrom(effective, state.today) : undefined,
      leadTimeDays: vendor.leadTimeDays,
      reliability: vendor.reliability,
      ...(vendor.minimum ? { minimum: vendor.minimum } : {}),
      trigger: effectiveTrigger(state, id, r),
      customTrigger: state.vendorTriggers?.[id] !== undefined,
      itemsSupplied: new Set(state.sourcing.filter((s) => s.vendorId === id).map((s) => s.itemId)).size,
      ...(vendor.dcDepotId !== undefined ? { dcDepotId: vendor.dcDepotId } : {}),
      ordersPlaced: delivered.length + open.length,
      unitsOrdered: sum([...delivered, ...open].map((o) => o.qty)),
      spend: sum([...delivered, ...open].map((o) => o.cost)),
      delivered: delivered.length,
      onTime: delivered.length - late.length,
      late: late.length,
      onTimeRate: delivered.length === 0 ? null : (delivered.length - late.length) / delivered.length,
      avgLeadTimeActual: meanOrNull(delivered.map((d) => d.receivedOn - d.orderedOn)),
      avgDaysLate: meanOrNull(late.map((d) => d.receivedOn - d.promisedOn)),
      openOrders: open.length,
      openUnits: sum(open.map((o) => o.qty)),
      openValue: sum(open.map((o) => o.cost)),
      overdueOpen: open.filter((o) => promisedOn(o, state) < state.today).length,
    };
  });
}
