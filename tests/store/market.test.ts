import { describe, expect, it, vi } from 'vitest';
import { loadMarketSeries, parseAlphaVantage, toMarketSignal, type MarketDeps, type MarketSeries } from '../../src/store/market';

function avBody(closes: Record<string, number>) {
  return {
    'Meta Data': {},
    'Time Series (Daily)': Object.fromEntries(Object.entries(closes).map(([d, c]) => [d, { '4. close': String(c) }])),
  };
}

function deps(over: Partial<MarketDeps> & { body?: unknown } = {}) {
  const mem = new Map<string, string>();
  const fetchMock = vi.fn(async () => ({ ok: true, json: async () => over.body ?? avBody({ '2026-09-28': 101, '2026-09-25': 100 }) }));
  const d: MarketDeps = {
    fetch: fetchMock as unknown as typeof fetch,
    storage: { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: (k) => void mem.delete(k) },
    today: () => '2026-09-30',
    apiKey: () => 'KEY',
    ...over,
  };
  return { d, fetchMock, mem };
}

describe('parseAlphaVantage', () => {
  it('sorts oldest first and reads closes', () => {
    const s = parseAlphaVantage('KO', avBody({ '2026-09-28': 61, '2026-09-25': 60 }))!;
    expect(s.points).toEqual([
      { date: '2026-09-25', close: 60 },
      { date: '2026-09-28', close: 61 },
    ]);
    expect(s.source).toBe('live');
  });
  it('rejects rate-limit notes', () => {
    expect(parseAlphaVantage('KO', { Information: 'rate limit' })).toBeUndefined();
  });
});

describe('loadMarketSeries', () => {
  it('fetches live once per calendar day, then serves the cache', async () => {
    const { d, fetchMock } = deps();
    expect((await loadMarketSeries('KO', d)).source).toBe('live');
    expect((await loadMarketSeries('KO', d)).source).toBe('live');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to the bundled snapshot without a key, and does not fetch', async () => {
    const { d, fetchMock } = deps({ apiKey: () => undefined });
    const s = await loadMarketSeries('TSLA', d);
    expect(s.source).toBe('snapshot');
    expect(s.points.length).toBeGreaterThan(100);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('on a failed fetch uses the snapshot and does not retry the same day', async () => {
    const { d, fetchMock } = deps({ body: { Note: 'Thank you for using Alpha Vantage! rate limit' } });
    expect((await loadMarketSeries('KO', d)).source).toBe('snapshot');
    expect((await loadMarketSeries('KO', d)).source).toBe('snapshot');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("serves yesterday's live series when today's fetch fails", async () => {
    const { d, mem } = deps({ body: { Note: 'limit' } });
    mem.set(
      'quartermaster-market-KO',
      JSON.stringify({ attemptedOn: '2026-09-29', fetchedOn: '2026-09-29', series: { ticker: 'KO', source: 'live', points: [{ date: '2026-09-28', close: 5 }, { date: '2026-09-29', close: 6 }] } }),
    );
    const s = await loadMarketSeries('KO', d);
    expect(s.source).toBe('live');
    expect(s.points.at(-1)!.close).toBe(6);
  });
});

describe('toMarketSignal', () => {
  const series = (n: number): MarketSeries => ({
    ticker: 'X',
    source: 'snapshot',
    points: Array.from({ length: n }, (_, i) => ({ date: `d${i}`, close: i })),
  });
  it('takes the most recent lengthDays closes', () => {
    const m = toMarketSignal(series(10), 4);
    expect(m.values).toEqual([6, 7, 8, 9]);
    expect([m.firstDate, m.lastDate]).toEqual(['d6', 'd9']);
  });
  it('bounces through a series shorter than the game', () => {
    expect(toMarketSignal(series(3), 8).values).toEqual([0, 1, 2, 1, 0, 1, 2, 1]);
  });
});
