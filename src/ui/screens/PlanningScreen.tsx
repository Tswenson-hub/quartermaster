import { useState } from 'react';
import type { GameState, ItemLocation } from '../../engine/types';
import { ItemIcon } from '../components/ItemIcon';
import { Panel } from '../components/Panel';
import { PlanningCharts } from '../components/PlanningCharts';
import { Term } from '../components/Term';
import { fmtDay, fmtQty } from '../format';
import { useGame, useGameActions, usePlanningView } from '../hooks';
import { useUiStore } from '../uiStore';

const keyOf = (l: Pick<ItemLocation, 'itemId' | 'depotId'>) => `${l.itemId}@${l.depotId}`;

export function PlanningScreen() {
  const game = useGame();
  const focus = useUiStore((s) => s.focus);
  const planItem = useUiStore((s) => s.planItem);
  if (!game || !game.locations.length) return null;
  const current = game.locations.find((l) => focus && keyOf(l) === keyOf(focus)) ?? game.locations[0];

  return (
    <div className="screen-grid planning-grid">
      <Panel title="Ledger" flavour="Every store in every camp." className="ledger">
        <div className="ledger-scroll">
          {Object.values(game.depots).map((depot) => {
            const locs = game.locations.filter((l) => l.depotId === depot.id);
            if (!locs.length) return null;
            return (
              <div key={depot.id} className="ledger-depot">
                <h3 className="ledger-depot-name">{depot.name}</h3>
                <ul className="ledger-list">
                  {locs.map((l) => {
                    const item = game.items[l.itemId];
                    const urgent = game.proposals.some((p) => p.itemId === l.itemId && p.depotId === l.depotId && p.reason === 'must');
                    return (
                      <li key={keyOf(l)}>
                        <button
                          type="button"
                          className={`ledger-row ${keyOf(l) === keyOf(current) ? 'active' : ''}`}
                          onClick={() => planItem(l.itemId, l.depotId)}
                        >
                          <ItemIcon item={item} size={24} />
                          <span className="ledger-name">{item?.name}</span>
                          {urgent && <span className="pill pill-must">must</span>}
                          <span className="ledger-qty">{fmtQty(l.onHand)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </Panel>
      <ItemDetail game={game} loc={current} key={keyOf(current)} />
    </div>
  );
}

function ItemDetail({ game, loc }: { game: GameState; loc: ItemLocation }) {
  const view = usePlanningView(loc.itemId, loc.depotId);
  const { setOverride, clearOverride } = useGameActions();
  const [factor, setFactor] = useState('1.2');
  const item = game.items[loc.itemId];
  if (!view || !item) return null;
  const { params, proposal } = view;
  const vendor = params ? game.vendors[params.vendorId] : undefined;
  const belowMop = params ? params.projectedAtD2 < params.mustOrderPoint : false;
  const overrides = game.overrides.filter((o) => o.itemId === loc.itemId && o.depotId === loc.depotId);

  return (
    <div className="stack">
      <Panel
        title={
          <span className="item-heading">
            <ItemIcon item={item} size={36} />
            <span>
              {item.name}
              <span className="muted"> at {game.depots[loc.depotId]?.name}</span>
            </span>
          </span>
        }
        flavour={`${fmtQty(loc.onHand)} ${item.unit}s in the storehouse this morning.`}
      >
        {params && (
          <p className={`verdict ${belowMop ? 'verdict-bad' : 'verdict-ok'}`}>
            {belowMop ? '⚠ ' : '✓ '}
            <Term k="projected">Projected stock</Term> just before the <Term k="d2" /> delivery ({fmtDay(params.d2)}) is{' '}
            <strong>{fmtQty(params.projectedAtD2)}</strong> — {belowMop ? 'below' : 'above'} the <Term k="mop" /> of{' '}
            <strong>{fmtQty(params.mustOrderPoint)}</strong>.{' '}
            {params.projectedAtD2 < 0 && (
              <>
                That is <Term k="shortfall">{`${fmtQty(-params.projectedAtD2)} ${item.unit}s short`}</Term>: the men go
                hungry.{' '}
              </>
            )}
            {!belowMop ? 'No order needed to stay safe.' : params.projectedAtD2 < 0 ? 'You must order today.' : 'You must order today or the men go without.'}
          </p>
        )}
        <PlanningCharts view={view} unit={item.unit} battlePlans={game.battlePlans.filter((b) => b.announcedOn <= game.today && b.depotIds.includes(loc.depotId))} />
        <p className="chart-note muted">
          Shaded days are battle-plan windows. The dot is the stock just before the D2 delivery: the level this order must
          keep above the MOP. A red bar below zero is demand that would go unmet.
        </p>
      </Panel>

      <div className="two-col">
        <Panel title="Replenishment figures" flavour="As reckoned by the clerk.">
          {params ? (
            <dl className="facts">
              <dt><Term k="safetyStock" /></dt>
              <dd>{fmtQty(params.safetyStock)}</dd>
              <dt><Term k="minimumFill" /></dt>
              <dd>{fmtQty(loc.minimumFill)}</dd>
              <dt><Term k="mop">MOP</Term> <span className="muted">must order point</span></dt>
              <dd>{fmtQty(params.mustOrderPoint)}</dd>
              <dt><Term k="cop">COP</Term> <span className="muted">can order point</span></dt>
              <dd>{fmtQty(params.canOrderPoint)}</dd>
              <dt>Supplier</dt>
              <dd>{vendor?.name ?? params.vendorId}</dd>
              <dt><Term k="orderDay">Next order day</Term></dt>
              <dd>{fmtDay(params.orderDay)}</dd>
              <dt><Term k="d1" /> <span className="muted">this wagon</span></dt>
              <dd>{fmtDay(params.d1)}</dd>
              <dt><Term k="d2" /> <span className="muted">next wagon</span></dt>
              <dd>{fmtDay(params.d2)}</dd>
              <dt>Projected before D2 delivery</dt>
              <dd className={belowMop ? 'bad-text' : undefined}>{fmtQty(params.projectedAtD2)}</dd>
              <dt>Order-up-to</dt>
              <dd>{fmtQty(params.orderUpTo)}</dd>
            </dl>
          ) : (
            <p className="empty">No supplier carries this item.</p>
          )}
          {proposal && (
            <p className="proposal-hint">
              Today’s <Term k="proposal">order proposal</Term>: <strong>{fmtQty(proposal.qty)}</strong> {item.unit}s,
              arriving {fmtDay(proposal.d1)}.{' '}
              <button type="button" className="link" onClick={() => useUiStore.getState().go('proposals')}>
                Review in Order Proposals →
              </button>
            </p>
          )}
        </Panel>

        <Panel title="Adjust the forecast" flavour="Overrule the clerk if you know better.">
          <p className="muted small">
            Multiply the <Term k="forecast">forecast</Term> for the next 14 days (from {fmtDay(game.today)}). Proposals are
            recalculated, and today’s decisions are cleared.
          </p>
          <form
            className="override-form"
            onSubmit={(e) => {
              e.preventDefault();
              const value = Number(factor);
              if (!Number.isFinite(value) || value <= 0) return;
              setOverride({ itemId: loc.itemId, depotId: loc.depotId, from: game.today, to: game.today + 13, mode: 'factor', value });
            }}
          >
            <label>
              Factor ×
              <input type="number" min="0.1" max="5" step="0.1" value={factor} onChange={(e) => setFactor(e.target.value)} />
            </label>
            <button type="submit" className="btn btn-small">Apply</button>
          </form>
          {overrides.length > 0 && (
            <div className="override-list">
              {overrides.map((o, i) => (
                <div key={i}>
                  {o.mode === 'factor' ? `×${o.value}` : `${o.value}/day`} from {fmtDay(o.from)} to {fmtDay(o.to)}
                </div>
              ))}
              <button type="button" className="btn btn-small btn-ghost" onClick={() => clearOverride(loc.itemId, loc.depotId)}>
                Clear overrides
              </button>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
