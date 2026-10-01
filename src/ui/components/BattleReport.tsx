import { useEffect, useRef } from 'react';
import { fmtDay } from '../format';
import { useGame, useLetterTexts } from '../hooks';
import { useUiStore } from '../uiStore';
import { Sprite } from './Sprite';
import { Term } from './Term';

/** Modal report for the first battle outcome the player hasn't seen yet. */
export function BattleReport() {
  const game = useGame();
  const seen = useUiStore((s) => s.seenBattles);
  const seeBattle = useUiStore((s) => s.seeBattle);
  const go = useUiStore((s) => s.go);
  const letters = useLetterTexts();
  const closeRef = useRef<HTMLButtonElement>(null);
  const outcome = game?.battles.find((b) => !seen[b.battlePlanId]);
  useEffect(() => closeRef.current?.focus(), [outcome?.battlePlanId]);
  if (!game || !outcome) return null;

  const plan = game.battlePlans.find((b) => b.id === outcome.battlePlanId);
  const letter = letters.find(
    ({ letter: l }) => l.battlePlanId === outcome.battlePlanId && (l.kind === 'battle-won' || l.kind === 'battle-lost'),
  )?.text;
  const close = () => seeBattle(outcome.battlePlanId);

  return (
    <div className="modal-backdrop" onClick={close}>
      <div
        className={`modal panel battle-report ${outcome.won ? 'won' : 'lost'}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="battle-report-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && close()}
        data-testid="battle-report"
      >
        <div className="battle-banner">
          <Sprite keys={['ui.battle']} size={48} fallback={<span className="battle-glyph" aria-hidden>⚔</span>} />
          <div>
            <div className="battle-verdict">{outcome.won ? 'Victory!' : 'Defeat'}</div>
            <h2 id="battle-report-title">{plan?.title ?? 'The battle'}</h2>
          </div>
        </div>
        <p className="battle-line">
          Decided {fmtDay(outcome.day)}. During the battle you met{' '}
          <strong>{Math.round(outcome.serviceLevel * 1000) / 10}%</strong> of the army’s needs at the front (
          <Term k="serviceLevel">service level</Term>).
        </p>
        <p className="letter-body">
          {letter?.body ??
            (outcome.won
              ? 'The banners stood, and the men fought fed and armed. Command will remember who kept the wagons rolling.'
              : 'The line broke for want of supplies. Command will remember that too.')}
        </p>
        <div className="modal-actions">
          {letter && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                close();
                go('letters');
              }}
            >
              Read the letter
            </button>
          )}
          <button ref={closeRef} type="button" className="btn btn-primary" onClick={close}>
            {outcome.won ? 'Onward' : 'Carry on'}
          </button>
        </div>
      </div>
    </div>
  );
}
