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
import { VENDORS } from './vendors';

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
  presentationStock?: number;
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
   * Period allowance as a multiple of expected base spend (no battle-plan uplift). Tuned so an
   * accept-all player uses ~60–80% of it in levels I–VI and runs slightly over in level VII.
   */
  allowanceFactor: number;
  vendorIds: VendorId[];
  lines: LineSpec[];
  battlePlanIds?: string[];
  morale?: number;
}

function pick<T>(record: Record<string, T>, ids: string[]): Record<string, T> {
  return Object.fromEntries(ids.map((id) => {
    const v = record[id];
    if (!v) throw new Error(`content: unknown id "${id}"`);
    return [id, v];
  }));
}

/** Sourcing rules for the scenario; re-normalises split shares over the vendors that remain. */
function scenarioSourcing(itemIds: ItemId[], vendorIds: VendorId[], lines: LineSpec[]): SourcingRule[] {
  const out: SourcingRule[] = [];
  for (const itemId of itemIds) {
    const restrict = lines.find((l) => l.itemId === itemId && l.sources)?.sources;
    const rules = SOURCING.filter(
      (r) => r.itemId === itemId && vendorIds.includes(r.vendorId) && (!restrict || restrict.includes(r.vendorId)),
    );
    if (rules.length === 0) throw new Error(`content: no source for "${itemId}" in scenario`);
    const shareTotal = rules.reduce((s, r) => s + (r.splitShare ?? 0), 0);
    for (const r of rules) {
      const { splitShare, ...rest } = r;
      if (splitShare !== undefined && rules.length > 1 && shareTotal > 0) {
        out.push({ ...rest, splitShare: splitShare / shareTotal });
      } else {
        out.push(rest);
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
  const depotIds = [...new Set(s.lines.map((l) => l.depotId))];
  const items: Record<ItemId, Item> = pick(ITEMS, itemIds);
  const vendors: Record<VendorId, Vendor> = pick(VENDORS, s.vendorIds);
  const depots: Record<DepotId, Depot> = pick(DEPOTS, depotIds);
  const sourcing = scenarioSourcing(itemIds, s.vendorIds, s.lines);

  let dailySpend = 0;
  const locations: ItemLocation[] = s.lines.map((l) => {
    const spec: DemandSpec = { ...BASE_DEMAND[l.itemId], ...l.demand };
    const cheapest = Math.min(...sourcing.filter((r) => r.itemId === l.itemId).map((r) => r.unitCost));
    dailySpend += spec.mean * cheapest;
    return {
      itemId: l.itemId,
      depotId: l.depotId,
      onHand: Math.round(spec.mean * Math.min(l.onHandDays, (items[l.itemId].shelfLifeDays ?? Infinity) / 2)),
      serviceLevel: l.serviceLevel ?? DEFAULT_SERVICE_LEVEL[items[l.itemId].criticality],
      presentationStock: l.presentationStock ?? 0,
      history: generateHistory(s.seed, l.itemId, l.depotId, spec, HISTORY_DAYS),
    };
  });

  const periodAllowance = roundToTwoFigures(dailySpend * s.periodLengthDays * s.allowanceFactor);
  const battlePlans: BattlePlan[] = (s.battlePlanIds ?? []).map((id) => {
    const p = BATTLE_PLANS_BY_ID[id];
    if (!p) throw new Error(`content: unknown battle plan "${id}"`);
    return p;
  });

  return {
    id: s.id,
    title: s.title,
    briefing: s.briefing,
    teaches: s.teaches,
    lengthDays: s.lengthDays,
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
      "keep the surgeons' tent in linen bandages. Brother Fennick's apothecary delivers the day " +
      'after you order. Each morning the clerks draw up an ORDER PROPOSAL from the forecast — ' +
      'accept it, change it, or reject it, then watch the PROJECTED STOCK line. Never let it touch zero.',
    teaches: ['forecast', 'projected stock', 'order proposal'],
    seed: 1101,
    lengthDays: 14,
    periodLengthDays: 28,
    allowanceFactor: 1.5,
    vendorIds: ['apothecary'],
    lines: [{ itemId: 'bandages', depotId: 'eastern-camp', demand: { mean: 20 }, onHandDays: 4 }],
  },
  {
    id: 'tutorial-2',
    title: 'II. Three Days on the Abbey Road',
    briefing:
      "Grain comes from St. Aldric's Abbey — but the brothers take orders only on Mondays and " +
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
      'whenever the sorties go out. Holding nothing beyond the forecast is a gamble. SAFETY STOCK ' +
      'covers forecast error over the lead time and review period, scaled by the SERVICE LEVEL you ' +
      'demand. The Marshal also insists a cartload of grain always stands at camp (PRESENTATION ' +
      'STOCK). Together they make the MUST ORDER POINT: if projected stock at D2 falls below the ' +
      'MOP, you must order.',
    teaches: ['forecast error', 'safety stock', 'service level', 'presentation stock', 'MOP'],
    seed: 1303,
    lengthDays: 28,
    periodLengthDays: 28,
    allowanceFactor: 1.1,
    vendorIds: ['abbey-granary'],
    lines: [
      { itemId: 'grain', depotId: 'harrowmere', demand: { cv: 0.12 }, onHandDays: 7, serviceLevel: 0.98, presentationStock: 20 },
      { itemId: 'hardtack', depotId: 'harrowmere', demand: { cv: 0.45 }, onHandDays: 7, serviceLevel: 0.9 },
    ],
  },
  {
    id: 'tutorial-4',
    title: 'IV. By the Barrel and the Cask',
    briefing:
      'Merchants do not sell by the single biscuit. Ale comes from the abbey twelve casks to the ' +
      'wagon; salt pork by the barge-lot of four barrels; hardtack five crates to the bundle. ' +
      'Orders are rounded up to the PACK SIZE — which keeps you safe, but ale sours in ten days. ' +
      'Round up too far and you will be pouring vinegar into the ditch.',
    teaches: ['pack size', 'rounding', 'shelf life', 'spoilage', 'holding cost'],
    seed: 1404,
    lengthDays: 28,
    periodLengthDays: 28,
    allowanceFactor: 1.15,
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
      'The Northern Pass garrison is small, and so are its orders — too small for the Guild of ' +
      'Fletchers, who will not ship fewer than 120 units, and for the Ironhollow smith, who wants ' +
      '250 silver before he loads his mules. When a must-order falls short of a VENDOR MINIMUM, ' +
      'the clerks pull forward items that sit between MOP and the CAN ORDER POINT, lowest days ' +
      'of cover first. If that still falls short, the choice is yours: pay up, wait, or refuse.',
    teaches: ['vendor minimum', 'can order point (COP)', 'must vs can', 'days of cover'],
    seed: 1505,
    lengthDays: 28,
    periodLengthDays: 28,
    allowanceFactor: 1.1,
    vendorIds: ['guild-fletchers', 'mountain-smithy'],
    lines: [
      { itemId: 'arrows', depotId: 'northern-pass', demand: { mean: 8 }, onHandDays: 9 },
      { itemId: 'bowstrings', depotId: 'northern-pass', demand: { mean: 2 }, onHandDays: 12 },
      { itemId: 'horseshoes', depotId: 'northern-pass', demand: { mean: 3 }, onHandDays: 10 },
      { itemId: 'mail-rings', depotId: 'northern-pass', demand: { mean: 0.3 }, onHandDays: 20 },
    ],
  },
  {
    id: 'tutorial-6',
    title: 'VI. Two Roads to the Granary',
    briefing:
      'Rely on one supplier and one flood will starve you. Grain now comes first from the abbey, ' +
      'and from the Silverwash barges when the abbey cannot. The horses are fed by both: three ' +
      "parts abbey oats to two parts river oats. Arrows come from the Guild, or — dearer, and in " +
      "lots of fifty — from the Royal Armory. Watch for late barges: the river is fast but fickle.",
    teaches: ['multi-sourcing', 'source priority', 'split sourcing', 'vendor reliability'],
    seed: 1606,
    lengthDays: 35,
    periodLengthDays: 28,
    allowanceFactor: 1.3,
    vendorIds: ['abbey-granary', 'river-merchants', 'guild-fletchers', 'royal-armory'],
    lines: [
      { itemId: 'grain', depotId: 'eastern-camp', onHandDays: 6 },
      { itemId: 'oats', depotId: 'eastern-camp', onHandDays: 6 },
      { itemId: 'arrows', depotId: 'eastern-camp', onHandDays: 9 },
    ],
  },
  {
    id: 'tutorial-7',
    title: "VII. Letters from the Marshal",
    briefing:
      'Two depots, one treasury, and a war that will not wait. Sealed letters will arrive ' +
      'announcing BATTLE PLANS — assaults, musters, feasts — each promising so many times the ' +
      'usual demand. Some generals are honest; some are not. Decide how much of the stated uplift ' +
      'to trust, build stock ahead of the event, and keep spending inside each FISCAL PERIOD\'s ' +
      'allowance. Overspend and the next allowance is cut — and the men notice.',
    teaches: ['battle plans (promotions)', 'event uplift', 'forecast override', 'forecast accuracy', 'budget', 'fiscal period'],
    seed: 1707,
    lengthDays: 56,
    periodLengthDays: 28,
    allowanceFactor: 1.1,
    vendorIds: ['abbey-granary', 'river-merchants', 'guild-fletchers', 'royal-armory', 'apothecary'],
    lines: [
      // Guild only: level VI already taught fallback sourcing; here the budget is about the letters.
      { itemId: 'arrows', depotId: 'harrowmere', sources: ['guild-fletchers'], onHandDays: 9 },
      { itemId: 'pitch', depotId: 'harrowmere', onHandDays: 8 },
      { itemId: 'siege-rope', depotId: 'harrowmere', onHandDays: 12 },
      { itemId: 'bandages', depotId: 'harrowmere', onHandDays: 4 },
      { itemId: 'grain', depotId: 'harrowmere', onHandDays: 6 },
      { itemId: 'grain', depotId: 'eastern-camp', onHandDays: 6 },
      { itemId: 'ale', depotId: 'eastern-camp', onHandDays: 4 },
    ],
    battlePlanIds: ['harrowmere-assault', 'feast-muster'],
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
    'Three depots, six suppliers, fourteen supplies and a season of war. Every rule is in play. ' +
    'Keep the front fed and armed for sixteen weeks without emptying the treasury.',
  teaches: ['everything'],
  seed: 9001,
  lengthDays: 112,
  periodLengthDays: 28,
  allowanceFactor: 1.35,
  vendorIds: Object.keys(VENDORS),
  lines: sandboxLines,
  battlePlanIds: ['harrowmere-assault', 'feast-muster', 'winter-crossing', 'ford-feint'],
};

export const TUTORIAL_SCENARIOS: Scenario[] = tutorial.map(buildScenario);
export const SANDBOX_SCENARIO: Scenario = buildScenario(sandbox);
