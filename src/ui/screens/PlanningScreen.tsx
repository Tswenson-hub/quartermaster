import type { GameState, ItemLocation } from '../../engine/types';
import { ForecastGrid, OverridePanel } from '../components/ForecastEditor';
import { MopTrio } from '../components/MopTrio';
import { isDc } from '../dc';
import { ItemIcon } from '../components/ItemIcon';
import { Panel } from '../components/Panel';
import { PlanningCharts } from '../components/PlanningCharts';
import { Term } from '../components/Term';
import { fmtDay, fmtQty } from '../format';
import { useGame, usePlanningView } from '../hooks';
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
                <h3 className="ledger-depot-name">
                  {depot.name}
                  {isDc(depot) && (
                    <span className="tag tag-dc">
                      <Term k="dc">DC</Term>
                    </span>
                  )}
                </h3>
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
  const item = game.items[loc.itemId];
  const dcLoc = isDc(game.depots[loc.depotId]);
  if (!view || !item) return null;
  const { params, proposal } = view;
  const vendor = params ? game.vendors[params.vendorId] : undefined;
  const belowMop = params ? params.projectedAtD2 < params.mustOrderPoint : false;

  return (
    <div className="stack">
      <Panel
        title={
          <span className="item-heading">
            <ItemIcon item={item} size={36} />
            <span>
              {item.name}
              <span className="muted"> at {game.depots[loc.depotId]?.name}</span>
              {dcLoc && (
                <span className="tag tag-dc">
                  <Term k="dc">DC</Term>
                </span>
              )}
            </span>
          </span>
        }
        flavour={`${fmtQty(loc.onHand)} ${item.unit}s in the storehouse this morning.`}
      >
        {dcLoc && (
          <p className="dc-note" data-testid="dc-note">
            This is a <Term k="dc">distribution centre</Term>: no soldiers eat here. Its forecast is the{' '}
            <Term k="dependentDemand">front depots’ planned transfer orders</Term>, not consumption, so the demand chart below
            shows transfers shipped against transfers planned. Keep it above its MOP and the depots’ transfers ship in full;
            let it run short and they are short-shipped.
          </p>
        )}
        {params && (
          <p className={`verdict ${belowMop ? 'verdict-bad' : 'verdict-ok'}`}>
            {belowMop ? '⚠ ' : '✓ '}
            <Term k="projected">Projected stock</Term> just before the <Term k="d2" /> delivery ({fmtDay(params.d2)}) is{' '}
            <strong>{fmtQty(params.projectedAtD2)}</strong> — {belowMop ? 'below' : 'above'} the <Term k="mop" /> of{' '}
            <strong>{fmtQty(params.mustOrderPoint)}</strong>.{' '}
            {params.projectedAtD2 < 0 && (
              <>
                That is <Term k="shortfall">{`${fmtQty(-params.projectedAtD2)} ${item.unit}s short`}</Term>
                {dcLoc ? ': the depots’ transfers would be short-shipped.' : ': the men go hungry.'}{' '}
              </>
            )}
            {!belowMop
              ? 'No order needed to stay safe.'
              : params.projectedAtD2 < 0
                ? 'You must order today.'
                : dcLoc
                  ? 'You must order today or the depots’ transfers will run short.'
                  : 'You must order today or the men go without.'}
          </p>
        )}
        <PlanningCharts view={view} unit={item.unit} dc={dcLoc} battlePlans={game.battlePlans.filter((b) => b.announcedOn <= game.today && b.depotIds.includes(loc.depotId))} />
        <p className="chart-note muted">
          Shaded days are battle-plan windows. The red-tinted band is the zone below the MOP, which is the larger of safety
          stock (SS) and minimum fill. The dot is the stock just before the D2 delivery: the level this order must keep above
          the MOP. A red bar below zero is demand that would go unmet.
        </p>
      </Panel>

      <div className="two-col">
        <Panel title="Replenishment figures" flavour="As reckoned by the clerk.">
          {params && <MopTrio safetyStock={params.safetyStock} minimumFill={params.minimumFill} mop={params.mustOrderPoint} />}
          {params ? (
            <dl className="facts">
              <dt><Term k="cop">COP</Term> <span className="muted">can order point</span></dt>
              <dd>{fmtQty(params.canOrderPoint)}</dd>
              <dt>Supplier</dt>
              <dd>{vendor?.name ?? params.vendorId}</dd>
              <dt><Term k="orderDay">Next order day</Term></dt>
              <dd>{fmtDay(params.orderDay)}</dd>
              <dt><Term k="d1" /> <span className="muted">this wagon</span></dt>
              <dd>{fmtDay(params.d1)}</dd>
              <dt><Term k="d2" /> <span className="muted">next wagon</span></dt>
              <dd data-testid="planning-d2">{fmtDay(params.d2)}</dd>
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

        <OverridePanel view={view} item={item} />
      </div>
      <ForecastGrid view={view} item={item} />
    </div>
  );
}
