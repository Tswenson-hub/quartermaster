// Bundled market snapshots (RELEX_RULES §11), the offline fallback for live Alpha Vantage data.
// Regenerate with scripts/fetch-market.mjs. Owned by lead (src/store/market.ts reads them).
import AAPL from './AAPL.json';
import KO from './KO.json';
import TSLA from './TSLA.json';

export interface MarketSnapshot {
  ticker: string;
  /** True for generated placeholder series, not real prices. */
  synthetic: boolean;
  note: string;
  fetchedOn: string | null;
  points: { date: string; close: number }[];
}

export const MARKET_SNAPSHOTS: Record<string, MarketSnapshot> = { KO, AAPL, TSLA };
