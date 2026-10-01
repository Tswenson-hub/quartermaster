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
  /** Vendor minimum order, if any. */
  minimum?: { kind: 'value' | 'units'; amount: number };
  /** Probability (0–1) per delivery of delay / short-ship, for disruption events. */
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
  /** Demand history, index = Day. */
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
  | 'spoilage';

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
