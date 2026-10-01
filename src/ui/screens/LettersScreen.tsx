import { useEffect, useState } from 'react';
import type { Letter } from '../../engine/types';
import { Panel } from '../components/Panel';
import { Sprite } from '../components/Sprite';
import { Term } from '../components/Term';
import { fmtDay } from '../format';
import { useLetterTexts, useRank } from '../hooks';
import { LETTER_KIND } from '../letterKinds';
import { RankBadge } from '../components/RankBadge';
import { useUiStore } from '../uiStore';

export function LetterSeal({ letter, size = 28 }: { letter: Letter; size?: number }) {
  return (
    <Sprite
      keys={[`letter.${letter.kind}`]}
      size={size}
      fallback={<span className="seal-dot" style={{ width: size, height: size, background: LETTER_KIND[letter.kind].seal }} aria-hidden />}
    />
  );
}

export function LettersScreen() {
  const letters = useLetterTexts();
  const rank = useRank();
  const read = useUiStore((s) => s.readLetters);
  const readLetter = useUiStore((s) => s.readLetter);
  const newest = [...letters].reverse();
  const [selectedId, setSelectedId] = useState<string | undefined>(
    newest.find((l) => !read[l.letter.id])?.letter.id ?? newest[0]?.letter.id,
  );
  const selected = letters.find((l) => l.letter.id === selectedId);
  useEffect(() => {
    if (selectedId) readLetter(selectedId);
  }, [selectedId, readLetter]);

  return (
    <div className="stack">
      {rank && (
        <Panel
          title={
            <span className="rank-heading">
              <RankBadge level={rank.level} size={40} />
              <span>
                {rank.title} <span className="muted">· <Term k="rank">rank</Term> {rank.level + 1}</span>
              </span>
            </span>
          }
          flavour={rank.flavour}
        >
          <dl className="rank-facts">
            <dt>Merit toward promotion</dt>
            <dd>
              <span className="merit-bar" aria-hidden>
                <span style={{ width: `${Math.max(0, Math.min(100, rank.merit * 100))}%` }} />
              </span>{' '}
              {Math.round(Math.max(0, Math.min(1, rank.merit)) * 100)}%
            </dd>
            <dt>Reprimands since last change of rank</dt>
            <dd className={rank.reprimands > 0 ? 'bad-text' : undefined}>{rank.reprimands}</dd>
            <dt>Periods over budget in a row</dt>
            <dd className={rank.overspentStreak > 0 ? 'bad-text' : undefined}>{rank.overspentStreak}</dd>
          </dl>
        </Panel>
      )}

      <div className="letters-grid">
        <Panel title="Letters from command" flavour="Reprimands, praise and news from the front." className="letters-list-panel">
          {newest.length === 0 ? (
            <p className="empty">No letters yet. Command is watching.</p>
          ) : (
            <ul className="letters-list">
              {newest.map(({ letter: l, text }) => (
                <li key={l.id}>
                  <button
                    type="button"
                    className={`letter-row ${l.id === selectedId ? 'active' : ''} ${read[l.id] ? '' : 'unread'}`}
                    onClick={() => setSelectedId(l.id)}
                    data-testid="letter-row"
                  >
                    <LetterSeal letter={l} size={24} />
                    <span className="letter-row-text">
                      <span className="letter-row-subject">{text.subject}</span>
                      <span className="muted">
                        {LETTER_KIND[l.kind].label} · {fmtDay(l.day)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {selected && (
          <article className={`letter command-letter kind-${selected.letter.kind}`}>
            <header className="letter-head">
              <h3>{selected.text.subject}</h3>
              <LetterSeal letter={selected.letter} size={40} />
            </header>
            <p className="letter-meta muted">
              From {selected.text.from} · {fmtDay(selected.letter.day)}
            </p>
            {selected.text.body.split(/\n\n+/).map((para, i) => (
              <p key={i} className="letter-body">
                {para}
              </p>
            ))}
          </article>
        )}
      </div>
    </div>
  );
}
