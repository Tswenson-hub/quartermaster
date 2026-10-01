#!/usr/bin/env node
// Refresh the bundled market snapshots in src/content/market/<TICKER>.json.
//
//   ALPHAVANTAGE_KEY=xxxx node scripts/fetch-market.mjs        real closes (free tier: last ~100 trading days)
//   node scripts/fetch-market.mjs --synthetic                  generated placeholder series (no key needed)
//
// The game plays offline from these snapshots when no key is set or a live fetch fails.
// Synthetic snapshots are marked `synthetic: true` and the UI labels them as such.

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TICKERS = {
  // annualised volatility and a plausible starting price, for --synthetic only
  KO: { vol: 0.15, start: 62 },
  AAPL: { vol: 0.28, start: 190 },
  TSLA: { vol: 0.6, start: 240 },
};
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'content', 'market');
const SYNTHETIC_DAYS = 260;
const SYNTHETIC_END = '2026-09-25';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function tradingDaysEndingAt(end, n) {
  const days = [];
  const d = new Date(`${end}T12:00:00Z`);
  while (days.length < n) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) days.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return days.reverse();
}

function synthetic(ticker, { vol, start }) {
  const rand = mulberry32([...ticker].reduce((h, c) => h * 31 + c.charCodeAt(0), 7));
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
  const sigma = vol / Math.sqrt(252);
  let price = start;
  const points = tradingDaysEndingAt(SYNTHETIC_END, SYNTHETIC_DAYS).map((date) => {
    price *= Math.exp(-0.5 * sigma * sigma + sigma * gauss());
    return { date, close: Math.round(price * 100) / 100 };
  });
  return {
    ticker,
    synthetic: true,
    note: `SYNTHETIC placeholder: geometric Brownian motion, ${Math.round(vol * 100)}% annual volatility. Not real ${ticker} prices. Regenerate with a key.`,
    fetchedOn: null,
    points,
  };
}

async function live(ticker, key) {
  const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&outputsize=compact&symbol=${ticker}&apikey=${key}`;
  const body = await (await fetch(url)).json();
  const series = body['Time Series (Daily)'];
  if (!series) throw new Error(`${ticker}: ${body.Note ?? body.Information ?? body['Error Message'] ?? 'no data'}`);
  const points = Object.entries(series)
    .map(([date, v]) => ({ date, close: Number(v['4. close']) }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return {
    ticker,
    synthetic: false,
    note: 'Alpha Vantage TIME_SERIES_DAILY closes (compact).',
    fetchedOn: new Date().toISOString().slice(0, 10),
    points,
  };
}

const key = process.env.ALPHAVANTAGE_KEY;
const forceSynthetic = process.argv.includes('--synthetic');
if (!key && !forceSynthetic) {
  console.error('Set ALPHAVANTAGE_KEY, or pass --synthetic to generate placeholder series.');
  process.exit(1);
}
for (const [ticker, params] of Object.entries(TICKERS)) {
  const snap = forceSynthetic ? synthetic(ticker, params) : await live(ticker, key);
  writeFileSync(join(OUT, `${ticker}.json`), JSON.stringify(snap, null, 1) + '\n');
  console.log(`${ticker}: ${snap.points.length} points ${snap.points[0].date}..${snap.points.at(-1).date}${snap.synthetic ? ' (synthetic)' : ''}`);
  if (!forceSynthetic) await sleep(15_000); // free tier: 5 requests/minute
}
