// Plain-words explanations for every RELEX term the UI shows. Medieval flavour first, then the
// real-world meaning, so the game teaches the actual process.

export type TermKey =
  | 'mop'
  | 'cop'
  | 'd1'
  | 'd2'
  | 'proposal'
  | 'safetyStock'
  | 'minimumFill'
  | 'projected'
  | 'shortfall'
  | 'forecast'
  | 'leadTime'
  | 'orderDay'
  | 'vendorMin'
  | 'packSize'
  | 'uplift'
  | 'fiscalPeriod'
  | 'committed'
  | 'serviceLevel'
  | 'exception'
  | 'mustOrder'
  | 'canOrder'
  | 'vendorMinFill'
  | 'orderTrigger'
  | 'daysOfSupply'
  | 'spoilage'
  | 'swape'
  | 'bias'
  | 'market'
  | 'rank'
  | 'reviewPeriod'
  | 'avgDailySales'
  | 'onTimeRate'
  | 'actualLeadTime'
  | 'itemLocation'
  | 'masterData'
  | 'dc'
  | 'transfer'
  | 'dependentDemand';

export interface GlossaryEntry {
  term: string;
  flavour: string;
  plain: string;
  /** Terms to read alongside this one (shown as "Related" in the tooltip). */
  related?: TermKey[];
}

