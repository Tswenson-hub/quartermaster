import type { Difficulty, LetterKind } from '../engine/types';

// Career flavour: rank titles and insignia, the people who write to the quartermaster, letter
// templates for every LetterKind, and difficulty blurbs. Numbers (merit, thresholds, tickers,
// budget factors) live in rules.config.ts. This file is words and icon keys only.

export interface Rank {
  level: number;
  title: string;
  /** Key in manifest.icons. */
  insignia: string;
  /** One line shown on promotion or on the career screen. */
  flavour: string;
}

export const RANKS: Rank[] = [
  { level: 0, title: "Sutler's Boy", insignia: 'rank.0', flavour: 'Hawking bread at the camp edge. One more mistake and you are out.' },
  { level: 1, title: 'Clerk of Stores', insignia: 'rank.1', flavour: 'A ledger, a candle stub and a corner of the store tent.' },
  { level: 2, title: 'Sergeant of Stores', insignia: 'rank.2', flavour: 'Trusted with a depot and the keys to its padlocks.' },
  { level: 3, title: 'Master of Wagons', insignia: 'rank.3', flavour: 'Every cart on the supply road answers to you.' },
  { level: 4, title: 'Quartermaster', insignia: 'rank.4', flavour: 'Your seal on an order is as good as silver.' },
  { level: 5, title: 'Quartermaster of the Host', insignia: 'rank.5', flavour: 'Three depots and a seat at the war council.' },
  { level: 6, title: 'Quartermaster-General', insignia: 'rank.6', flavour: 'The King himself asks what the army can afford.' },
];

/** Titles for levels 0..6 (index = RankState.level). */
export const RANK_TITLES: string[] = RANKS.map((r) => r.title);

/** Title for any level; clamps out-of-range levels (e.g. −1 on game over). */
export function rankTitle(level: number): string {
  return RANK_TITLES[Math.min(Math.max(level, 0), RANK_TITLES.length - 1)];
}

/** People who write to the quartermaster. */
export const SENDERS = {
  marshal: 'Lord Marshal Edric Vane',
  treasury: 'Dame Isolde Marrow, Keeper of the Royal Treasury',
  crown: 'His Majesty King Aldwin III',
  steward: "Sir Hamon Ashby, Steward to the Duke of Brackenford",
  captain: 'Captain Rowan Thale, Northern Horse',
} as const;

/** Values a letter template may use. Templates ignore any value they don't need. */
export interface LetterContext {
  /** Rank title after the event (new title for promotion/demotion). */
  rankTitle: string;
  /** 1-based fiscal period number. */
  period?: number;
  committed?: number;
  allowance?: number;
  /** Reprimands so far, and how many cause a demotion. */
  reprimands?: number;
  reprimandsPerDemotion?: number;
  merit?: number;
  promotionMerit?: number;
  /** Service level 0–1 (period or battle window). */
  serviceLevel?: number;
  battleTitle?: string;
  /** Battle-specific victory/defeat line (BATTLES[id].victory / .defeat). */
  battleLine?: string;
}

export interface LetterText {
  from: string;
  subject: string;
  body: string;
}

const silver = (n = 0) => `${Math.round(n).toLocaleString('en-GB')} silver`;
const pct = (x = 0) => `${Math.round(x * 100)}%`;

/** Letter templates, one per LetterKind. Engine/store can map a Letter's kind + numbers to these. */
export const LETTER_TEMPLATES: Record<LetterKind, (c: LetterContext) => LetterText> = {
  reprimand: (c) => ({
    from: SENDERS.treasury,
    subject: `Letter of reprimand: period ${c.period ?? '?'}`,
    body:
      `Quartermaster, the ledgers for period ${c.period ?? '?'} came to my desk. You committed ${silver(c.committed)} ` +
      `against an allowance of ${silver(c.allowance)}. The Crown does not mint coin for careless clerks. ` +
      `This is reprimand ${c.reprimands ?? 1} of ${c.reprimandsPerDemotion ?? 2}. At the last, I will ask the Marshal for your rank.`,
  }),
  commendation: (c) => ({
    from: SENDERS.marshal,
    subject: `Commendation: period ${c.period ?? '?'}`,
    body:
      `Well kept, ${c.rankTitle}. You stayed within the Treasury's allowance and met ${pct(c.serviceLevel)} of the army's ` +
      `needs. The men have noticed, and so have I. (Merit ${c.merit ?? 0} of ${c.promotionMerit ?? 3} toward promotion.)`,
  }),
  promotion: (c) => ({
    from: SENDERS.marshal,
    subject: `Raised to ${c.rankTitle}`,
    body:
      `For a well-fed army and honest books, you are raised to ${c.rankTitle}. ` +
      `Wear the new insignia where the wagon-masters can see it.`,
  }),
  demotion: (c) => ({
    from: SENDERS.marshal,
    subject: `Reduced to ${c.rankTitle}`,
    body:
      `I can no longer defend you before the council. You are reduced to ${c.rankTitle}. ` +
      `Mend your accounts and keep the front supplied, or worse will follow.`,
  }),
  'battle-won': (c) => ({
    from: SENDERS.marshal,
    subject: `Victory: ${c.battleTitle ?? 'the field is ours'}`,
    body:
      `${c.battleLine ?? 'The field is ours.'} The army was ${pct(c.serviceLevel)} supplied through the fighting. ` +
      `Every sheaf and sack you sent was worth a man in the line.`,
  }),
  'battle-lost': (c) => ({
    from: SENDERS.marshal,
    subject: `Defeat: ${c.battleTitle ?? 'the line broke'}`,
    body:
      `${c.battleLine ?? 'The line broke.'} Only ${pct(c.serviceLevel)} of what the army needed reached it. ` +
      `The council will want to know why.`,
  }),
  'game-over': () => ({
    from: SENDERS.crown,
    subject: 'Dismissed from Our service',
    body:
      'You are stripped of your commission and your seal is broken. Another will keep Our stores. ' +
      'The campaign goes on without you.',
  }),
};

/** Flavour for the difficulty picker. Tickers and budget factors are in rules.difficulty. */
export const DIFFICULTY_FLAVOUR: Record<Difficulty, { title: string; description: string }> = {
  easy: {
    title: 'Garrison Duty',
    description: 'A quiet frontier and a patient Treasury. Demand follows a steady market (KO) and the allowance is generous.',
  },
  normal: {
    title: 'Field Campaign',
    description: 'A war of moving camps. Demand swings with a lively market (AAPL), and the Treasury expects you to keep within budget.',
  },
  hard: {
    title: 'Winter Siege',
    description: 'Hunger, frost and a miserly Treasury. Demand lurches with a wild market (TSLA) and the allowance is tight.',
  },
};
