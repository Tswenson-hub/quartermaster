// Shared engine contract. Owned by the lead agent — other agents propose changes, they don't edit.
// Pure data types only: no React, no DOM, no runtime imports.

/** Simulation day index. Day 0 = campaign start. 0 = Monday by convention. */
export type Day = number;
/** 0 = Monday … 6 = Sunday */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type ItemId = string;
export type VendorId = string;
export type DepotId = string;
export type BattlePlanId = string;

export type ItemCategory =
  | 'rations'
  | 'fodder'
  | 'munitions'
  | 'arms'
  | 'armor'
  | 'medical'
  | 'siege'
  | 'tools';

export interface Item {
  id: ItemId;
  name: string;
  category: ItemCategory;
  /** Key into the sprite manifest (public/assets/manifest.json). */
  icon: string;
  unit: string; // "sack", "sheaf", "barrel"
  /** Days until spoilage; undefined = non-perishable. */
  shelfLifeDays?: number;
  /** Holding cost per unit per day, in silver. */
  holdingCost: number;
  /** Narrative weight: how badly a stockout hurts the front (1–5). */
  criticality: 1 | 2 | 3 | 4 | 5;
}

export interface Vendor {
  id: VendorId;
  name: string;
  /** Weekdays on which an order may be placed with this vendor. */
  orderDays: Weekday[];
  /** Days from order to delivery at the depot. */
  leadTimeDays: number;
  /** Vendor minimum order, if any (RELEX_RULES §4, §6). */
  minimum?: { kind: 'value' | 'units'; amount: number };
  /**
   * Set when this "vendor" is an internal distribution centre (a transfer lane), not an outside supplier.
   * Orders against it are transfers: they ship from that DC's on-hand (short-ship if it lacks stock),
   * cost nothing against the budget (transfer OpenOrders and proposals have cost 0, so they never count in
   * spend, DailyKpi.spend, FiscalPeriod.committed or DecisionPreview.spend), and have no minimum.
   * orderDays/leadTimeDays describe the lane. A lane SourcingRule's unitCost is a valuation only.
   */
  dcDepotId?: DepotId;
  /**
   * Default order trigger for a vendor with a minimum: the fraction (0–1+) of the minimum that the real
   * need must reach before the system builds the order up to the minimum. Below it, no proposal is made
   * for this vendor. Falls back to rules.vendorMinimum.defaultTrigger. The player can override it per
   * vendor (GameState.vendorTriggers).
   */
  orderTrigger?: number;
  /** Probability (0–1) a delivery arrives on time and in full. 1 = never fails. */
  reliability: number;
}

/** One item as supplied by one vendor. An item may have several (multi-sourcing). */
export interface SourcingRule {
  itemId: ItemId;
  vendorId: VendorId;
  unitCost: number;
  /** Order quantity must be a multiple of this. */
  packSize: number;
  /** Lower number = preferred source. */
  priority: number;
  /** Optional fixed share of volume for split sourcing (0–1). Shares per item sum to 1. */
  splitShare?: number;
  /**
   * Locations this rule applies to; absent = every location of the item. Lets front depots source an
   * item from a DC while the DC itself sources it from vendors.
   */
  depotIds?: DepotId[];
}

export interface Depot {
  id: DepotId;
  name: string; // "Eastern Camp", "Siege Lines at Harrowmere"
  /**
   * 'front' (default): consumes stock (actual demand). 'dc': distribution centre with no consumption of its
   * own; it buys from vendors and supplies front depots by transfer. Its demand is the depots' planned
   * transfer orders (dependent demand).
   */
  kind?: 'front' | 'dc';
}

