import type {
  BattlePlan,
  Depot,
  DepotId,
  FiscalPeriod,
  Item,
  ItemId,
  ItemLocation,
  Scenario,
  SourcingRule,
  Vendor,
  VendorId,
} from '../engine/types';
import { BATTLE_PLANS_BY_ID } from './battlePlans';
import { DEPOTS } from './depots';
import { generateHistory, type DemandSpec } from './history';
import { ITEMS, ITEM_IDS } from './items';
import { SOURCING } from './sourcing';
import { DC_LANES, VENDORS } from './vendors';

/** Pre-campaign history length: 8 full weeks, so history[i] falls on weekday i % 7. */
const HISTORY_DAYS = 56;

/** Typical daily demand per item at a "standard" depot. */
export const BASE_DEMAND: Record<ItemId, DemandSpec> = {
  grain: { mean: 20, cv: 0.15, profile: 'flat' },
  hardtack: { mean: 8, cv: 0.2, profile: 'flat' },
  'salt-pork': { mean: 3, cv: 0.25, profile: 'flat' },
  ale: { mean: 10, cv: 0.25, profile: 'revel' },
  oats: { mean: 25, cv: 0.15, profile: 'flat' },
  arrows: { mean: 30, cv: 0.35, profile: 'drill' },
  bowstrings: { mean: 4, cv: 0.3, profile: 'drill' },
  bolts: { mean: 8, cv: 0.35, profile: 'drill' },
  horseshoes: { mean: 4, cv: 0.3, profile: 'workweek' },
  pitch: { mean: 2, cv: 0.5, profile: 'flat' },
  'siege-rope': { mean: 1, cv: 0.6, profile: 'flat' },
  bandages: { mean: 15, cv: 0.3, profile: 'flat' },
  poultices: { mean: 5, cv: 0.3, profile: 'flat' },
  'mail-rings': { mean: 0.5, cv: 0.6, profile: 'flat' },
};

/** Demand multiplier per depot; 0 / missing = item not stocked there. */
const DEPOT_MIX: Record<DepotId, Partial<Record<ItemId, number>>> = {
  'eastern-camp': {
    grain: 1, hardtack: 1, 'salt-pork': 1, ale: 1.2, oats: 1, arrows: 1, bowstrings: 1,
    bolts: 1, horseshoes: 1, bandages: 0.8, poultices: 0.8, 'mail-rings': 0.6,
  },
  harrowmere: {
    grain: 1.2, hardtack: 1.2, 'salt-pork': 1, ale: 0.8, oats: 0.6, arrows: 1.3, bowstrings: 1.2,
    bolts: 1.2, horseshoes: 0.5, pitch: 1, 'siege-rope': 1, bandages: 1.4, poultices: 1.4, 'mail-rings': 1.2,
  },
  'northern-pass': {
    grain: 0.6, hardtack: 0.8, 'salt-pork': 0.8, ale: 0.6, oats: 1.4, arrows: 0.4, bowstrings: 0.5,
    bolts: 0.5, horseshoes: 1.6, bandages: 0.5, poultices: 0.5, 'mail-rings': 1,
  },
};

const DEFAULT_SERVICE_LEVEL: Record<Item['criticality'], number> = { 5: 0.98, 4: 0.95, 3: 0.92, 2: 0.9, 1: 0.85 };

interface LineSpec {
  itemId: ItemId;
  depotId: DepotId;
  /** Overrides on BASE_DEMAND[itemId]. */
  demand?: Partial<DemandSpec>;
  /** Restrict this item's suppliers in this scenario. Default: every vendor in the scenario. */
  sources?: VendorId[];
  /** Opening stock in days of mean demand (capped at half the shelf life for perishables). */
  onHandDays: number;
  serviceLevel?: number;
  minimumFill?: number;
}

