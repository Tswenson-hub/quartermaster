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
   * Vendor minimum order, if any. `surcharge` (flat silver) applies when the player accepts
   * an order below the minimum; without it a short order is not allowed.
   */
  minimum?: { kind: 'value' | 'units'; amount: number; surcharge?: number };
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
  /** Minimum presentation / display stock (e.g. "always keep 1 cart at camp"). */
  presentationStock: number;
  /**
   * FIFO stock lots, oldest first, for spoilage. When present, sum of qty = onHand.
   * Optional: when absent the engine treats all stock as received today.
   */
  lots?: { qty: number; receivedOn: Day }[];
  /**
   * Actual daily demand, oldest first; the last entry is always yesterday (today − 1).
   * Scenarios seed it with pre-campaign history; tick() appends each day's actual demand.
   * So the demand on day d is history[history.length - (today - d)].
   */
  history: number[];
}

export type ForecastOverride = {
  itemId: ItemId;
  depotId: DepotId;
  from: Day;
  to: Day;
  /** Absolute daily quantity OR multiplicative factor on baseline. */
  mode: 'absolute' | 'factor';
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
  cost: number;
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
  /** Sum over locations of that day's forecast total as of that morning (for MAPE/bias). */
  forecast?: number;
}

export interface GameState {
  seed: number;
  today: Day;
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
}

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
  initial: Omit<GameState, 'today' | 'proposals' | 'exceptions' | 'kpis' | 'openOrders'> & {
    openOrders?: OpenOrder[];
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
  mustOrderPoint: number;
  canOrderPoint: number;
  orderUpTo: number;
  projectedAtD2: number;
}

export interface EngineApi {
  /** Build day-0 state from a scenario: periods, empty kpis/exceptions, proposals + exceptions computed. */
  initGame(scenario: Scenario): GameState;
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
   * Advance one day: receive deliveries, consume (seeded) actual demand, spoilage, holding
   * cost, budget/morale, KPIs. Returns state with today+1 and fresh proposals + exceptions.
   */
  tick(state: GameState): GameState;
}