/** Planning parameters for one item at one depot. */
export interface ItemLocation {
  itemId: ItemId;
  depotId: DepotId;
  onHand: number;
  /** Target service level 0–1 used by safety-stock rule. */
  serviceLevel: number;
  /**
   * Player-defined minimum fill (units), e.g. "always keep 1 cart at camp".
   * RELEX_RULES §3: MOP = max(safety stock from forecast-error variance, minimumFill).
   */
  minimumFill: number;
  /**
   * FIFO stock lots, oldest first, for spoilage. When present, sum of qty = onHand.
   * Optional: when absent the engine treats all stock as received today.
   */
  lots?: { qty: number; receivedOn: Day }[];
  /**
   * Units fulfilled each campaign day, oldest first: fulfilled[d] is day d. Parallel to the campaign
   * part of `history`. tick appends; absent until the first tick. Used for per-depot battle outcomes.
   */
  fulfilled?: number[];
  /**
   * Actual daily demand, oldest first; the last entry is always yesterday (today − 1).
   * Scenarios seed it with pre-campaign history; tick() appends each day's actual demand.
   * So the demand on day d is history[history.length - (today - d)].
   */
  history: number[];
}

/**
 * Player forecast override (RELEX_RULES §8). On its days an override IS the forecast: it replaces
 * baseline + battle-plan uplift until the player deletes it.
 * - 'absolute': `value` is the daily quantity on every day from..to (one day when from === to).
 * - 'aggregate': `value` is the TOTAL over from..to, broken out across the days in proportion to the
 *   baseline forecast (flat if the baseline is all zero).
 * - 'factor': `value` multiplies baseline + uplift (kept for compatibility).
 * Overlapping overrides: later entries in GameState.overrides win, day by day.
 */
export type ForecastOverride = {
  itemId: ItemId;
  depotId: DepotId;
  from: Day;
  to: Day;
  mode: 'absolute' | 'aggregate' | 'factor';
  value: number;
};

/** "Military letter" — a promotion/event equivalent. */
export interface BattlePlan {
  id: BattlePlanId;
  title: string;
  letter: string; // flavor text from the general
  /** Day the letter is delivered to the player. */
  announcedOn: Day;
  start: Day;
  end: Day;
  depotIds: DepotId[];
  /** Uplift factor stated in the letter, per item. */
  statedUplift: Record<ItemId, number>;
  /** Service level to its depots over the window needed to win this battle; default rules.rank.battleWinServiceLevel. */
  winServiceLevel?: number;
  /** Uplift that actually happens (hidden). Fog of war. */
  actualUplift: Record<ItemId, number>;
}

export interface ForecastPoint {
  day: Day;
  baseline: number;
  eventUplift: number;
  override?: number;
  /** Final forecast used for projection. */
  total: number;
}

export interface OpenOrder {
  id: string;
  itemId: ItemId;
  depotId: DepotId;
  vendorId: VendorId;
  qty: number;
  orderedOn: Day;
  /** Current expected arrival; moves later if the delivery is late. */
  deliveryOn: Day;
  cost: number;
  /** Due date when placed, before any delay. Absent (legacy/fixtures) = orderedOn + vendor lead time. */
  promisedOn?: Day;
}

/** A received order, kept for vendor performance. tick appends one per receipt. */
export interface DeliveryRecord {
  orderId: string;
  itemId: ItemId;
  depotId: DepotId;
  vendorId: VendorId;
  qty: number;
  cost: number;
  orderedOn: Day;
  promisedOn: Day;
  /** Late when receivedOn > promisedOn. */
  receivedOn: Day;
}

/**
 * Player override of a vendor's order calendar (per vendor). Absent = Vendor.orderDays.
 * Changing it changes the review period, so safety stock, MOP and D2 move with it.
 */
export type OrderSchedule = { kind: 'daily' } | { kind: 'weekly'; weekday: Weekday };

export type ProposalReason = 'must' | 'can' | 'vendor-min-fill' | 'manual';