interface ScenarioSpec {
  id: string;
  title: string;
  briefing: string;
  teaches: string[];
  seed: number;
  lengthDays: number;
  periodLengthDays: number;
  /**
   * Period allowance as a multiple of expected spend: base demand plus the actual battle-plan surges,
   * averaged over the campaign, at the cheapest source. Rules.difficulty's budgetFactor applies on top.
   */
  allowanceFactor: number;
  vendorIds: VendorId[];
  lines: LineSpec[];
  battlePlanIds?: string[];
  morale?: number;
  /** Starting rank level (0–6); default rules.rank.startLevel. */
  rankLevel?: number;
  /** Warm-up days before takeover (multiple of 7); default rules.warmup.days. */
  warmupDays?: number;
  /** Route these items through a distribution centre to every front depot that has a lane in vendorIds. */
  dc?: DcSpec;
}

interface DcSpec {
  depotId: DepotId;
  items: ItemId[];
  /** DC opening stock and minimum fill, in days of the lane-served depots' combined mean demand. */
  onHandDays: number;
  minimumFillDays: number;
  /** Minimum fill at each lane-served front depot, in days of its own mean demand (a buffer against a late convoy). */
  frontMinimumFillDays: number;
  serviceLevel?: number;
}

function pick<T>(record: Record<string, T>, ids: string[]): Record<string, T> {
  return Object.fromEntries(ids.map((id) => {
    const v = record[id];
    if (!v) throw new Error(`content: unknown id "${id}"`);
    return [id, v];
  }));
}

/**
 * Sourcing rules for the scenario; re-normalises split shares over the vendors that remain.
 * With a DC: for each DC item, front depots served by a lane in the scenario buy from that lane
 * (transfer), while the DC (and any front depot without a lane) buys from the outside vendors.
 */
function scenarioSourcing(itemIds: ItemId[], vendorIds: VendorId[], lines: LineSpec[], dc?: DcSpec): SourcingRule[] {
  const out: SourcingRule[] = [];
  for (const itemId of itemIds) {
    const restrict = lines.find((l) => l.itemId === itemId && l.sources)?.sources;
    const rules = SOURCING.filter(
      (r) => r.itemId === itemId && vendorIds.includes(r.vendorId) && (!restrict || restrict.includes(r.vendorId)),
    );
    if (rules.length === 0) throw new Error(`content: no source for "${itemId}" in scenario`);

    let vendorScope: DepotId[] | undefined;
    if (dc?.items.includes(itemId)) {
      const fronts = [...new Set(lines.filter((l) => l.itemId === itemId).map((l) => l.depotId))];
      const lanes = DC_LANES.filter(
        (lane) => lane.dcDepotId === dc.depotId && vendorIds.includes(lane.vendorId) && fronts.includes(lane.frontDepotId),
      );
      const direct = fronts.filter((d) => !lanes.some((lane) => lane.frontDepotId === d));
      vendorScope = [dc.depotId, ...direct];
      for (const lane of lanes) {
        out.push({
          itemId,
          vendorId: lane.vendorId,
          // Valuation only: transfers cost nothing against the budget (silver is spent when the DC buys).
          unitCost: Math.min(...rules.map((r) => r.unitCost)),
          packSize: Math.min(...rules.map((r) => r.packSize)),
          priority: 1,
          depotIds: [lane.frontDepotId],
        });
      }
    }

    const shareTotal = rules.reduce((sum, r) => sum + (r.splitShare ?? 0), 0);
    for (const r of rules) {
      const { splitShare, ...rest } = r;
      const scoped = vendorScope ? { ...rest, depotIds: vendorScope } : rest;
      if (splitShare !== undefined && rules.length > 1 && shareTotal > 0) {
        out.push({ ...scoped, splitShare: splitShare / shareTotal });
      } else {
        out.push(scoped);
      }
    }
  }
  return out;
}

/** A treasurer's figure: two significant digits (83,240 → 83,000; 4,680 → 4,700; 840 → 840). */
function roundToTwoFigures(x: number): number {
  if (x <= 0) return 0;
  const step = 10 ** Math.max(0, Math.floor(Math.log10(x)) - 1);
  return Math.round(x / step) * step;
}

