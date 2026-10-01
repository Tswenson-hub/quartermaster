// Plain-words explanations for every RELEX term the UI shows. Medieval flavour first, then the
// real-world meaning, so the game teaches the actual process.

export type TermKey =
  | 'mop'
  | 'cop'
  | 'd1'
  | 'd2'
  | 'proposal'
  | 'safetyStock'
  | 'presentationStock'
  | 'projected'
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
  | 'vendorMinFill';

export interface GlossaryEntry {
  term: string;
  flavour: string;
  plain: string;
}

export const GLOSSARY: Record<TermKey, GlossaryEntry> = {
  mop: {
    term: 'MOP — Must Order Point',
    flavour: 'The line below which the camp starves.',
    plain:
      'The lowest stock you may let an item fall to. It is your safety stock plus any stock you must always keep on display. If the projected stock on D2 is below the MOP, you must order today.',
  },
  cop: {
    term: 'COP — Can Order Point',
    flavour: 'Not hungry yet, but the cart has room.',
    plain:
      'A level above the MOP. Items between MOP and COP do not need an order today, but may be added to fill up a supplier’s minimum order.',
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
  },
  presentationStock: {
    term: 'Presentation stock',
    flavour: 'One full cart always in sight of the men.',
    plain: 'A minimum quantity you always want on hand regardless of demand. It is added to safety stock to make the MOP.',
  },
  projected: {
    term: 'Projected stock',
    flavour: 'What the storehouse will hold, if all goes as foretold.',
    plain: 'Stock on hand, plus deliveries already ordered, minus forecast demand — day by day into the future.',
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
      'The smallest order a supplier will accept, by value or by units. If you are short, top up items between MOP and COP, or accept the order will not be sent.',
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
  vendorMinFill: {
    term: 'Vendor-minimum fill',
    flavour: 'Padding the cart to please the merchant.',
    plain: 'Added only to reach the supplier’s minimum order. Not needed for stock by itself.',
  },
};
