import { useState } from 'react';
import type { ForecastOverride, Item } from '../../engine/types';
import { fmtDay, fmtQty, weekdayName } from '../format';
import { useGameActions, type PlanningView } from '../hooks';
import { useUiStore } from '../uiStore';
import { Panel } from './Panel';
import { Term } from './Term';

const GRID_DAYS = 21;

/** Every override edit regenerates proposals, which clears decisions and draft quantities. */
function useOverrideActions() {
  const { setForecastOverride, deleteOverride } = useGameActions();
  const clearDrafts = useUiStore((s) => s.clearDrafts);
  return {
    setForecastOverride: (...a: Parameters<typeof setForecastOverride>) => {
      setForecastOverride(...a);
      clearDrafts();
    },
    deleteOverride: (...a: Parameters<typeof deleteOverride>) => {
      deleteOverride(...a);
      clearDrafts();
    },
  };
}

/** Editable day cells for the coming weeks. A typed number becomes that day's forecast. */
export function ForecastGrid({ view, item }: { view: PlanningView; item: Item }) {
  const { setForecastOverride } = useOverrideActions();
  const days = view.points.filter((p) => p.day >= view.today).slice(0, GRID_DAYS);
  const lead = ((days[0]?.day ?? 0) % 7 + 7) % 7; // blank cells before the first weekday
  const commit = (day: number, raw: string, current: number) => {
    const qty = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(qty) || qty < 0 || Math.round(qty) === Math.round(current)) return;
    setForecastOverride({ itemId: view.itemId, depotId: view.depotId, day, qty: Math.round(qty) });
  };

  return (
    <Panel
      title={
        <>
          Day by day <Term k="forecast">forecast</Term>
        </>
      }
      flavour={`Type over the clerk’s reckoning (${item.unit}s per day). Your figure becomes the forecast for that day until you delete it.`}
    >
      <div className="fc-grid" role="grid" aria-label="Daily forecast">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <div key={d} className="fc-head" role="columnheader">
            {d}
          </div>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <div key={`pad-${i}`} className="fc-pad" />
        ))}
        {days.map((p) => (
          <label key={p.day} className={`fc-cell ${p.overridden ? 'overridden' : ''} ${p.day === view.today ? 'today' : ''}`}>
            <span className="fc-day">
              {weekdayName(p.day)} {p.day}
            </span>
            <input
              key={`${p.day}:${p.forecast}`}
              type="number"
              min={0}
              defaultValue={Math.round(p.forecast)}
              aria-label={`Forecast for ${fmtDay(p.day)}`}
              data-testid="forecast-cell"
              onBlur={(e) => commit(p.day, e.target.value, p.forecast)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') {
                  e.currentTarget.value = String(Math.round(p.forecast));
                  e.currentTarget.blur();
                }
              }}
            />
            <span className="fc-system" title="The clerk’s forecast (baseline + battle-plan uplift)">
              {p.overridden ? `clerk ${fmtQty(p.system)}` : ' '}
            </span>
          </label>
        ))}
      </div>
      <p className="muted small chart-note">
        Gold cells carry your forecast. Changing a forecast redrafts today’s proposals and clears decisions already made.
      </p>
    </Panel>
  );
}

function describe(o: ForecastOverride, unit: string) {
  const range = o.from === o.to ? fmtDay(o.from) : `${fmtDay(o.from)} – ${fmtDay(o.to)}`;
  if (o.mode === 'aggregate') return { what: `${fmtQty(o.value)} ${unit}s in total, broken out by the clerk`, range };
  if (o.mode === 'factor') return { what: `clerk’s forecast × ${o.value}`, range };
  return { what: `${fmtQty(o.value)} ${unit}s a day`, range };
}

/** Range-total entry plus the list of active overrides with delete. */
export function OverridePanel({ view, item }: { view: PlanningView; item: Item }) {
  const { setForecastOverride, deleteOverride } = useOverrideActions();
  // Default range: the next full Monday–Sunday week.
  const nextMon = view.today + ((7 - (((view.today % 7) + 7) % 7)) % 7 || 7);
  const [from, setFrom] = useState(nextMon);
  const [to, setTo] = useState(nextMon + 6);
  const [total, setTotal] = useState('');
  const current = view.points.filter((p) => p.day >= from && p.day <= to).reduce((a, p) => a + p.forecast, 0);
  const dayOptions = view.points.filter((p) => p.day >= view.today).map((p) => p.day);
  const { itemId, depotId, overrides } = view;

  return (
    <Panel title="Your forecast" flavour="Overrule the clerk when you know better.">
      {overrides.length > 0 ? (
        <p className="user-fc-flag">
          <span className="user-fc-dot" aria-hidden /> A user forecast is active. It replaces the clerk’s forecast on its
          days, battle-plan uplift included, until you delete it.
        </p>
      ) : (
        <p className="muted small">No overrides. The clerk’s forecast (smoothed history plus battle-plan uplift) stands.</p>
      )}

      <form
        className="agg-form"
        onSubmit={(e) => {
          e.preventDefault();
          const t = Number(total);
          if (total.trim() === '' || !Number.isFinite(t) || t < 0 || to < from) return;
          setForecastOverride({ itemId, depotId, from, to, total: Math.round(t) });
          setTotal('');
        }}
      >
        <div className="agg-title">Set a total for a stretch of days</div>
        <label>
          From
          <select value={from} onChange={(e) => setFrom(Number(e.target.value))}>
            {dayOptions.map((d) => (
              <option key={d} value={d}>
                {fmtDay(d)}
              </option>
            ))}
          </select>
        </label>
        <label>
          to
          <select value={to} onChange={(e) => setTo(Number(e.target.value))}>
            {dayOptions
              .filter((d) => d >= from)
              .map((d) => (
                <option key={d} value={d}>
                  {fmtDay(d)}
                </option>
              ))}
          </select>
        </label>
        <label>
          total
          <input
            type="number"
            min={0}
            value={total}
            placeholder={fmtQty(current)}
            onChange={(e) => setTotal(e.target.value)}
            aria-label="Total forecast for the range"
          />
          {item.unit}s
        </label>
        <button type="submit" className="btn btn-small" disabled={total.trim() === '' || to < from}>
          Break out
        </button>
        <p className="muted small agg-hint">
          Currently {fmtQty(current)} over {to - from + 1} days. The total is spread across the days in the same shape as
          the clerk’s forecast.
        </p>
      </form>

      {overrides.length > 0 && (
        <ul className="override-list plain-list">
          {[...overrides].reverse().map((o) => {
            const d = describe(o, item.unit);
            return (
              <li key={`${o.from}-${o.to}-${o.mode}`} className="override-row">
                <span className="user-fc-dot" aria-hidden />
                <span className="override-text">
                  <strong>{d.range}</strong> · {d.what}
                </span>
                <button
                  type="button"
                  className="btn btn-small btn-ghost"
                  onClick={() => deleteOverride({ itemId, depotId, from: o.from, to: o.to })}
                  aria-label={`Delete override ${d.range}`}
                >
                  Delete
                </button>
              </li>
            );
          })}
          {overrides.length > 1 && (
            <li>
              <button type="button" className="btn btn-small btn-ghost" onClick={() => deleteOverride({ itemId, depotId })}>
                Delete all overrides
              </button>
            </li>
          )}
        </ul>
      )}
    </Panel>
  );
}