/** A RELEX-style order proposal line. */
export interface OrderProposal {
  itemId: ItemId;
  depotId: DepotId;
  vendorId: VendorId;
  qty: number;
  reason: ProposalReason;
  /**
   * Units of `qty` added by the vendor-minimum trigger build beyond this line's real need (RELEX_RULES §4).
   * qty − builtQty is the real need after pack rounding. 0 or absent = no build on this line.
   */
  builtQty?: number;
  /** Delivery date of this order. */
  d1: Day;
  /** Delivery date of the next order opportunity — the coverage horizon. */
  d2: Day;
  /**
   * Projected stock at the D2 check point (end of D2 − 1 by default; see rules.projection.measureAtD2),
   * with this order NOT yet placed. Lost sales clamp stock at 0 only up to D1; after that it may go
   * negative, so a negative value = demand that would go unmet before the next delivery. This is
   * what order sizing uses. engine.project() is the physical stock and never goes below 0.
   */
  projectedAtD2: number;
  mustOrderPoint: number;
  canOrderPoint: number;
  cost: number;
}

export type ProposalDecision = 'accepted' | 'rejected' | 'deferred';

export interface FiscalPeriod {
  index: number;
  start: Day;
  end: Day; // inclusive
  allowance: number;
  committed: number; // accepted order value
}

export type ExceptionKind =
  | 'stockout-risk'
  | 'below-mop'
  | 'vendor-min-shortfall'
  | 'forecast-deviation'
  | 'delivery-late'
  | 'over-budget'
  | 'spoilage'
  /** Actual stockout: demand went unmet on `day`. (stockout-risk is the forward-looking one.) */
  | 'stockout'
  /** A DC could not ship a transfer in full: the depot gets less than it ordered. */
  | 'dc-short';

export interface PlanningException {
  kind: ExceptionKind;
  day: Day;
  itemId?: ItemId;
  depotId?: DepotId;
  vendorId?: VendorId;
  message: string;
}

export interface DailyKpi {
  day: Day;
  demand: number;
  fulfilled: number;
  spoiled: number;
  holdingCost: number;
  spend: number;
  /** Sum over locations of that day's forecast total, as of that morning. */
  forecast: number;
  /** Sum over locations of |actual demand − forecast| that day. SWAPE = Σ absError / Σ demand (§10). */
  absError: number;
  /** Days of supply (§10): Σ end-of-day on hand ÷ Σ mean daily forecast, over all locations (not a mean of ratios). */
  daysOfSupply: number;
}

/** Difficulty picks the market ticker (volatility) and budget tightness (rules.difficulty). */
export type Difficulty = 'easy' | 'normal' | 'hard';

/**
 * Real market series that drives actual demand (RELEX_RULES §11). The store fetches it (Alpha Vantage
 * TIME_SERIES_DAILY, cached once per calendar day, bundled snapshot fallback) and hands it to initGame.
 * The engine only reads it; normalization lives in rules.market.
 */
export interface MarketSignal {
  ticker: string;
  source: 'live' | 'snapshot';
  /** True when the snapshot is generated placeholder data, not real prices. */
  synthetic?: boolean;
  /** Trading dates (YYYY-MM-DD) of values[0] and of the last value. */
  firstDate: string;
  lastDate: string;
  /** Daily closes, oldest first. values[d] drives demand on game day d. Length ≥ scenario.lengthDays. */
  values: number[];
}

/** What the player picks when starting a game. */
export interface GameSetup {
  difficulty: Difficulty;
  market: MarketSignal;
}

/** Vendor-minimum order trigger result for one vendor today (RELEX_RULES §4, §6). Computed by refresh. */
export interface VendorPlan {
  vendorId: VendorId;
  /** Real need: value or units (per minimum.kind) of must-order lines after pack rounding. */
  need: number;
  /** Vendor minimum in the same unit, if any. */
  minimum?: number;
  /** Effective trigger: GameState.vendorTriggers ?? Vendor.orderTrigger ?? rules default. */
  trigger: number;
  /** Exactly need ÷ minimum, both as above (1 when there is no minimum). Compared with `trigger`. */
  ratio: number;
  /**
   * 'no-minimum' | 'meets-minimum' (need ≥ minimum) | 'built' (ratio ≥ trigger, built up to the minimum
   * one pack at a time of the item with the lowest days of cover at D2) | 'below-trigger' (no proposal).
   */
  status: 'no-minimum' | 'meets-minimum' | 'built' | 'below-trigger';
}

