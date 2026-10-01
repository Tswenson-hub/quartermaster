import type { BattlePlan, GameState } from '../../engine/types';
import { ItemIcon } from '../components/ItemIcon';
import { Panel } from '../components/Panel';
import { Term } from '../components/Term';
import { fmtDay } from '../format';
import { useGame } from '../hooks';
import { useUiStore } from '../uiStore';

function status(b: BattlePlan, today: number) {
  if (today > b.end) return { label: 'Fought', cls: 'past' };
  if (today >= b.start) return { label: 'Under way', cls: 'active' };
  const d = b.start - today;
  return { label: `In ${d} day${d === 1 ? '' : 's'}`, cls: 'upcoming' };
}

export function BattlePlansScreen() {
  const game = useGame();
  if (!game) return null;
  // Only letters that have reached the player. Actual uplift is never shown (fog of war).
  const letters = game.battlePlans.filter((b) => b.announcedOn <= game.today).sort((a, b) => b.start - a.start);

  return (
    <div className="stack">
      <Panel
        title="Battle plans"
        flavour={
          <>
            Letters from the generals. Each promises a surge in demand — an <Term k="uplift">event uplift</Term> — for
            certain days. Generals are not always right.
          </>
        }
      >
        {letters.length === 0 && <p className="empty">No letters have reached the tent. The front is quiet.</p>}
      </Panel>
      <div className="letter-grid">
        {letters.map((b) => (
          <Letter key={b.id} plan={b} game={game} />
        ))}
      </div>
    </div>
  );
}

function Letter({ plan, game }: { plan: BattlePlan; game: GameState }) {
  const opened = useUiStore((s) => !!s.openedLetters[plan.id]);
  const openLetter = useUiStore((s) => s.openLetter);
  const planItem = useUiStore((s) => s.planItem);
  const st = status(plan, game.today);

  if (!opened) {
    return (
      <button type="button" className="envelope" onClick={() => openLetter(plan.id)}>
        <span className="envelope-flap" aria-hidden />
        <span className="wax-seal" aria-hidden />
        <span className="envelope-to">To the Quartermaster</span>
        <span className="envelope-hint">Received {fmtDay(plan.announcedOn)} · break the seal</span>
      </button>
    );
  }

  return (
    <article className={`letter letter-${st.cls}`}>
      <header className="letter-head">
        <h3>{plan.title}</h3>
        <span className={`pill pill-${st.cls}`}>{st.label}</span>
      </header>
      <p className="letter-body">{plan.letter}</p>
      <dl className="letter-facts">
        <dt>When</dt>
        <dd>
          {fmtDay(plan.start)} – {fmtDay(plan.end)}
        </dd>
        <dt>Where</dt>
        <dd>{plan.depotIds.map((d) => game.depots[d]?.name ?? d).join(', ')}</dd>
      </dl>
      <h4 className="letter-sub">
        Stated <Term k="uplift">uplift</Term>
      </h4>
      <ul className="uplift-list">
        {Object.entries(plan.statedUplift).map(([itemId, f]) => {
          const item = game.items[itemId];
          const depot = plan.depotIds.find((d) => game.locations.some((l) => l.itemId === itemId && l.depotId === d));
          return (
            <li key={itemId}>
              <ItemIcon item={item} size={22} />
              <span className="uplift-name">{item?.name ?? itemId}</span>
              <strong>×{f}</strong>
              {depot && (
                <button type="button" className="link small" onClick={() => planItem(itemId, depot)}>
                  plan →
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </article>
  );
}
