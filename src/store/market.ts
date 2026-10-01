// Market series that drives actual demand (RELEX_RULES §11). Lives in the store, not the engine:
// it does I/O. Order of preference: today's cached live series → a live fetch (at most one attempt
// per ticker per calendar day) → an older cached live series → the bundled snapshot.

import type { MarketSignal } from '../engine/types';
import { MARKET_SNAPSHOTS, type MarketSnapshot } from '../content/market';

export interface MarketPoint {
  date: string; // YYYY-MM-DD
  close: number;
}

export interface MarketSeries {
  ticker: string;
  source: 'live' | 'snapshot';
  synthetic?: boolean;
  /** Oldest first. */
  points: MarketPoint[];
}

interface CacheEntry {
  /** Local calendar date of the last fetch attempt, successful or not. */
  attemptedOn: string;
  /** Last successfully fetched live series, if any. */
  series?: MarketSeries;
  /** Local calendar date `series` was fetched. */
  fetchedOn?: string;
}

export const API_KEY_STORAGE = 'quartermaster-alphavantage-key';
const cacheKey = (ticker: string) => `quartermaster-market-${ticker}`;

export interface MarketDeps {
  fetch: typeof fetch;
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | undefined;
  /** Local calendar date, YYYY-MM-DD. */
  today: () => string;
  apiKey: () => string | undefined;
}

function localDate(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function browserStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

export function getApiKey(): string | undefined {
  const stored = browserStorage()?.getItem(API_KEY_STORAGE)?.trim();
  return stored || import.meta.env?.VITE_ALPHAVANTAGE_KEY || undefined;
}

/** Save (or with null/empty, clear) the player's Alpha Vantage key. */
export function setApiKey(key: string | null): void {
  const storage = browserStorage();
  if (!storage) return;
  if (key?.trim()) storage.setItem(API_KEY_STORAGE, key.trim());
  else storage.removeItem(API_KEY_STORAGE);
}

const defaultDeps = (): MarketDeps => ({
  fetch: (...args) => fetch(...args),
  storage: browserStorage(),
  today: () => localDate(),
  apiKey: getApiKey,
});

function readCache(deps: MarketDeps, ticker: string): CacheEntry | undefined {
  try {
    const raw = deps.storage?.getItem(cacheKey(ticker));
    return raw ? (JSON.parse(raw) as CacheEntry) : undefined;
  } catch {
    return undefined;
  }
}

function writeCache(deps: MarketDeps, ticker: string, entry: CacheEntry): void {
  try {
    deps.storage?.setItem(cacheKey(ticker), JSON.stringify(entry));
  } catch {
    // Storage full or blocked: playing on without the cache is fine.
  }
}

export function snapshotSeries(ticker: string): MarketSeries {
  const snap: MarketSnapshot | undefined = MARKET_SNAPSHOTS[ticker];
  if (!snap) throw new Error(`No bundled market snapshot for ${ticker}`);
  return { ticker, source: 'snapshot', synthetic: snap.synthetic, points: snap.points };
}

/** Parse an Alpha Vantage TIME_SERIES_DAILY response. Returns undefined on errors / rate-limit notes. */
export function parseAlphaVantage(ticker: string, body: unknown): MarketSeries | undefined {
  const series = (body as Record<string, unknown> | null)?.['Time Series (Daily)'] as
    | Record<string, Record<string, string>>
    | undefined;
  if (!series || typeof series !== 'object') return undefined;
  const points = Object.entries(series)
    .map(([date, v]) => ({ date, close: Number(v['4. close']) }))
    .filter((p) => Number.isFinite(p.close) && p.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  return points.length >= 2 ? { ticker, source: 'live', points } : undefined;
}

async function fetchLive(deps: MarketDeps, ticker: string, key: string): Promise<MarketSeries | undefined> {
  const url =
    'https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&outputsize=compact' +
    `&symbol=${encodeURIComponent(ticker)}&apikey=${encodeURIComponent(key)}`;
  try {
    const res = await deps.fetch(url);
    if (!res.ok) return undefined;
    return parseAlphaVantage(ticker, await res.json());
  } catch {
    return undefined;
  }
}

/** Best available series for a ticker. Never throws for a ticker with a bundled snapshot. */
export async function loadMarketSeries(ticker: string, deps: MarketDeps = defaultDeps()): Promise<MarketSeries> {
  const today = deps.today();
  const cached = readCache(deps, ticker);
  if (cached?.series && cached.fetchedOn === today) return cached.series;

  const key = deps.apiKey();
  if (key && cached?.attemptedOn !== today) {
    const live = await fetchLive(deps, ticker, key);
    if (live) {
      writeCache(deps, ticker, { attemptedOn: today, fetchedOn: today, series: live });
      return live;
    }
    writeCache(deps, ticker, { ...cached, attemptedOn: today });
  }
  return cached?.series ?? snapshotSeries(ticker);
}

/**
 * Turn a series into the engine's per-day signal: the most recent `lengthDays` closes. A series
 * shorter than the game is extended by bouncing back and forth through it, so prices stay continuous.
 */
export function toMarketSignal(series: MarketSeries, lengthDays: number): MarketSignal {
  const n = series.points.length;
  if (n === 0) throw new Error(`Empty market series for ${series.ticker}`);
  let idx: number[];
  if (n >= lengthDays) {
    idx = Array.from({ length: lengthDays }, (_, i) => n - lengthDays + i);
  } else {
    const period = Math.max(1, 2 * (n - 1));
    idx = Array.from({ length: lengthDays }, (_, i) => {
      const k = i % period;
      return k < n ? k : period - k;
    });
  }
  const points = idx.map((i) => series.points[i]);
  return {
    ticker: series.ticker,
    source: series.source,
    ...(series.synthetic ? { synthetic: true } : {}),
    firstDate: points[0].date,
    lastDate: points[points.length - 1].date,
    values: points.map((p) => p.close),
  };
}