/** Career standing (RELEX_RULES §9, §11). Titles per level come from content. */
export interface RankState {
  /** 0 = lowest rank. Demotion below 0 ends the game. */
  level: number;
  /** Progress toward the next promotion (budget discipline, service level, battles won). */
  merit: number;
  /** Letters of reprimand received since the last promotion or demotion. */
  reprimands: number;
  /** Fiscal periods in a row that ended over budget. */
  overspentStreak: number;
}

export type LetterKind = 'reprimand' | 'commendation' | 'promotion' | 'demotion' | 'battle-won' | 'battle-lost' | 'game-over';

/** A letter from command, raised by the engine on rank and battle events. */
export interface Letter {
  id: string;
  day: Day;
  kind: LetterKind;
  /** Plain fallback text written by the engine. The UI shows selectLetterText(), which uses content templates. */
  from: string;
  subject: string;
  body: string;
  battlePlanId?: BattlePlanId;
  /** Numbers behind the letter, so the store can render content's LETTER_TEMPLATES (engine never imports content). */
  facts?: LetterFacts;
}

export interface LetterFacts {
  /** Rank level after the event. */
  rankLevel: number;
  /** 0-based fiscal period index the letter is about. */
  periodIndex?: number;
  committed?: number;
  allowance?: number;
  /** Reprimands held after the event. */
  reprimands?: number;
  merit?: number;
  /** Service level 0–1 (period or battle window). */
  serviceLevel?: number;
}

/** Result of a battle plan's window, decided by service level to its depots during the window. */
export interface BattleOutcome {
  battlePlanId: BattlePlanId;
  /** Day the outcome was decided (the day after the window ends). */
  day: Day;
  won: boolean;
  serviceLevel: number;
}

export type GameStatus = 'playing' | 'complete' | 'lost';

export interface GameState {
  seed: number;
  today: Day;
  /**
   * Day the player takes command. Days before it were played by the previous quartermaster (warm-up,
   * auto-accepting every proposal; no rank or letters). Equals the warm-up length.
   */
  startDay: Day;
  /** Last day + 1: startDay + scenario.lengthDays. today ≥ lengthDays → status 'complete'. */
  lengthDays: number;
  items: Record<ItemId, Item>;
  vendors: Record<VendorId, Vendor>;
  depots: Record<DepotId, Depot>;
  sourcing: SourcingRule[];
  locations: ItemLocation[];
  overrides: ForecastOverride[];
  battlePlans: BattlePlan[];
  openOrders: OpenOrder[];
  proposals: OrderProposal[];
  periods: FiscalPeriod[];
  exceptions: PlanningException[];
  kpis: DailyKpi[];
  morale: number; // 0–100
  difficulty: Difficulty;
  market: MarketSignal;
  /** Player overrides of vendor order triggers (RELEX_RULES §4). Absent = vendor/rules default. */
  vendorTriggers: Record<VendorId, number>;
  /** Player overrides of vendor order days. Absent = the vendor's own orderDays. */
  vendorOrderDays: Record<VendorId, OrderSchedule>;
  /** Every received order, oldest first (vendor performance). */
  deliveries: DeliveryRecord[];
  /** Today's vendor-minimum trigger results: one per vendor whose order day is today (empty on other days). */
  vendorPlans: VendorPlan[];
  rank: RankState;
  /** Letters from command, oldest first. */
  letters: Letter[];
  battles: BattleOutcome[];
  status: GameStatus;
}

