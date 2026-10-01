import { useState, type ReactNode } from 'react';
import type { TermKey } from '../glossary';
import { commandDays, useGame, useKpiSummary } from '../hooks';
import { Panel } from './Panel';
import { Term } from './Term';

const pct = (f: number) => `${Math.round(f * 1000) / 10}%`;
const signedPct = (f: number) => `${f > 0 ? '+' : f < 0 ? '−' : ''}${Math.round(Math.abs(f) * 1000) / 10}%`;

function Tile({ k, label, value, hint, testId }: { k: TermKey; label: string; value: ReactNode; hint: string; testId?: string }) {
  return (
    <div className="kpi-tile">
      <div className="kpi-label">
        <Term k={k}>{label}</Term>
      </div>
      <div className="kpi-value" data-testid={testId}>
        {value}
      </div>
      <div className="kpi-hint">{hint}</div>
    </div>
  );
}

/** Campaign KPIs (RELEX_RULES §10), computed by the engine via selectKpiSummary. */
type KpiWindow = 'command' | 'week' | 'all';

export function KpiPanel() {
  const game = useGame();
  const [win, setWin] = useState<KpiWindow>('command');
  const days = game ? commandDays(game) : 0;
  const inherited = !!game && game.startDay > 0;
  // selectKpiSummary(game, n) uses the last n KPI rows; with no days in command yet, nothing is the player's.
  const lastDays = win === 'all' ? undefined : win === 'week' ? 7 : inherited ? Math.max(days, 0) : undefined;
  const k = useKpiSummary(lastDays === 0 ? undefined : lastDays);
  if (!k) return null;
  const empty = win === 'command' && inherited && days === 0;
  const dos = Math.round(k.daysOfSupply * 10) / 10;
  const dosText = !Number.isFinite(dos) || dos > 999 ? '999+ d' : `${dos} d`;
  const windows: [KpiWindow, string][] = [
    ['command', inherited ? 'Your command' : 'Campaign'],
    ['week', 'Last 7 days'],
    ...(inherited ? ([['all', 'Inherited record']] as [KpiWindow, string][]) : []),
  ];

  return (
    <Panel
      testId="kpi-panel"
      title="The quartermaster’s ledger"
      flavour="How well the army is kept, as the Lord Marshal reckons it."
      actions={
        <div className="seg-toggle" role="group" aria-label="KPI window">
          {windows.map(([id, label]) => (
            <button key={id} type="button" className={`btn btn-small ${win === id ? 'on' : ''}`} aria-pressed={win === id} onClick={() => setWin(id)}>
              {label}
            </button>
          ))}
        </div>
      }
    >
      {empty ? (
        <p className="empty">No days under your command yet. End your first day, or look at the inherited record.</p>
      ) : (
      <div className="kpi-grid">
        <Tile
          k="serviceLevel"
          label="Service level"
          value={pct(k.serviceLevel)}
          hint={k.serviceLevel >= 0.98 ? 'Every bowl filled.' : k.serviceLevel >= 0.9 ? 'A few went without.' : 'The men are going hungry.'}
        />
        <Tile k="daysOfSupply" label="Days of supply" value={dosText} hint={dos < 3 ? 'Living hand to mouth.' : dos > 14 ? 'Stores piled high.' : 'A sensible cushion.'} />
        <Tile k="spoilage" label="Spoilage" value={Math.round(k.spoiled).toLocaleString('en-GB')} hint={k.spoiled > 0 ? 'Units thrown to the pigs.' : 'Nothing rotted.'} />
        <Tile k="swape" label="SWAPE" value={pct(k.swape)} hint={k.swape <= 0.2 ? 'A sharp-eyed clerk.' : k.swape <= 0.4 ? 'Rough reckoning.' : 'Guesswork.'} />
        <Tile
          k="bias"
          label="Bias"
          value={signedPct(k.bias)}
          hint={Math.abs(k.bias) <= 0.05 ? 'Leans neither way.' : k.bias > 0 ? 'Forecasting too much.' : 'Forecasting too little.'}
        />
      </div>
      )}
    </Panel>
  );
}
