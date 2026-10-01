import type { ExceptionKind, PlanningException } from '../../engine/types';
import { ItemIcon } from '../components/ItemIcon';
import { KpiPanel } from '../components/KpiPanel';
import { TakeoverNote } from '../components/TakeoverNote';
import { Panel } from '../components/Panel';
import { Term } from '../components/Term';
import { fmtDay, fmtQty } from '../format';
import { useExceptionsToday, useGame, useLetterTexts } from '../hooks';
import { LetterSeal } from './LettersScreen';
import { useUiStore } from '../uiStore';

const KIND: Record<ExceptionKind, { label: string; severity: 'critical' | 'serious' | 'warning' | 'info' }> = {
  'stockout-risk': { label: 'Stockout risk', severity: 'critical' },
  'below-mop': { label: 'Below MOP', severity: 'serious' },
  'vendor-min-shortfall': { label: 'Vendor minimum short', severity: 'warning' },
  'forecast-deviation': { label: 'Forecast off', severity: 'warning' },
  'delivery-late': { label: 'Late wagon', severity: 'serious' },
  'over-budget': { label: 'Over budget', severity: 'critical' },
  spoilage: { label: 'Spoilage', severity: 'warning' },
  stockout: { label: 'Stockout', severity: 'critical' },
  'dc-short': { label: 'Depot short-shipped', severity: 'serious' },
};
const SEVERITY_ICON = { critical: '!!', serious: '!', warning: '?', info: 'i' };
const SEVERITY_RANK = { critical: 0, serious: 1, warning: 2, info: 3 };

export function DispatchScreen() {
  const game = useGame();
  const today = useExceptionsToday();
  const { go, planItem, openLetter } = useUiStore();
  const read = useUiStore((s) => s.readLetters);
  const commandLetters = useLetterTexts().filter(({ letter }) => !read[letter.id]);
  if (!game) return null;

  const earlier = game.exceptions.filter((e) => e.day < game.today).sort((a, b) => b.day - a.day).slice(0, 8);
  const arrivals = game.openOrders.filter((o) => o.deliveryOn === game.today + 1);
  const letters = game.battlePlans.filter((b) => b.announcedOn === game.today);
  const byKind = new Map<ExceptionKind, PlanningException[]>();
  for (const e of today) byKind.set(e.kind, [...(byKind.get(e.kind) ?? []), e]);
  const groups = [...byKind].sort(([a], [b]) => SEVERITY_RANK[KIND[a].severity] - SEVERITY_RANK[KIND[b].severity]);

  const act = (e: PlanningException) => {
    if (e.itemId && e.depotId) planItem(e.itemId, e.depotId);
    else if (e.kind === 'vendor-min-shortfall') go('proposals');
    else if (e.kind === 'over-budget') go('treasury');
  };

  const row = (e: PlanningException, i: number) => {
    const k = KIND[e.kind];
    const item = e.itemId ? game.items[e.itemId] : undefined;
    const clickable = !!(e.itemId && e.depotId) || e.kind === 'vendor-min-shortfall' || e.kind === 'over-budget';
    return (
      <li key={i} className={`dispatch-row sev-${k.severity}`}>
        <span className={`sev-badge sev-${k.severity}`} aria-hidden>
          {SEVERITY_ICON[k.severity]}
        </span>
        <ItemIcon item={item} size={28} />
        <div className="dispatch-text">
          <div className="dispatch-head">
            <strong>{k.label}</strong>
            {item && <span> · {item.name}</span>}
            {e.depotId && <span className="muted"> · {game.depots[e.depotId]?.name}</span>}
            {e.vendorId && <span className="muted"> · {game.vendors[e.vendorId]?.name}</span>}
          </div>
          <div className="dispatch-msg">{e.message}</div>
        </div>
        <span className="muted dispatch-day">{fmtDay(e.day)}</span>
        {clickable && (
          <button type="button" className="btn btn-small" onClick={() => act(e)}>
            Review
          </button>
        )}
      </li>
    );
  };

  return (
    <div className="stack">
    <TakeoverNote />
    <KpiPanel />
    <div className="screen-grid dispatch-grid">
      <Panel
        title={
          <>
            Dispatch — <Term k="exception">exceptions</Term>
          </>
        }
        flavour="Messengers wait outside the tent. Deal with the worst news first."
      >
        {groups.length ? (
          groups.map(([kind, list], gi) => (
            <details key={kind} className="dispatch-group" open={gi === 0 || list.length <= 3}>
              <summary>
                <span className={`sev-badge sev-${KIND[kind].severity}`} aria-hidden>
                  {SEVERITY_ICON[KIND[kind].severity]}
                </span>
                <strong>{KIND[kind].label}</strong> <span className="muted">× {list.length}</span>
              </summary>
              <ul className="dispatch-list">{list.map(row)}</ul>
            </details>
          ))
        ) : (
          <p className="empty">No riders this morning. All stores stand above their Must Order Points.</p>
        )}
        {earlier.length > 0 && (
          <details className="dispatch-earlier">
            <summary>Earlier reports ({earlier.length})</summary>
            <ul className="dispatch-list">{earlier.map(row)}</ul>
          </details>
        )}
      </Panel>

      <div className="stack">
        {commandLetters.length > 0 && (
          <Panel title="Letters from command" flavour="Unread, on your field desk.">
            {commandLetters.map(({ letter, text }) => (
              <button key={letter.id} type="button" className="mini-letter" onClick={() => go('letters')}>
                <LetterSeal letter={letter} size={28} />
                <span>{text.subject}</span>
              </button>
            ))}
          </Panel>
        )}
        {letters.length > 0 && (
          <Panel title="A sealed letter arrives" flavour="Bearing the Marshal’s seal.">
            {letters.map((l) => (
              <button
                key={l.id}
                type="button"
                className="mini-letter"
                onClick={() => {
                  openLetter(l.id);
                  go('battle');
                }}
              >
                <span className="wax-seal small" aria-hidden />
                <span>{l.title}</span>
              </button>
            ))}
          </Panel>
        )}
        <Panel title="Wagons due tomorrow" flavour="Deliveries arriving at first light.">
          {arrivals.length ? (
            <ul className="plain-list">
              {arrivals.map((o) => (
                <li key={o.id} className="arrival">
                  <ItemIcon item={game.items[o.itemId]} size={24} />
                  <span>
                    {fmtQty(o.qty)} {game.items[o.itemId]?.unit} {game.items[o.itemId]?.name}
                  </span>
                  <span className="muted">
                    {game.vendors[o.vendorId]?.name} → {game.depots[o.depotId]?.name}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty">The road is empty tomorrow.</p>
          )}
        </Panel>
      </div>
    </div>
    </div>
  );
}