export const GLOSSARY: Record<TermKey, GlossaryEntry> = {
  mop: {
    term: 'MOP — Must Order Point',
    flavour: 'The line below which the camp starves.',
    plain:
      'The lowest stock you may let an item fall to: the larger of the safety stock (from how much demand varies) and the minimum fill you set. If projected stock at D2 is below the MOP, you must order today.',
    related: ['safetyStock', 'minimumFill', 'd2'],
  },
  cop: {
    term: 'COP — Can Order Point',
    flavour: 'Not hungry yet, but the cart has room.',
    plain:
      'A level above the MOP. Items between MOP and COP do not need an order today, but may be added to fill up a supplier’s minimum order.',
    related: ['mop'],
  },
  d1: {
    term: 'D1 — First delivery date',
    flavour: 'When today’s wagon reaches camp.',
    plain: 'The day an order placed today would arrive (today + the supplier’s lead time).',
  },
  d2: {
    term: 'D2 — Second delivery date',
    flavour: 'When the wagon after this one arrives.',
    plain:
      'The arrival day of the NEXT order you could place with this supplier. Today’s order must carry you until then, so the rule is: keep projected stock above the MOP at D2, measured at the end of the day just before the D2 delivery arrives.',
  },
  proposal: {
    term: 'Order proposal',
    flavour: 'Your clerk’s suggested requisition.',
    plain:
      'A suggested order line worked out by the planning system: item, supplier, quantity and why. You accept it, change the quantity, or reject it.',
  },
  safetyStock: {
    term: 'Safety stock',
    flavour: 'Spare sacks against a bad week.',
    plain:
      'Extra stock held to cover demand being higher than forecast or a late delivery. Higher service level and more uncertain demand mean more safety stock.',
    related: ['mop', 'minimumFill', 'serviceLevel'],
  },
  minimumFill: {
    term: 'Minimum fill',
    flavour: 'One full cart always in sight of the men.',
    plain:
      'A floor you set for an item, in units. The Must Order Point is whichever is larger: this, or the safety stock worked out from how much demand varies.',
    related: ['mop', 'safetyStock'],
  },
  projected: {
    term: 'Projected stock',
    flavour: 'What the storehouse will hold, if all goes as foretold.',
    plain: 'Stock on hand, plus deliveries already ordered, minus forecast demand — day by day into the future.',
  },
  shortfall: {
    term: 'Shortfall (unmet demand)',
    flavour: 'Soldiers at the cart with empty bowls.',
    plain:
      'Projected stock can never fall below zero: you cannot hand out sacks you do not have. Demand beyond that goes unmet and is lost. The planner still counts it, as a negative number at D2, because the order must cover it too.',
  },
  forecast: {
    term: 'Forecast',
    flavour: 'The clerk’s reckoning of what the army will eat and loose.',
    plain: 'Expected daily demand, built from past demand plus any battle-plan uplift or manual override.',
  },
  leadTime: {
    term: 'Lead time',
    flavour: 'Days on the road.',
    plain: 'Days between placing an order and it arriving at the depot.',
  },
  orderDay: {
    term: 'Order days',
    flavour: 'When the supplier’s rider comes to collect your letter.',
    plain: 'Weekdays on which you can place an order with this supplier. The gap between them decides D2.',
  },
  vendorMin: {
    term: 'Vendor minimum',
    flavour: 'No smith fires the forge for three nails.',
    plain:
      'The smallest order a supplier will accept, by value or by units. Whether a small need is built up to the minimum is decided by the order trigger.',
  },
  packSize: {
    term: 'Pack size',
    flavour: 'Arrows come by the quiver, not the shaft.',
    plain: 'Order quantities must be a multiple of this. Proposals are rounded to it.',
  },
  uplift: {
    term: 'Event uplift',
    flavour: 'The general expects a hard fight.',
    plain:
      'A factor applied to the forecast for the days of a planned event (a battle here; a promotion in a shop). ×2 means twice the normal demand. The letter may not be accurate.',
  },
  fiscalPeriod: {
    term: 'Fiscal period',
    flavour: 'The Treasurer’s reckoning.',
    plain: 'A budget window. Orders accepted in the period count against its allowance on the day you place them.',
  },
  committed: {
    term: 'Committed spend',
    flavour: 'Silver already promised to merchants.',
    plain: 'The value of orders already placed this period.',
  },
  serviceLevel: {
    term: 'Service level',
    flavour: 'How often a soldier got what he asked for.',
    plain: 'Share of demand you fulfilled from stock. 100% means no stockouts.',
  },
  exception: {
    term: 'Exception',
    flavour: 'A messenger with bad news.',
    plain: 'Something the system flags for a human: a stockout risk, a late delivery, demand far from forecast, and so on.',
  },
  mustOrder: {
    term: 'Must order',
    flavour: 'Order now, or go without.',
    plain: 'Projected stock at D2 is below the MOP. Rejecting this line risks a stockout.',
  },
  canOrder: {
    term: 'Can order',
    flavour: 'Room in the cart.',
    plain: 'Projected stock at D2 is between MOP and COP. Optional, but cheap to add while a wagon is coming anyway.',
  },
  daysOfSupply: {
    term: 'Days of supply',
    flavour: 'How long the stores would last if every wagon stopped.',
    plain:
      'Stock on hand divided by the forecast daily demand, averaged across your stores. Too few days risks stockouts; too many ties up silver and lets perishables rot.',
  },
  spoilage: {
    term: 'Spoilage',
    flavour: 'Hay rots, pork turns, bread goes green.',
    plain: 'Units thrown away because they passed their shelf life before they were used. Ordering far more than you need shows up here.',
  },
  swape: {
    term: 'SWAPE — forecast error',
    flavour: 'How far the clerk’s reckoning missed, all told.',
    plain:
      'Sum of absolute errors ÷ sum of actual demand: Σ|actual − forecast| ÷ Σ actual. 0% is a perfect forecast; 30% means the misses add up to almost a third of all demand. Over- and under-forecasts do not cancel out.',
  },
  bias: {
    term: 'Forecast bias',
    flavour: 'Does the clerk lean hungry or lean full?',
    plain:
      '(Σ forecast − Σ actual) ÷ Σ actual. Positive means you forecast too much (stock piles up); negative means too little (stockouts). A good forecast has bias near 0% even when SWAPE is high.',
  },
  market: {
    term: 'Market signal',
    flavour: 'The army’s appetite rises and falls with the merchants’ fortunes.',
    plain:
      'Actual demand follows a real stock’s daily closing prices, scaled to your camps, so it is truly unpredictable. More volatile tickers make harder games. “Live” means fetched today; “snapshot” means prices bundled with the game.',
  },
  rank: {
    term: 'Rank',
    flavour: 'Your standing with the Lord Marshal.',
    plain:
      'Keep within budget and keep the army supplied to earn commendations and promotion. Repeated overspending earns letters of reprimand, then demotion. Losing a battle for want of supplies also costs rank. Fall below the lowest rank and you are dismissed.',
  },
  reviewPeriod: {
    term: 'Review period',
    flavour: 'Days between one chance to send for wagons and the next.',
    plain:
      'The gap between two order days with a supplier. Each order must carry you through it, so a longer review period means more safety stock and a higher MOP. Ordering every day shortens it to one day.',
  },
  avgDailySales: {
    term: 'Average daily sales',
    flavour: 'What the camp actually ate and loosed, day by day.',
    plain: 'Mean actual demand per day over the last 28 days of history. Compare it with the forecast to see whether the forecast is running high or low.',
  },
  onTimeRate: {
    term: 'On-time rate',
    flavour: 'How often the wagon came when promised.',
    plain: 'Deliveries received on or before their promised day ÷ all deliveries received. A low rate means you need more safety stock or a more reliable supplier.',
  },
  actualLeadTime: {
    term: 'Actual vs promised lead time',
    flavour: 'Days the road really took, against the days the merchant swore to.',
    plain: 'Mean days from order to receipt over delivered orders, next to the lead time the vendor promises. Planning uses the promised lead time, so a gap here becomes stockouts.',
  },
  itemLocation: {
    term: 'Item-location',
    flavour: 'One store in one camp.',
    plain:
      'One item at one depot: the unit that is forecast and replenished. Grain at the Eastern Camp and grain at the siege lines are two item-locations, each with its own stock, forecast and MOP.',
  },
  masterData: {
    term: 'Master data',
    flavour: 'The rolls the clerks plan from.',
    plain:
      'The standing facts behind every proposal: which vendor supplies what, lead times, pack sizes, costs, order days and minimum fills. Wrong master data gives wrong proposals, however good the forecast.',
  },
  dc: {
    term: 'DC — distribution centre',
    flavour: 'The great storehouse behind the lines.',
    plain:
      'A depot that feeds no soldiers itself. It buys from outside vendors in bulk, holds stock cheaply, and ships to the front depots by transfer. Its stock is the front’s safety net.',
    related: ['transfer', 'dependentDemand'],
  },
  transfer: {
    term: 'Transfer',
    flavour: 'Your own wagons, your own stores.',
    plain:
      'An order a front depot places on a DC rather than on a merchant. It ships from the DC’s stock, costs nothing against the budget (the silver was spent when the DC bought it), and runs on the lane’s own order days and lead time. If the DC is short, the depot gets less than it ordered.',
    related: ['dc', 'dependentDemand'],
  },
  dependentDemand: {
    term: 'Dependent demand',
    flavour: 'The storehouse is only as hungry as the camps it feeds.',
    plain:
      'A DC’s demand is not soldiers eating: it is the transfer orders the front depots are planning to place on it. Its forecast is built from those planned orders, so a change at the front shows up at the DC straight away.',
    related: ['dc', 'transfer', 'forecast'],
  },
  orderTrigger: {
    term: 'Order trigger',
    flavour: 'How hungry the camp must be before you send for a full wagon.',
    plain:
      'For a supplier with a minimum order: the share of that minimum your real need must reach before the system builds a full order. At or above it, the order is built up to the minimum one pack at a time, always adding the item with the fewest days of cover. Below it, no order is drafted. A lower trigger orders sooner with more padding; a higher trigger waits for a real need.',
  },
  vendorMinFill: {
    term: 'Vendor-minimum fill',
    flavour: 'Padding the cart to please the merchant.',
    plain: 'Added only to reach the supplier’s minimum order. Not needed for stock by itself.',
  },
};
