import { useGame, useGameActions, useScenario, useScenarioOver, useServiceLevel, useTreasury } from '../hooks';
import { fmtSilver, weekdayName } from '../format';
import { useUiStore } from '../uiStore';
import { Term } from './Term';

export function TopBar() {
  const game = useGame();
  const scenario = useScenario();
  const over = useScenarioOver();
  const treasury = useTreasury();
  const serviceLevel = useServiceLevel();
  const { endDay, newGame } = useGameActions();
  const clearDrafts = useUiStore((s) => s.clearDrafts);
  if (!game) return null;

  const morale = Math.round(game.morale);
  const moraleClass = morale >= 60 ? 'good' : morale >= 35 ? 'warn' : 'bad';
  const remaining = treasury?.remaining ?? 0;

  return (
    <header className="topbar">
      <div className="topbar-title">
        <span className="crest" aria-hidden />
        <div>
          <div className="topbar-game">Quartermaster</div>
          <div className="topbar-scenario">{scenario?.title}</div>
        </div>
      </div>

      <dl className="topbar-stats">
        <div className="stat">
          <dt>Day</dt>
          <dd>
            {weekdayName(game.today)} <span data-testid="today">{game.today}</span>
            {scenario && <span className="muted"> / {scenario.lengthDays}</span>}
          </dd>
        </div>
        <div className="stat">
          <dt>Morale</dt>
          <dd className="morale">
            <span className={`morale-bar ${moraleClass}`} aria-hidden>
              <span style={{ width: `${morale}%` }} />
            </span>
            <span data-testid="morale">{morale}</span>
          </dd>
        </div>
        <div className="stat">
          <dt>Treasury left</dt>
          <dd className={remaining < 0 ? 'bad-text' : undefined}>{fmtSilver(remaining)}</dd>
        </div>
        <div className="stat">
          <dt>
            <Term k="serviceLevel">Service level</Term>
          </dt>
          <dd>
            <span data-testid="kpi-service-level">{serviceLevel}</span>%
          </dd>
        </div>
      </dl>

      <div className="topbar-actions">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            if (confirm('Abandon this campaign? Your progress will be lost.')) newGame();
          }}
        >
          Abandon
        </button>
        <button
          type="button"
          className="btn btn-primary"
          data-testid="end-day"
          disabled={over}
          onClick={() => {
            endDay();
            clearDrafts();
          }}
        >
          {over ? 'Campaign over' : 'End Day ▸'}
        </button>
      </div>
    </header>
  );
}
