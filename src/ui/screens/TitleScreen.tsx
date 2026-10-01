import { useState } from 'react';
import type { Difficulty } from '../../engine/types';
import { CampScene } from '../components/CampScene';
import { Term } from '../components/Term';
import { getApiKey, setApiKey, useDifficultyOptions, useGameActions, useScenarioList, useStarting } from '../hooks';
import { useUiStore } from '../uiStore';

export function TitleScreen() {
  const scenarios = useScenarioList();
  const options = useDifficultyOptions();
  const starting = useStarting();
  const { newGame } = useGameActions();
  const go = useUiStore((s) => s.go);
  const resetCampaign = useUiStore((s) => s.resetCampaign);
  const [difficulty, setDifficulty] = useState<Difficulty>(options.find((o) => o.id === 'normal')?.id ?? options[0]?.id ?? 'normal');

  return (
    <main className="title-screen">
      <div className="title-card panel">
        <CampScene className="title-camp" />
        <h1 className="title-logo">Quartermaster</h1>
        <p className="title-sub">
          The army marches on its stomach. Keep the stores above the <strong>Must Order Point</strong> on the second
          delivery day, mind the Treasurer, and the banners stay high.
        </p>

        <h2 className="title-choose">Difficulty</h2>
        <div className="difficulty-list" role="radiogroup" aria-label="Difficulty">
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={difficulty === o.id}
              className={`difficulty-card ${difficulty === o.id ? 'on' : ''}`}
              data-testid={`difficulty-${o.id}`}
              onClick={() => setDifficulty(o.id)}
            >
              <span className="difficulty-label">{o.title}</span>
              <span className="difficulty-flavour">{o.description}</span>
              <span className="difficulty-meta">
                <Term k="market">Market</Term> {o.ticker} · budget ×{o.budgetFactor}
              </span>
            </button>
          ))}
        </div>

        <MarketKeySettings />

        <h2 className="title-choose">Choose a campaign</h2>
        <ul className="scenario-list">
          {scenarios.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className="scenario-card"
                data-testid={`start-scenario-${s.id}`}
                disabled={starting}
                onClick={async () => {
                  resetCampaign();
                  await newGame(s, difficulty);
                  go('dispatch');
                }}
              >
                <span className="scenario-title">{s.title}</span>
                <span className="scenario-brief">{s.briefing}</span>
                <span className="scenario-meta">
                  {s.lengthDays} days · teaches {s.teaches.join(', ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <p className="credits muted small">
          Icons: Raven Fantasy Icons by Clockwork Raven Studios · Tiles: Kenney (kenney.nl) · Fonts: Inter, IM Fell
          English
        </p>
      </div>
      {starting && (
        <div className="starting-overlay" role="status" aria-live="polite">
          <div className="starting-card panel">
            <span className="spinner" aria-hidden />
            Riders sent to the market for the latest prices…
          </div>
        </div>
      )}
    </main>
  );
}

/** Optional Alpha Vantage key, kept only in this browser. */
function MarketKeySettings() {
  const [saved, setSaved] = useState(() => getApiKey() ?? '');
  const [draft, setDraft] = useState(saved);
  const [open, setOpen] = useState(false);

  return (
    <details className="market-settings" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        Market data:{' '}
        {saved ? <strong>live (your Alpha Vantage key)</strong> : <strong>bundled snapshot</strong>}
      </summary>
      <p className="muted small">
        Soldiers’ demand follows a real stock’s daily closing prices, scaled to the size of your camps. With a free{' '}
        <a href="https://www.alphavantage.co/support/#api-key" target="_blank" rel="noreferrer">
          Alpha Vantage key
        </a>{' '}
        the game fetches fresh prices at most once a day. Without one, it uses the prices bundled with the game. The key
        is stored only in this browser.
      </p>
      <form
        className="key-form"
        onSubmit={(e) => {
          e.preventDefault();
          const k = draft.trim();
          setApiKey(k || null);
          setSaved(k);
        }}
      >
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Alpha Vantage API key"
          aria-label="Alpha Vantage API key"
        />
        <button type="submit" className="btn btn-small" disabled={draft.trim() === saved}>
          Save
        </button>
        {saved && (
          <button
            type="button"
            className="btn btn-small btn-ghost"
            onClick={() => {
              setApiKey(null);
              setSaved('');
              setDraft('');
            }}
          >
            Forget key
          </button>
        )}
      </form>
    </details>
  );
}