/** GameState fields built by initGame, not provided by scenarios. */
export type RuntimeField =
  | 'today'
  | 'startDay'
  | 'lengthDays'
  | 'proposals'
  | 'exceptions'
  | 'kpis'
  | 'openOrders'
  | 'difficulty'
  | 'market'
  | 'vendorTriggers'
  | 'vendorOrderDays'
  | 'deliveries'
  | 'vendorPlans'
  | 'rank'
  | 'letters'
  | 'battles'
  | 'status';

/** Static content a scenario/campaign level provides to build the initial GameState. */
export interface Scenario {
  id: string;
  title: string;
  briefing: string;
  /** RELEX concepts this level teaches, shown in the tutorial. */
  teaches: string[];
  /** Days the player plays, counted from takeover. */
  lengthDays: number;
  /**
   * Warm-up days played by the previous quartermaster before the player takes over (a multiple of 7, so
   * takeover is a Monday). Default rules.warmup.days. Battle-plan days in content are relative to takeover;
   * initGame shifts them by the warm-up.
   */
  warmupDays?: number;
  periodLengthDays: number;
  periodAllowance: number;
  initial: Omit<GameState, RuntimeField> & {
    openOrders?: OpenOrder[];
    /** Starting rank level; default rules.rank.startLevel. */
    rankLevel?: number;
  };
}

// ---------------------------------------------------------------------------
// Engine API — the functions the store calls. Implemented in src/engine/index.ts
// (re-exporting from calendar/forecast/projection/replenishment/tick). All pure and
// deterministic given state.seed; none mutate their input.
// ---------------------------------------------------------------------------

/** One player decision on a proposal line, as handed to the engine at end of day. */
export interface ProposalDecisionInput {
  /** Index into GameState.proposals. */
  index: number;
  decision: ProposalDecision;
  /** Edited quantity for an accepted line; engine rounds to pack size and recomputes cost. */
  qty?: number;
}

/** Replenishment parameters for one item-location at its next order opportunity (today or later). */
export interface PlanningParams {
  itemId: ItemId;
  depotId: DepotId;
  /** Source vendor used for the next order opportunity. */
  vendorId: VendorId;
  /** Day of the next order opportunity (today if today is an order day). */
  orderDay: Day;
  d1: Day;
  d2: Day;
  safetyStock: number;
  minimumFill: number;
  /** max(safetyStock, minimumFill) (RELEX_RULES §3). */
  mustOrderPoint: number;
  canOrderPoint: number;
  orderUpTo: number;
  /**
   * Projected stock at the D2 check point (end of D2 − 1 by default; see rules.projection.measureAtD2),
   * with this order NOT yet placed. Lost sales clamp stock at 0 only up to D1; after that it may go
   * negative, so a negative value = demand that would go unmet before the next delivery. This is
   * what order sizing uses. engine.project() is the physical stock and never goes below 0.
   */
  projectedAtD2: number;
}

export interface EngineApi {
  /**
   * Build day-0 state from a scenario and the player's setup: periods (allowance × difficulty
   * budgetFactor), rank, empty kpis/letters, proposals + vendorPlans + exceptions computed.
   * Without a setup: 'normal' difficulty and a flat market (tests).
   */
  initGame(scenario: Scenario, setup?: GameSetup): GameState;
  /**
   * Recompute derived state for `today` (proposals, exceptions) after the player changes
   * inputs (e.g. overrides). Must not advance time or consume RNG.
   */
  refresh(state: GameState): GameState;
  /** Daily forecast for one item-location, inclusive day range. */
  forecast(state: GameState, itemId: ItemId, depotId: DepotId, from: Day, to: Day): ForecastPoint[];
  /**
   * MOP/COP/D1/D2 for one item-location, so the UI can draw them on days with no proposal.
   * undefined if the item has no usable source.
   */
  planningParams(state: GameState, itemId: ItemId, depotId: DepotId): PlanningParams | undefined;
  /** Projected end-of-day stock for days from..to inclusive (index 0 = `from`), incl. open orders. */
  project(state: GameState, itemId: ItemId, depotId: DepotId, from: Day, to: Day): number[];
  /**
   * Turn accepted decisions into OpenOrders (commit spend to the current FiscalPeriod).
   * Rejected/deferred lines are dropped. Does not advance time.
   */
  placeOrders(state: GameState, decisions: ProposalDecisionInput[]): GameState;
  /**
   * Advance one day: receive deliveries, consume actual demand (market signal + seeded noise),
   * spoilage, holding cost, budget/morale, KPIs, rank/letters/battle outcomes, status. Returns state
   * with today+1 and fresh proposals + vendorPlans + exceptions. No-op once status !== 'playing'.
   */
  tick(state: GameState): GameState;
  /** A vendor's order weekdays after the player's override (GameState.vendorOrderDays). */
  effectiveOrderDays(state: GameState, vendorId: VendorId): Weekday[];
  /** Master data + derived figures, one row per GameState.locations entry, same order. */
  itemLocationStats(state: GameState): ItemLocationStats[];
  /** Master data + performance, one row per vendor. */
  vendorStats(state: GameState): VendorStats[];
}

