import { useState, type ReactNode } from 'react';
import type { TermKey } from '../glossary';
import { useKpiSummary } from '../hooks';
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
export function KpiPanel() {
  const [window, setWindow] = useState<number | undefined>(undefined);
  const k = useKpiSummary(window);
  if (!k) return null;
  const dos = Math.round(k.daysOfSupply * 10) / 10;

  return (
    <Panel
      title="The quartermaster’s ledger"
      flavour="How well the army is kept, as the Lord Marshal reckons it."
      actions={
        <div className="seg-toggle" role="group" aria-label="KPI window">
          <button type="button" className={`btn btn-small ${window === undefined ? 'on' : ''}`} aria-pressed={window === undefined} onClick={() => setWindow(undefined)}>
            Campaign
          </button>
          <button type="button" className={`btn btn-small ${window === 7 ? 'on' : ''}`} aria-pressed={window === 7} onClick={() => setWindow(7)}>
            Last 7 days
          </button>
        </div>
      }
    >
      <div className="kpi-grid">
        <Tile
          k="serviceLevel"
          label="Service level"
          value={pct(k.serviceLevel)}
          hint={k.serviceLevel >= 0.98 ? 'Every bowl filled.' : k.serviceLevel >= 0.9 ? 'A few went without.' : 'The men are going hungry.'}
        />
        <Tile k="daysOfSupply" label="Days of supply" value={`${dos} d`} hint={dos < 3 ? 'Living hand to mouth.' : dos > 14 ? 'Stores piled high.' : 'A sensible cushion.'} />
        <Tile k="spoilage" label="Spoilage" value={Math.round(k.spoiled).toLocaleString('en-GB')} hint={k.spoiled > 0 ? 'Units thrown to the pigs.' : 'Nothing rotted.'} />
        <Tile k="swape" label="SWAPE" value={pct(k.swape)} hint={k.swape <= 0.2 ? 'A sharp-eyed clerk.' : k.swape <= 0.4 ? 'Rough reckoning.' : 'Guesswork.'} />
        <Tile
          k="bias"
          label="Bias"
          value={signedPct(k.bias)}
          hint={Math.abs(k.bias) <= 0.05 ? 'Leans neither way.' : k.bias > 0 ? 'Forecasting too much.' : 'Forecasting too little.'}
        />
      </div>
    </Panel>
  );
}
