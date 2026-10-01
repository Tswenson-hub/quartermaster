import { KpiPanel } from '../components/KpiPanel';
import { Panel } from '../components/Panel';
import { RankBadge } from '../components/RankBadge';
import { fmtDay } from '../format';
import { useGame, useGameActions, useLetterTexts, useRank } from '../hooks';
import { useUiStore } from '../uiStore';

/** End of campaign: completed, or dismissed after falling below the lowest rank. */
export function GameOverScreen({ onReview }: { onReview: () => void }) {
  const game = useGame();
  const rank = useRank();
  const letters = useLetterTexts();
  const { quitGame } = useGameActions();
  const resetCampaign = useUiStore((s) => s.resetCampaign);
  if (!game || !rank) return null;
  const lost = game.status === 'lost';
  const won = game.battles.filter((b) => b.won).length;
  const dismissal = [...letters].reverse().find(({ letter }) => letter.kind === 'game-over')?.text;

  return (
    <div className="stack" data-testid="game-over">
      <Panel
        className={`game-over ${lost ? 'lost' : 'complete'}`}
        title={lost ? 'Dismissed from service' : 'Campaign complete'}
        flavour={
          lost
            ? 'The Lord Marshal has taken your seal. Another will keep the stores.'
            : 'The campaign is over and the army stands. Your ledger goes to the King.'
        }
      >
        <div className="game-over-rank">
          <RankBadge level={Math.max(0, rank.level)} size={48} />
          <div>
            <div className="muted">Final rank</div>
            <div className="game-over-title">{rank.title}</div>
          </div>
          <div>
            <div className="muted">Battles</div>
            <div className="game-over-title">
              {won} won · {game.battles.length - won} lost
            </div>
          </div>
          <div>
            <div className="muted">Days served</div>
            <div className="game-over-title">
              {game.today} of {game.lengthDays}
            </div>
          </div>
        </div>
        {dismissal && <p className="letter-body">{dismissal.body}</p>}
        {game.battles.length > 0 && (
          <ul className="plain-list battle-list">
            {game.battles.map((b) => (
              <li key={b.battlePlanId}>
                <span className={`pill ${b.won ? 'pill-won' : 'pill-lost'}`}>{b.won ? 'won' : 'lost'}</span>{' '}
                {game.battlePlans.find((p) => p.id === b.battlePlanId)?.title ?? b.battlePlanId}{' '}
                <span className="muted">
                  · {fmtDay(b.day)} · {Math.round(b.serviceLevel * 100)}% supplied
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onReview}>
            Review the ledger
          </button>
          <button
            type="button"
            className="btn btn-primary"
            data-testid="new-campaign"
            onClick={() => {
              quitGame();
              resetCampaign();
            }}
          >
            New campaign
          </button>
        </div>
      </Panel>
      <KpiPanel />
    </div>
  );
}