/** Fiscal periods; a final period cut short by the scenario end gets a pro-rated allowance. */
function buildPeriods(lengthDays: number, periodLengthDays: number, allowance: number): FiscalPeriod[] {
  const periods: FiscalPeriod[] = [];
  for (let start = 0, index = 0; start < lengthDays; start += periodLengthDays, index++) {
    const end = Math.min(start + periodLengthDays, lengthDays) - 1;
    const prorated = Math.round((allowance * (end - start + 1)) / periodLengthDays / 10) * 10;
    periods.push({ index, start, end, allowance: prorated, committed: 0 });
  }
  return periods;
}

function buildScenario(s: ScenarioSpec): Scenario {
  const itemIds = [...new Set(s.lines.map((l) => l.itemId))];
  const depotIds = [...new Set([...s.lines.map((l) => l.depotId), ...(s.dc ? [s.dc.depotId] : [])])];
  const items: Record<ItemId, Item> = pick(ITEMS, itemIds);
  const vendors: Record<VendorId, Vendor> = pick(VENDORS, s.vendorIds);
  const depots: Record<DepotId, Depot> = pick(DEPOTS, depotIds);
  const sourcing = scenarioSourcing(itemIds, s.vendorIds, s.lines, s.dc);

  const battlePlans: BattlePlan[] = (s.battlePlanIds ?? []).map((id) => {
    const p = BATTLE_PLANS_BY_ID[id];
    if (!p) throw new Error(`content: unknown battle plan "${id}"`);
    return p;
  });

  // Expected spend over the campaign: base demand plus the ACTUAL battle-plan surges (what a
  // well-judged quartermaster has to buy), at the cheapest source.
  let campaignSpend = 0;
  const locations: ItemLocation[] = s.lines.map((l) => {
    const spec: DemandSpec = { ...BASE_DEMAND[l.itemId], ...l.demand };
    const cheapest = Math.min(...sourcing.filter((r) => r.itemId === l.itemId).map((r) => r.unitCost));
    const surgeDays = battlePlans
      .filter((p) => p.depotIds.includes(l.depotId))
      .reduce((sum, p) => sum + ((p.actualUplift[l.itemId] ?? 1) - 1) * (Math.min(p.end, s.lengthDays - 1) - p.start + 1), 0);
    campaignSpend += spec.mean * cheapest * (s.lengthDays + surgeDays);
    return {
      itemId: l.itemId,
      depotId: l.depotId,
      onHand: Math.round(spec.mean * Math.min(l.onHandDays, (items[l.itemId].shelfLifeDays ?? Infinity) / 2)),
      serviceLevel: l.serviceLevel ?? DEFAULT_SERVICE_LEVEL[items[l.itemId].criticality],
      minimumFill:
        l.minimumFill ??
        (s.dc?.items.includes(l.itemId) && sourcing.some((r) => r.itemId === l.itemId && VENDORS[r.vendorId]?.dcDepotId && r.depotIds?.includes(l.depotId))
          ? Math.round(spec.mean * s.dc.frontMinimumFillDays)
          : 0),
      history: generateHistory(s.seed, l.itemId, l.depotId, spec, HISTORY_DAYS),
    };
  });

  // DC locations: no consumption of their own (demand = the depots' planned transfers), so no history.
  if (s.dc) {
    const dc = s.dc;
    for (const itemId of dc.items) {
      const served = s.lines.filter(
        (l) => l.itemId === itemId && sourcing.some((r) => r.itemId === itemId && VENDORS[r.vendorId]?.dcDepotId && r.depotIds?.includes(l.depotId)),
      );
      const mean = served.reduce((sum, l) => sum + (l.demand?.mean ?? BASE_DEMAND[itemId].mean), 0);
      locations.push({
        itemId,
        depotId: dc.depotId,
        onHand: Math.round(mean * dc.onHandDays),
        serviceLevel: dc.serviceLevel ?? 0.95,
        minimumFill: Math.round(mean * dc.minimumFillDays),
        history: [],
      });
    }
  }

  const periodAllowance = roundToTwoFigures((campaignSpend / s.lengthDays) * s.periodLengthDays * s.allowanceFactor);

  return {
    id: s.id,
    title: s.title,
    briefing: s.briefing,
    teaches: s.teaches,
    lengthDays: s.lengthDays,
    ...(s.warmupDays !== undefined ? { warmupDays: s.warmupDays } : {}),
    periodLengthDays: s.periodLengthDays,
    periodAllowance,
    initial: {
      seed: s.seed,
      items,
      vendors,
      depots,
      sourcing,
      locations,
      overrides: [],
      battlePlans,
      periods: buildPeriods(s.lengthDays, s.periodLengthDays, periodAllowance),
      morale: s.morale ?? 80,
      ...(s.rankLevel !== undefined ? { rankLevel: s.rankLevel } : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// Tutorial campaign — one RELEX concept per level, in order.
// ---------------------------------------------------------------------------

const tutorial: ScenarioSpec[] = [
  {
    id: 'tutorial-1',
    title: 'I. Linen for the Surgeons',
    briefing:
      'You are newly sworn as Quartermaster of the Eastern Camp. Your first charge is humble: ' +
      "keep the surgeons' tent in linen bandages. Brother Fennick's apothecary takes orders every " +
      'day but Sunday and delivers three days later. Your predecessor has kept the books for a week; ' +
      'from this Monday they are yours. Each morning the clerks draw up an ORDER PROPOSAL from the forecast. ' +
      'Accept it, change it, or reject it, then watch the PROJECTED STOCK line. Never let it touch zero.',
    teaches: ['forecast', 'projected stock', 'order proposal'],
    seed: 1101,
    lengthDays: 14,
    // A short hand-over: the previous quartermaster ran the camp for one week.
    warmupDays: 7,
    periodLengthDays: 28,
    allowanceFactor: 1.5,
    vendorIds: ['apothecary'],
    lines: [{ itemId: 'bandages', depotId: 'eastern-camp', demand: { mean: 20 }, onHandDays: 4 }],
  },
  {
    id: 'tutorial-2',
    title: 'II. Three Days on the Abbey Road',
    briefing:
      "Grain comes from St. Aldric's Abbey, but the brothers take orders only on Mondays and " +
      'Thursdays, and the carts need three days on the road. An order placed today arrives on D1. ' +
      'The NEXT chance to order arrives on D2. Whatever you order today must carry the camp all the ' +
      'way to D2, because nothing else can arrive before then.',
    teaches: ['lead time', 'order days', 'D1', 'D2', 'review period'],
    seed: 1202,
    lengthDays: 21,
    periodLengthDays: 28,
    allowanceFactor: 1.5,
    vendorIds: ['abbey-granary'],
    lines: [{ itemId: 'grain', depotId: 'eastern-camp', onHandDays: 5 }],
  },
  {
    id: 'tutorial-3',
    title: 'III. Fog of the Front',
    briefing:
      'At the Siege Lines of Harrowmere no two days are alike. Grain is steady; hardtack goes ' +
      'whenever the sorties go out. SAFETY STOCK covers forecast error over the lead time and review ' +
      'period, scaled by the SERVICE LEVEL you demand. The Marshal also insists three cartloads of ' +
      'grain (30 sacks) always stand at camp: a MINIMUM FILL. The MUST ORDER POINT is the LARGER of ' +
      'the two. For steady grain the Marshal\'s 30 sacks decide it; for volatile hardtack, safety ' +
      'stock does. If projected stock at D2 falls below the MOP, you must order.',
    teaches: ['forecast error', 'safety stock', 'service level', 'minimum fill', 'MOP = max(safety stock, minimum fill)'],
    seed: 1303,
    lengthDays: 28,
    periodLengthDays: 28,
    allowanceFactor: 1.2,
    vendorIds: ['abbey-granary'],
    lines: [
      { itemId: 'grain', depotId: 'harrowmere', demand: { cv: 0.12 }, onHandDays: 7, serviceLevel: 0.95, minimumFill: 30 },
      { itemId: 'hardtack', depotId: 'harrowmere', demand: { cv: 0.45 }, onHandDays: 7, serviceLevel: 0.95 },
    ],
  },
  {
    id: 'tutorial-4',
    title: 'IV. By the Barrel and the Cask',
    briefing:
      'Merchants do not sell by the single biscuit. Ale comes from the abbey twelve casks to the ' +
      'wagon, salt pork by the barge-lot of four barrels, hardtack five crates to the bundle. ' +
      'Orders are always rounded up to the PACK SIZE. That keeps you safe, but ale sours in ten ' +
      'days. Push orders up too far and you will be pouring vinegar into the ditch.',
    teaches: ['pack size', 'rounding', 'shelf life', 'spoilage', 'holding cost'],
    seed: 1404,
    lengthDays: 28,
    periodLengthDays: 28,
    allowanceFactor: 1.35,
    vendorIds: ['abbey-granary', 'river-merchants'],
    lines: [
      { itemId: 'ale', depotId: 'eastern-camp', sources: ['abbey-granary'], onHandDays: 5 },
      { itemId: 'salt-pork', depotId: 'eastern-camp', onHandDays: 6 },
      { itemId: 'hardtack', depotId: 'eastern-camp', onHandDays: 8 },
    ],
  },
  {
    id: 'tutorial-5',
    title: "V. The Guild's Terms",
    briefing:
      'The Guild of Fletchers will not ship fewer than 120 arrows-and-strings a week. Your Northern ' +
      'Pass garrison needs only about seventy. The Guild\'s ORDER TRIGGER is 50%: once your real ' +
      'must-order need reaches half the minimum, the clerks BUILD the order up to the minimum, one ' +
      'pack at a time of whichever item has the fewest days of cover at D2. You get a full order and ' +
      'carry the extra stock. You may still refuse it if the silver hurts.',
    teaches: ['vendor minimum', 'order trigger', 'order build-up', 'days of cover'],
    seed: 1505,
    lengthDays: 28,
    periodLengthDays: 28,
    allowanceFactor: 1.6,
    vendorIds: ['guild-fletchers'],
    lines: [
      { itemId: 'arrows', depotId: 'northern-pass', demand: { mean: 8 }, onHandDays: 9 },
      { itemId: 'bowstrings', depotId: 'northern-pass', demand: { mean: 2 }, onHandDays: 12 },
    ],
  },
  {
    id: 'tutorial-6',
    title: "VI. The Smith Won't Climb for Less",
    briefing:
      'The Ironhollow smith wants 250 silver of work before his mules climb to the pass, and his ' +
      'ORDER TRIGGER stands at 80%. A garrison\'s weekly need for shoes and mail rings comes to ' +
      'about half of that, so NO PROPOSAL APPEARS. The need is real, but it is below the ' +
      'trigger. Watch the smithy\'s need-to-minimum ratio on the Proposals screen. Lower the trigger ' +
      'to let a smaller need build into a full order, or let the shortfall grow and pay for it in ' +
      'lame horses. The smith takes a week to deliver, so do not wait long.',
    teaches: ['order trigger', 'below-trigger (no proposal)', 'adjusting the trigger', 'lead time risk'],
    seed: 1606,
    lengthDays: 28,
    // No warm-up: a predecessor on the default 0.8 trigger would never order, so the garrison would
    // be out of shoes by takeover. The player arrives with stock in hand and time to act.
    warmupDays: 0,
    periodLengthDays: 28,
    allowanceFactor: 1.3,
    vendorIds: ['mountain-smithy'],
    lines: [
      { itemId: 'horseshoes', depotId: 'northern-pass', demand: { mean: 2 }, onHandDays: 12 },
      { itemId: 'mail-rings', depotId: 'northern-pass', demand: { mean: 0.25 }, onHandDays: 16 },
    ],
  },
  {
    id: 'tutorial-7',
    title: 'VII. Two Roads to the Granary',
    briefing:
      'Rely on one supplier and one flood will starve you. Grain now comes first from the abbey, ' +
      'and from the Silverwash barges when the abbey cannot. The horses are fed by both: three ' +
      "parts abbey oats to two parts river oats. Arrows come from the Guild, or, dearer and in " +
      "lots of fifty, from the Royal Armory. Watch for late barges: the river is fast but fickle.",
    teaches: ['multi-sourcing', 'source priority', 'split sourcing', 'vendor reliability'],
    seed: 1707,
    lengthDays: 35,
    periodLengthDays: 28,
    allowanceFactor: 1.6,
    vendorIds: ['abbey-granary', 'river-merchants', 'guild-fletchers', 'royal-armory'],
    lines: [
      { itemId: 'grain', depotId: 'eastern-camp', onHandDays: 6 },
      { itemId: 'oats', depotId: 'eastern-camp', onHandDays: 6 },
      { itemId: 'arrows', depotId: 'eastern-camp', onHandDays: 9 },
    ],
  },
  {
    id: 'tutorial-8',
    title: "VIII. The Earl's Levies",
    briefing:
      "A letter: the Earl of Fennmarch's levies join the Eastern Camp on day 14 and stay to the end. " +
      'It gives no figures, so the system FORECAST cannot know, and it will keep proposing for ' +
      'yesterday\'s army. Ask how many are coming (nearly twice the mouths, and twice the thirst), then ' +
      'enter a FORECAST OVERRIDE: a daily figure, or a total over the days, broken out in proportion ' +
      'to the baseline. An override IS the forecast, and orders follow it, until you delete it. ' +
      'Remember the lead time: the first carts must leave before the levies arrive.',
    teaches: ['forecast override', 'aggregate override', 'override replaces forecast', 'forecast accuracy (SWAPE, bias)'],
    seed: 1808,
    lengthDays: 35,
    periodLengthDays: 35,
    allowanceFactor: 1.35,
    vendorIds: ['abbey-granary', 'river-merchants', 'apothecary'],
    lines: [
      { itemId: 'grain', depotId: 'eastern-camp', onHandDays: 6 },
      { itemId: 'ale', depotId: 'eastern-camp', sources: ['abbey-granary'], onHandDays: 4 },
      { itemId: 'bandages', depotId: 'eastern-camp', onHandDays: 4 },
    ],
    battlePlanIds: ['levies-arrive'],
  },
  {
    id: 'tutorial-9',
    title: 'IX. Letters from the Marshal',
    briefing:
      'Two depots, one treasury, and a war that will not wait. Sealed letters will announce ' +
      'BATTLE PLANS (assaults, musters, feasts), each promising so many times the usual demand. ' +
      'Some generals are honest; some are not. Decide how much of each stated uplift to trust, build ' +
      'stock before the event, and keep spending within each FISCAL PERIOD\'s allowance. Supply the ' +
      'army through a battle and it wins; starve it and it loses, and so do you. Overspend and the ' +
      'Treasury writes letters of reprimand. Enough of them cost you your rank.',
    teaches: ['battle plans (promotions)', 'event uplift', 'trusting the letter', 'budget', 'fiscal period', 'rank'],
    seed: 1909,
    lengthDays: 56,
    periodLengthDays: 28,
    allowanceFactor: 1.35,
    vendorIds: ['abbey-granary', 'river-merchants', 'guild-fletchers', 'royal-armory', 'apothecary'],
    lines: [
      // Guild only: level VII already taught fallback sourcing; here the budget is about the letters.
      { itemId: 'arrows', depotId: 'harrowmere', sources: ['guild-fletchers'], onHandDays: 9 },
      { itemId: 'pitch', depotId: 'harrowmere', onHandDays: 8 },
      { itemId: 'siege-rope', depotId: 'harrowmere', onHandDays: 12 },
      { itemId: 'bandages', depotId: 'harrowmere', onHandDays: 4, minimumFill: 20 },
      { itemId: 'grain', depotId: 'harrowmere', onHandDays: 6 },
      { itemId: 'grain', depotId: 'eastern-camp', onHandDays: 6 },
      { itemId: 'ale', depotId: 'eastern-camp', onHandDays: 4 },
    ],
    battlePlanIds: ['harrowmere-assault', 'feast-muster'],
  },
  {
    id: 'tutorial-10',
    title: 'X. The Royal Depot at Kingsreach',
    briefing:
      'The Crown has opened a DISTRIBUTION CENTRE at Kingsreach. The abbey and the Guild now deliver ' +
      'in bulk to the Royal Depot, and your camps draw from it by TRANSFER ORDER: wagons to the Eastern ' +
      'Camp six days a week (one day on the road), convoys to Harrowmere three times a week (two days). ' +
      'Transfers cost the Treasury nothing; the silver is spent when the depot buys. The depot eats ' +
      "nothing itself. Its forecast is the camps' planned transfers: DEPENDENT DEMAND. Keep a reserve " +
      'at Kingsreach. Stock there is half as dear to hold, and one pooled stockpile covers both camps\' ' +
      'bad days, so the front can run leaner. Ordering for two camps also clears the Guild\'s ' +
      'minimum easily. Bandages still come straight from the apothecary.',
    teaches: ['distribution centre', 'transfer orders', 'dependent demand', 'carrying stock at the DC'],
    seed: 2010,
    lengthDays: 42,
    periodLengthDays: 28,
    allowanceFactor: 1.5,
    vendorIds: ['abbey-granary', 'guild-fletchers', 'apothecary', 'lane-kingsreach-east', 'lane-kingsreach-harrowmere'],
    lines: [
      { itemId: 'grain', depotId: 'eastern-camp', onHandDays: 4 },
      { itemId: 'grain', depotId: 'harrowmere', onHandDays: 5 },
      { itemId: 'hardtack', depotId: 'eastern-camp', onHandDays: 4 },
      { itemId: 'hardtack', depotId: 'harrowmere', onHandDays: 5 },
      { itemId: 'arrows', depotId: 'eastern-camp', onHandDays: 4 },
      { itemId: 'arrows', depotId: 'harrowmere', onHandDays: 5 },
      { itemId: 'bandages', depotId: 'harrowmere', onHandDays: 5 },
    ],
    dc: { depotId: 'kingsreach-dc', items: ['grain', 'hardtack', 'arrows'], onHandDays: 8, minimumFillDays: 3, frontMinimumFillDays: 2 },
  },
];

// ---------------------------------------------------------------------------
// Sandbox — every item, vendor, depot and letter; a long campaign to play freely.
// ---------------------------------------------------------------------------

const sandboxLines: LineSpec[] = Object.entries(DEPOT_MIX).flatMap(([depotId, mix]) =>
  ITEM_IDS.filter((itemId) => (mix[itemId] ?? 0) > 0).map((itemId) => ({
    itemId,
    depotId,
    demand: { mean: BASE_DEMAND[itemId].mean * (mix[itemId] ?? 0) },
    onHandDays: 10,
  })),
);

const sandbox: ScenarioSpec = {
  id: 'sandbox',
  title: 'The Long Campaign (Sandbox)',
  briefing:
    'Three depots, a royal distribution centre, six suppliers, fourteen supplies and a season of war. Every rule is in play. ' +
    'Keep the front fed and armed for sixteen weeks without emptying the treasury.',
  teaches: ['everything'],
  seed: 9001,
  lengthDays: 112,
  periodLengthDays: 28,
  allowanceFactor: 1.25,
  vendorIds: Object.keys(VENDORS),
  lines: sandboxLines,
  battlePlanIds: ['harrowmere-assault', 'feast-muster', 'winter-crossing', 'ford-feint'],
  // Staples flow through Kingsreach to the Eastern Camp and Harrowmere. The Northern Pass, and
  // everything perishable, medical or for the siege train, still goes direct to the front.
  dc: { depotId: 'kingsreach-dc', items: ['grain', 'hardtack', 'salt-pork', 'oats', 'arrows'], onHandDays: 7, minimumFillDays: 5, frontMinimumFillDays: 2 },
};

export const TUTORIAL_SCENARIOS: Scenario[] = tutorial.map(buildScenario);
export const SANDBOX_SCENARIO: Scenario = buildScenario(sandbox);
