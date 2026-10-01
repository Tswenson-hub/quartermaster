import { useState } from 'react';
import type { GameState, ProposalReason, Vendor, VendorPlan } from '../../engine/types';
import { ItemIcon, VendorTile } from '../components/ItemIcon';
import { Meter } from '../components/Meter';
import { Panel } from '../components/Panel';
import { Term } from '../components/Term';
import type { TermKey } from '../glossary';
import { fmtDay, fmtQty, fmtSilver, weekdayName } from '../format';
import { useGame, useGameActions, useVendorGroups, type ProposalLine, type VendorGroup } from '../hooks';
import { useUiStore } from '../uiStore';

const REASON: Record<ProposalReason, { label: string; term?: TermKey; cls: string }> = {
  must: { label: 'Must', term: 'mustOrder', cls: 'pill-must' },
  can: { label: 'Can', term: 'canOrder', cls: 'pill-can' },
  'vendor-min-fill': { label: 'Fill', term: 'vendorMinFill', cls: 'pill-fill' },
  manual: { label: 'Manual', cls: 'pill-manual' },
};

export function ProposalsScreen() {
  const game = useGame();
  const groups = useVendorGroups();
  if (!game) return null;
  const withLines = groups.filter((g) => g.lines.length || g.plan?.status === 'below-trigger');
  const idle = groups.filter((g) => !withLines.includes(g));

  return (
    <div className="stack">
      <Panel
        title={
          <>
            <Term k="proposal">Order proposals</Term>
          </>
        }
        flavour="The clerk has drafted today’s requisitions. Seal them, amend them, or tear them up — orders go out when you end the day."
      >
        {withLines.length === 0 && <p className="empty">No requisitions today. The stores are well kept.</p>}
      </Panel>
      {withLines.map((g) => (
        <VendorCard key={g.vendor.id} group={g} game={game} />
      ))}
      {idle.length > 0 && (
        <Panel title="Other suppliers" flavour="Nothing to send them today.">
          <ul className="plain-list">
            {idle.map((g) => (
              <li key={g.vendor.id} className="idle-vendor">
                <VendorTile id={g.vendor.id} name={g.vendor.name} size={24} />
                <span>{g.vendor.name}</span>
                <span className="muted">
                  <Term k="orderDay">orders</Term> {g.vendor.orderDays.map((d) => weekdayName(d)).join('/')} ·{' '}
                  <Term k="leadTime">lead time</Term> {g.vendor.leadTimeDays}d
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

function VendorCard({ group, game }: { group: VendorGroup; game: GameState }) {
  const { vendor, lines } = group;
  const { decideProposal } = useGameActions();
  const min = vendor.minimum;
  const accepted = min ? (min.kind === 'value' ? group.acceptedValue : group.acceptedUnits) : 0;
  const open = min ? (min.kind === 'value' ? group.openValue : group.openUnits) : 0;
  const fmt = (n: number) => (min?.kind === 'value' ? fmtSilver(n) : `${fmtQty(n)} units`);
  const met = min ? accepted >= min.amount : true;

  return (
    <Panel
      className="vendor-card"
      title={
        <span className="vendor-heading">
          <VendorTile id={vendor.id} name={vendor.name} />
          {vendor.name}
        </span>
      }
      flavour={
        <>
          <Term k="orderDay">Orders</Term> {vendor.orderDays.map((d) => weekdayName(d)).join('/')} ·{' '}
          <Term k="leadTime">lead time</Term> {vendor.leadTimeDays} days · reliability {Math.round(vendor.reliability * 100)}%
        </>
      }
      actions={
        lines.length > 0 && (
        <button
          type="button"
          className="btn btn-small"
          onClick={() => lines.forEach((l) => l.decision !== 'accepted' && decideProposal(l.index, 'accepted', l.edited ? l.qty : undefined))}
        >
          Accept all
        </button>
        )
      }
    >
      {min && <OrderTrigger vendor={vendor} plan={group.plan} customTrigger={group.customTrigger} />}
      {group.plan?.status === 'built' && <BuildBreakdown lines={lines} game={game} unit={min?.kind} />}
      {min && lines.length > 0 && (
        <div className={`vendor-min ${met ? 'met' : 'short'}`}>
          <div className="vendor-min-label">
            Your order vs the <Term k="vendorMin">minimum</Term> of {fmt(min.amount)} —{' '}
            {met ? (
              <strong>met ✓</strong>
            ) : accepted === 0 && open >= min.amount ? (
              <span className="muted">met once you accept these lines</span>
            ) : (
              <strong>short by {fmt(min.amount - accepted)}</strong>
            )}
          </div>
          {group.droppedCount > 0 && (
            <p className="vendor-min-warn bad">
              {vendor.name} will not ride for so small an order: {group.droppedCount} accepted line
              {group.droppedCount === 1 ? '' : 's'} will not ship. Accept more, or reject them.
            </p>
          )}
          <Meter
            max={Math.max(min.amount * 1.25, open)}
            markers={[{ value: min.amount, label: `Minimum ${fmt(min.amount)}` }]}
            segments={[
              { value: accepted, className: met ? 'seg-good' : 'seg-accepted', label: `Accepted ${fmt(accepted)}` },
              { value: open - accepted, className: 'seg-pending', label: `Undecided ${fmt(open - accepted)}` },
            ]}
            caption={
              <>
                <span className="legend-chip seg-accepted" /> accepted {fmt(accepted)}
                <span className="legend-chip seg-pending" /> undecided {fmt(open - accepted)}
                <span className="legend-chip marker" /> minimum
              </>
            }
          />
        </div>
      )}
      {lines.length > 0 && (
      <div className="table-scroll">
        <table className="proposal-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Why</th>
              <th className="num">
                Proj. at <Term k="d2" />
              </th>
              <th className="num">
                <Term k="mop" /> / <Term k="cop" />
              </th>
              <th>
                <Term k="d1" /> → <Term k="d2" />
              </th>
              <th className="num">
                Qty <span className="muted">(<Term k="packSize">pack</Term>)</span>
              </th>
              <th className="num">Cost</th>
              <th>Decision</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <ProposalRow key={l.index} line={l} game={game} />
            ))}
          </tbody>
        </table>
      </div>
      )}
    </Panel>
  );
}

function ProposalRow({ line, game }: { line: ProposalLine; game: GameState }) {
  const { proposal: p, decision, qty, packSize } = line;
  const { decideProposal } = useGameActions();
  const setDraftQty = useUiStore((s) => s.setDraftQty);
  const planItem = useUiStore((s) => s.planItem);
  const item = game.items[p.itemId];
  const reason = REASON[p.reason];
  const below = p.projectedAtD2 < p.mustOrderPoint;

  const changeQty = (next: number) => {
    const q = Math.max(0, Math.round(next / packSize) * packSize);
    if (decision === 'accepted') decideProposal(line.index, 'accepted', q);
    else setDraftQty(line.index, q === p.qty ? null : q);
  };

  return (
    <tr data-testid="proposal-row" className={`row-${decision ?? 'open'}${line.dropped ? ' row-dropped' : ''}`}>
      <td className="cell-item">
        <button type="button" className="item-cell link" onClick={() => planItem(p.itemId, p.depotId)} title="Open in Item Planning">
          <ItemIcon item={item} size={26} />
          <span>
            {item?.name}
            <span className="muted">{game.depots[p.depotId]?.name}</span>
          </span>
        </button>
      </td>
      <td data-label="Why">
        <span className={`pill ${reason.cls}`}>{reason.term ? <Term k={reason.term}>{reason.label}</Term> : reason.label}</span>
        {!!p.builtQty && (
          <div className="built-note">
            <Term k="orderTrigger">+{fmtQty(p.builtQty)} built</Term>
          </div>
        )}
      </td>
      <td data-label="Proj. at D2" className={`num ${below ? 'bad-text' : ''}`}>{fmtQty(p.projectedAtD2)}</td>
      <td data-label="MOP / COP" className="num">
        {fmtQty(p.mustOrderPoint)} / {fmtQty(p.canOrderPoint)}
      </td>
      <td data-label="D1 → D2" className="nowrap">
        {fmtDay(p.d1)} → {fmtDay(p.d2)}
      </td>
      <td data-label="Qty" className="num">
        <div className="qty-editor">
          <button type="button" className="btn btn-tiny" aria-label="Fewer" disabled={decision === 'rejected' || qty <= 0} onClick={() => changeQty(qty - packSize)}>
            −
          </button>
          <input
            type="number"
            min={0}
            step={packSize}
            value={qty}
            disabled={decision === 'rejected'}
            aria-label={`Quantity of ${item?.name}`}
            onChange={(e) => changeQty(Number(e.target.value))}
            className={line.edited ? 'edited' : undefined}
          />
          <button type="button" className="btn btn-tiny" aria-label="More" disabled={decision === 'rejected'} onClick={() => changeQty(qty + packSize)}>
            +
          </button>
        </div>
        <div className="muted small">×{packSize}{line.edited && <> · was {fmtQty(p.qty)}</>}</div>
      </td>
      <td data-label="Cost" className="num">{fmtSilver(line.cost)}</td>
      <td data-label="Decision">
        <div className="decision-btns">
          <button
            type="button"
            data-testid="proposal-accept"
            className={`btn btn-small btn-accept ${decision === 'accepted' ? 'on' : ''}`}
            aria-pressed={decision === 'accepted'}
            onClick={() => decideProposal(line.index, 'accepted', line.edited ? qty : undefined)}
          >
            Accept
          </button>
          <button
            type="button"
            data-testid="proposal-reject"
            className={`btn btn-small btn-reject ${decision === 'rejected' ? 'on' : ''}`}
            aria-pressed={decision === 'rejected'}
            onClick={() => decideProposal(line.index, 'rejected')}
          >
            Reject
          </button>
        </div>
        {line.dropped && <div className="dropped-note">will not ship: below minimum</div>}
      </td>
    </tr>
  );
}

const pct = (f: number) => `${Math.round(f * 100)}%`;

/** Order-trigger gauge + editor + status for a vendor with a minimum (RELEX_RULES §4, §6). */
function OrderTrigger({ vendor, plan, customTrigger }: { vendor: Vendor; plan?: VendorPlan; customTrigger: boolean }) {
  const { setVendorTrigger } = useGameActions();
  const clearDrafts = useUiStore((s) => s.clearDrafts);
  const trigger = plan?.trigger ?? vendor.orderTrigger ?? 1;
  const [draft, setDraft] = useState(String(Math.round(trigger * 100)));
  const min = vendor.minimum!;
  const fmt = (n: number) => (min.kind === 'value' ? fmtSilver(n) : `${fmtQty(n)} units`);
  const need = plan?.need ?? 0;
  const ratio = plan?.ratio ?? 0;
  const status = plan?.status;
  const apply = (f: number | null) => {
    setVendorTrigger(vendor.id, f);
    clearDrafts();
  };

  return (
    <div className={`trigger trigger-${status ?? 'none'}`} data-testid={`trigger-${vendor.id}`}>
      <div className="trigger-head">
        <div>
          <strong>
            <Term k="orderTrigger">Order trigger</Term>
          </strong>{' '}
          <span className="muted">
            real need {fmt(need)} = <strong>{pct(ratio)}</strong> of the {fmt(min.amount)} minimum
          </span>
        </div>
        <form
          className="trigger-form"
          onSubmit={(e) => {
            e.preventDefault();
            const v = Number(draft);
            if (Number.isFinite(v) && v >= 0) apply(v / 100);
          }}
        >
          <label>
            Trigger
            <input
              type="number"
              min={0}
              max={200}
              step={5}
              value={draft}
              aria-label={`Order trigger for ${vendor.name}, percent of minimum`}
              onChange={(e) => setDraft(e.target.value)}
            />
            %
          </label>
          <button type="submit" className="btn btn-small" disabled={Number(draft) === Math.round(trigger * 100)}>
            Apply
          </button>
          {customTrigger && (
            <button
              type="button"
              className="btn btn-small btn-ghost"
              onClick={() => {
                apply(null);
                setDraft(String(Math.round((vendor.orderTrigger ?? trigger) * 100)));
              }}
            >
              Default
            </button>
          )}
        </form>
      </div>
      <Meter
        max={min.amount * Math.max(1.25, ratio * 1.05, trigger * 1.1)}
        markers={[
          { value: trigger * min.amount, label: `Trigger ${pct(trigger)}`, className: 'marker-trigger' },
          { value: min.amount, label: `Minimum ${fmt(min.amount)}` },
        ]}
        segments={[
          {
            value: need,
            className: status === 'below-trigger' ? 'seg-short' : 'seg-accepted',
            label: `Real need ${fmt(need)}`,
          },
        ]}
        caption={
          <>
            <span className={`legend-chip ${status === 'below-trigger' ? 'seg-short' : 'seg-accepted'}`} /> real need {fmt(need)}
            <span className="legend-chip marker marker-trigger" /> trigger {pct(trigger)}
            <span className="legend-chip marker" /> minimum
          </>
        }
      />
      <p className="trigger-status">
        {status === 'below-trigger' && (
          <>
            <strong>No order built.</strong> Real need is only {pct(ratio)} of the minimum, below your trigger of{' '}
            {pct(trigger)}, so the clerk drafted nothing for {vendor.name}. Lower the trigger to let a small need build up
            to a full order — or wait for the need to grow.
          </>
        )}
        {status === 'built' && (
          <>
            <strong>Built to the minimum.</strong> Need reached {pct(ratio)}, past your {pct(trigger)} trigger, so the clerk
            added one pack at a time of the neediest item (fewest days of cover at D2) until the minimum was met.
          </>
        )}
        {status === 'meets-minimum' && <>Real need alone meets the minimum — nothing had to be built.</>}
        {!status && <>No need for {vendor.name} today.</>}
      </p>
      <p className="muted small">Changing the trigger redrafts today’s proposals and clears decisions already made.</p>
    </div>
  );
}

/** Lines the trigger build added to reach the minimum (OrderProposal.builtQty). */
function BuildBreakdown({ lines, game, unit }: { lines: ProposalLine[]; game: GameState; unit?: 'value' | 'units' }) {
  const built = lines.filter((l) => (l.proposal.builtQty ?? 0) > 0);
  if (!built.length) return null;
  const total = built.reduce((a, l) => a + (unit === 'units' ? l.proposal.builtQty! : l.proposal.builtQty! * l.unitCost), 0);
  return (
    <div className="build-breakdown">
      <div className="build-title">
        Packs added to reach the minimum{' '}
        <span className="muted">({unit === 'units' ? `${fmtQty(total)} units` : fmtSilver(total)} beyond real need)</span>
      </div>
      <ul className="plain-list">
        {built.map((l) => {
          const item = game.items[l.proposal.itemId];
          const packs = Math.round(l.proposal.builtQty! / l.packSize);
          return (
            <li key={l.index} className="build-row">
              <ItemIcon item={item} size={20} />
              <span className="build-name">
                {item?.name} <span className="muted">· {game.depots[l.proposal.depotId]?.name}</span>
              </span>
              <span>
                +{packs} pack{packs === 1 ? '' : 's'} ({fmtQty(l.proposal.builtQty!)} {item?.unit}s)
              </span>
              <span className="num">{fmtSilver(l.proposal.builtQty! * l.unitCost)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
