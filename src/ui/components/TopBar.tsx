import { useGame, useGameActions, useMarketInfo, useRank, useScenario, useScenarioOver, useServiceLevel, useTreasury } from '../hooks';
import { RankBadge } from './RankBadge';
import { fmtSilver, weekdayName } from '../format';
import { useUiStore } from '../uiStore';
import { Term } from './Term';

export function TopBar() {
  const game = useGame();
  const scenario = useScenario();
  const over = useScenarioOver();
  const treasury = useTreasury();
  const serviceLevel = useServiceLevel();
  const { endDay, quitGame } = useGameActions();
  const clearDrafts = useUiStore((s) => s.clearDrafts);
  const resetCampaign = useUiStore((s) => s.resetCampaign);
  const go = useUiStore((s) => s.go);
  const rank = useRank();
  const market = useMarketInfo();
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

      {rank && (
        <button type="button" className="rank-chip" onClick={() => go('letters')} data-testid="rank" title={rank.flavour}>
          <RankBadge level={Math.max(0, rank.level)} size={32} />
          <span className="rank-chip-text">
            <span className="rank-chip-label">
              <Term k="rank">Rank</Term>
            </span>
            <span className="rank-chip-title">{rank.title}</span>
          </span>
        </button>
      )}

      <dl className="topbar-stats">
        <div className="stat">
          <dt>Day</dt>
          <dd>
            {weekdayName(game.today)} <span data-testid="today">{game.today}</span>
            <span className="muted"> / {game.lengthDays}</span>
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
          <dt>Treasury</dt>
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
        {market && (
          <div className="stat">
            <dt>
              <Term k="market">Market</Term>
            </dt>
            <dd className="market-chip" data-testid="market">
              <span className="market-ticker">{market.ticker}</span>
              <span className={`market-src ${market.source}`}>{market.source}</span>
              {market.synthetic && (
                <span className="market-src synthetic" title="Generated placeholder prices, not real market data">
                  synthetic
                </span>
              )}
            </dd>
          </div>
        )}
      </dl>

      <div className="topbar-actions">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            if (confirm('Abandon this campaign? Your progress will be lost.')) {
              quitGame();
              resetCampaign();
            }
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
