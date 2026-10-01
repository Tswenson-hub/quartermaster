import type { BattlePlan, BattlePlanId } from '../engine/types';

/**
 * Military letters — the promotion/event calendar of the war. Each states an uplift on
 * demand for some items over a window; the actual uplift is hidden until the days arrive.
 *
 * Accuracy, by design (fog of war — teaches forecast-accuracy review):
 * - harrowmere-assault : accurate (within ~10%).
 * - feast-muster       : exaggerated — the Duke always promises a grander feast than he holds.
 * - winter-crossing    : UNDER-stated — the scouts underestimated the ice.
 * - ford-feint         : accurate.
 * - levies-arrive      : SILENT — the letter gives no numbers, so the system forecast ignores it.
 *                        The player must enter a forecast override (tutorial level VIII).
 *
 * Days are campaign days (day 0 = Monday). Each letter arrives with at least the longest
 * relevant vendor lead time to spare, so a sharp quartermaster can pre-build stock.
 */
export const BATTLE_PLANS: BattlePlan[] = [
  {
    id: 'harrowmere-assault',
    title: 'The Assault on Harrowmere Walls',
    letter:
      'Quartermaster — On the third Monday hence we storm the walls of Harrowmere. ' +
      'The archers shall loose from dawn till the light fails; I want arrows by the cartload ' +
      'and pitch enough to set the gatehouse ablaze. Ladders want rope. Surgeons want linen. ' +
      'Plan for two and a half times the usual draw of shafts, thrice the pitch, ' +
      'twice the rope and bandages, for a full week. Fail me not. — Lord Marshal Edric Vane',
    announcedOn: 10,
    start: 21,
    end: 27,
    winServiceLevel: 0.92,
    depotIds: ['harrowmere'],
    statedUplift: { arrows: 2.5, pitch: 3.0, 'siege-rope': 2.0, bandages: 2.0 },
    actualUplift: { arrows: 2.4, pitch: 2.8, 'siege-rope': 2.1, bandages: 2.2 },
  },
  {
    id: 'feast-muster',
    title: "The Duke's Feast-Day Muster",
    letter:
      'Most worthy Quartermaster, His Grace the Duke of Brackenford rides to the Eastern Camp ' +
      'for the Feast of St. Crispin. Every lance and levy in three shires will muster to greet him! ' +
      'Let the ale flow THREEFOLD and the bread half again, that none may say the Duke ' +
      'keeps a mean table. — Sir Hamon Ashby, Steward to His Grace',
    announcedOn: 22,
    start: 32,
    end: 34,
    winServiceLevel: 0.85,
    depotIds: ['eastern-camp'],
    statedUplift: { ale: 3.0, grain: 1.5 },
    // Half the shires stayed home. Classic over-promise.
    actualUplift: { ale: 1.6, grain: 1.15 },
  },
  {
    id: 'winter-crossing',
    title: 'Winter Crossing of the Northern Pass',
    letter:
      'Quartermaster, the cavalry crosses the Northern Pass before the snows close it. ' +
      'My scouts say the road is firm. Allow perhaps half again the usual oats and shoes ' +
      'for the fortnight of the crossing. — Captain Rowan Thale, Northern Horse',
    announcedOn: 42,
    start: 52,
    end: 65,
    winServiceLevel: 0.9,
    depotIds: ['northern-pass'],
    statedUplift: { oats: 1.5, horseshoes: 1.5 },
    // The road was ice and scree. Horses ate more in the cold and threw shoes on every switchback.
    actualUplift: { oats: 2.1, horseshoes: 2.6 },
  },
  {
    id: 'ford-feint',
    title: 'The Feint at Brackenford',
    letter:
      'Quartermaster — We shall make a show of crossing at the ford to draw the enemy south. ' +
      'Archers and crossbowmen will be engaged for five days of skirmish. Expect near double ' +
      'the usual expenditure of arrows and bolts, and a third more bowstrings broken. ' +
      '— Lord Marshal Edric Vane',
    announcedOn: 70,
    start: 80,
    end: 84,
    winServiceLevel: 0.9,
    depotIds: ['eastern-camp'],
    statedUplift: { arrows: 1.8, bolts: 1.8, bowstrings: 1.33 },
    actualUplift: { arrows: 1.85, bolts: 1.7, bowstrings: 1.35 },
  },
  {
    id: 'levies-arrive',
    title: "The Earl's Levies Arrive",
    letter:
      'Quartermaster — The Earl of Fennmarch keeps his word at last. His levies march into the ' +
      'Eastern Camp on the Monday after next and will stay with us until the campaign ends. ' +
      'They are many, and hungry, and thirsty. I leave the sums to you. — Lord Marshal Edric Vane',
    announcedOn: 3,
    start: 14,
    end: 34,
    winServiceLevel: 0.95,
    depotIds: ['eastern-camp'],
    // No figures in the letter, so the system forecast gets no uplift. The player must override it.
    statedUplift: {},
    actualUplift: { grain: 2.0, ale: 2.1, bandages: 1.5 },
  },
];

export const BATTLE_PLANS_BY_ID: Record<BattlePlanId, BattlePlan> = Object.fromEntries(
  BATTLE_PLANS.map((p) => [p.id, p]),
);

/** Flavour for the battle each plan culminates in. The win threshold is BattlePlan.winServiceLevel. */
export interface Battle {
  battlePlanId: BattlePlanId;
  name: string;
  /** Items whose supply decides the day (shown to the player as the battle's needs). */
  keyItems: string[];
  victory: string;
  defeat: string;
}

export const BATTLES: Record<BattlePlanId, Battle> = {
  'harrowmere-assault': {
    battlePlanId: 'harrowmere-assault',
    name: 'The Storming of Harrowmere',
    keyItems: ['arrows', 'pitch', 'siege-rope', 'bandages'],
    victory: 'The gatehouse burned, the ladders held, and our banner flies over Harrowmere.',
    defeat: 'The archers ran dry by noon and the ladders came down without rope. Harrowmere stands.',
  },
  'feast-muster': {
    battlePlanId: 'feast-muster',
    name: "The Duke's Muster",
    keyItems: ['ale', 'grain'],
    victory: 'The Duke drank deep and pledged three more lances to the war.',
    defeat: 'The casks ran dry before the toasts. The Duke rode home in a temper, and his lances went with him.',
  },
  'winter-crossing': {
    battlePlanId: 'winter-crossing',
    name: 'The Crossing of the Northern Pass',
    keyItems: ['oats', 'horseshoes'],
    victory: 'Every horse came over the pass shod and fed. The enemy never saw us coming.',
    defeat: 'Lame and starving horses littered the switchbacks. Half the cavalry turned back.',
  },
  'ford-feint': {
    battlePlanId: 'ford-feint',
    name: 'The Feint at Brackenford',
    keyItems: ['arrows', 'bolts', 'bowstrings'],
    victory: 'Our volleys never slackened. The enemy swallowed the bait and marched south.',
    defeat: 'The volleys thinned and the enemy saw through the feint.',
  },
  'levies-arrive': {
    battlePlanId: 'levies-arrive',
    name: 'Feeding the Levies',
    keyItems: ['grain', 'ale'],
    victory: "The Earl's levies were fed from the first night. They will follow you anywhere.",
    defeat: "The levies went hungry and began to desert. The Earl's goodwill is spent.",
  },
};
