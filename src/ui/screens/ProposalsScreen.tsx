import type { GameState, ProposalReason } from '../../engine/types';
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
  const withLines = groups.filter((g) => g.lines.length);
  const idle = groups.filter((g) => !g.lines.length);

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
                <VendorTile name={g.vendor.name} size={24} />
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
          <VendorTile name={vendor.name} />
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
        <button
          type="button"
          className="btn btn-small"
          onClick={() => lines.forEach((l) => l.decision !== 'accepted' && decideProposal(l.index, 'accepted', l.edited ? l.qty : undefined))}
        >
          Accept all
        </button>
      }
    >
      {min && (
        <div className={`vendor-min ${met ? 'met' : 'short'}`}>
          <div className="vendor-min-label">
            <Term k="vendorMin">Vendor minimum</Term>: {fmt(min.amount)} —{' '}
            {met ? <strong>met ✓</strong> : <strong>short by {fmt(min.amount - accepted)}</strong>}
          </div>
          <Meter
            max={Math.max(min.amount * 1.25, open)}
            marker={{ value: min.amount, label: `Minimum ${fmt(min.amount)}` }}
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
    <tr data-testid="proposal-row" className={`row-${decision ?? 'open'}`}>
      <td>
        <button type="button" className="item-cell link" onClick={() => planItem(p.itemId, p.depotId)} title="Open in Item Planning">
          <ItemIcon item={item} size={26} />
          <span>
            {item?.name}
            <span className="muted">{game.depots[p.depotId]?.name}</span>
          </span>
        </button>
      </td>
      <td>
        <span className={`pill ${reason.cls}`}>{reason.term ? <Term k={reason.term}>{reason.label}</Term> : reason.label}</span>
      </td>
      <td className={`num ${below ? 'bad-text' : ''}`}>{fmtQty(p.projectedAtD2)}</td>
      <td className="num">
        {fmtQty(p.mustOrderPoint)} / {fmtQty(p.canOrderPoint)}
      </td>
      <td className="nowrap">
        {fmtDay(p.d1)} → {fmtDay(p.d2)}
      </td>
      <td className="num">
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
      <td className="num">{fmtSilver(line.cost)}</td>
      <td>
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
      </td>
    </tr>
  );
}