/** Master-data row for one item-location (Master Data screen). Computed by the engine. */
export interface ItemLocationStats {
  itemId: ItemId;
  depotId: DepotId;
  /** Current source (the vendor the next order would go to); undefined if the item has no usable source. */
  vendorId?: VendorId;
  onHand: number;
  /** Mean daily actual demand over the last rules.masterData.salesWindowDays of history. */
  avgDailySales: number;
  /** Mean daily forecast total over today .. today + rules.masterData.forecastWindowDays − 1. */
  avgForecastNext: number;
  safetyStock?: number;
  minimumFill: number;
  mustOrderPoint?: number;
  /** Next order opportunity for this item (today or later). */
  orderDay?: Day;
  /** Days from that order opportunity to the following one. */
  reviewPeriodDays?: number;
  leadTimeDays?: number;
  packSize?: number;
  unitCost?: number;
  /** On hand ÷ mean daily forecast; Infinity when there is no forecast. */
  daysOfSupply: number;
  /** Campaign-to-date actual demand and units fulfilled at this location. */
  campaignDemand: number;
  campaignFulfilled: number;
  /** campaignFulfilled ÷ campaignDemand; null before any campaign demand. */
  serviceLevelToDate: number | null;
}

/**
 * Master-data and performance row for one vendor. Performance counts campaign orders only
 * (orderedOn ≥ 0); a scenario's opening orders are excluded.
 */
export interface VendorStats {
  vendorId: VendorId;
  /** The vendor's own order weekdays (master data). */
  defaultOrderDays: Weekday[];
  /** Order weekdays in effect (after the player's schedule override). */
  orderDays: Weekday[];
  /** The player's override, if any. */
  schedule?: OrderSchedule;
  /** Next order opportunity, today or later. */
  nextOrderDay?: Day;
  leadTimeDays: number;
  reliability: number;
  minimum?: Vendor['minimum'];
  /** Effective order trigger, and whether the player has overridden it. */
  trigger: number;
  customTrigger: boolean;
  /** Distinct items this vendor can supply (sourcing rules). */
  itemsSupplied: number;
  /** Set when this row is an internal DC transfer lane, not an outside supplier. */
  dcDepotId?: DepotId;
  ordersPlaced: number;
  unitsOrdered: number;
  spend: number;
  delivered: number;
  onTime: number;
  late: number;
  /** onTime ÷ delivered; null before any delivery. */
  onTimeRate: number | null;
  /** Mean of receivedOn − orderedOn over delivered orders; null before any delivery. */
  avgLeadTimeActual: number | null;
  /** Mean days late over late deliveries; null when none were late. */
  avgDaysLate: number | null;
  openOrders: number;
  openUnits: number;
  openValue: number;
  /** Open orders already past their promised date. */
  overdueOpen: number;
}
