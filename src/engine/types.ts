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
  /**
   * Vendor minimum order, if any (RELEX_RULES §4, §6).
   * `surcharge` is DEPRECATED: the below-minimum surcharge path was removed by the owner. Stop reading
   * and writing it; the lead deletes the field once no code uses it.
   */
  minimum?: { kind: 'value' | 'units'; amount: number; /** @deprecated removed by RELEX_RULES §4 */ surcharge?: number };
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
}

export interface Depot {
  id: DepotId;
  name: string; // "Eastern Camp", "Siege Lines at Harrowmere"
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
  deliveryOn: Day;
  /** Total cost of the line, including `surcharge` if any. */
  cost: number;
  /** @deprecated The below-minimum surcharge path was removed (RELEX_RULES §4). Lead deletes this once unused. */
  surcharge?: number;
}

export type ProposalReason = 'must' | 'can' | 'vendor-min-fill' | 'manual';

/** A RELEX-style order proposal line. */
export interface OrderProposal {
  itemId: ItemId;
  depotId: DepotId;
  vendorId: VendorId;
  qty: number;
  reason: ProposalReason;
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
  | 'stockout';

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
  /** End-of-day on hand ÷ next day's forecast, summed over locations (days of supply, §10). */
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
  /** need ÷ minimum (1 when there is no minimum). */
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
  from: string;
  subject: string;
  body: string;
  battlePlanId?: BattlePlanId;
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
  /** Campaign length (scenario.lengthDays). today ≥ lengthDays → status 'complete'. */
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
  /** Today's vendor-minimum trigger results, one per vendor with a proposal or a minimum. */
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
  | 'lengthDays'
  | 'proposals'
  | 'exceptions'
  | 'kpis'
  | 'openOrders'
  | 'difficulty'
  | 'market'
  | 'vendorTriggers'
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
  lengthDays: number;
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
}
