import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Meter } from '../components/Meter';
import { Panel } from '../components/Panel';
import { Term } from '../components/Term';
import { fmtDay, fmtQty, fmtSilver } from '../format';
import { useGame, useTreasury } from '../hooks';

export function TreasuryScreen() {
  const game = useGame();
  const t = useTreasury();
  if (!game || !t) return null;
  const p = t.period;
  const spendDays = p ? game.kpis.filter((k) => k.day >= p.start && k.day <= p.end) : [];
  const transit = [...game.openOrders].sort((a, b) => a.deliveryOn - b.deliveryOn);

  return (
    <div className="stack">
      <Panel
        title="Treasury"
        flavour="The Treasurer counts every coin. Spend beyond the allowance and the King will hear of it."
      >
        {p ? (
          <div className="treasury-period">
            <div className="treasury-head">
              <span>
                <Term k="fiscalPeriod">Fiscal period</Term> {p.index + 1}: {fmtDay(p.start)} – {fmtDay(p.end)}
              </span>
              <span className="muted">{p.end - game.today} days left</span>
            </div>
            <Meter
              max={Math.max(p.allowance, p.committed + t.pendingToday) * 1.05}
              marker={{ value: p.allowance, label: `Allowance ${fmtSilver(p.allowance)}` }}
              segments={[
                { value: p.committed, className: 'seg-accepted', label: `Committed ${fmtSilver(p.committed)}` },
                { value: t.pendingToday, className: 'seg-pending', label: `Accepted today ${fmtSilver(t.pendingToday)}` },
              ]}
              caption={
                <>
                  <span className="legend-chip seg-accepted" /> <Term k="committed">committed</Term> {fmtSilver(p.committed)}
                  <span className="legend-chip seg-pending" /> accepted today {fmtSilver(t.pendingToday)}
                  <span className="legend-chip marker" /> allowance {fmtSilver(p.allowance)}
                </>
              }
            />
            <p className={`treasury-left ${t.remaining < 0 ? 'bad-text' : ''}`}>
              {t.remaining >= 0 ? `${fmtSilver(t.remaining)} remain in the chest.` : `Overspent by ${fmtSilver(-t.remaining)}!`}
            </p>
          </div>
        ) : (
          <p className="empty">No fiscal period is open.</p>
        )}
      </Panel>

      <div className="two-col">
        <Panel title="Daily spend" flavour="Silver paid out this period.">
          {spendDays.some((k) => k.spend > 0) ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={spendDays} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="#c9b38a" strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="day" stroke="#7a6648" tickLine={false} tick={{ fill: '#3b2a1a', fontSize: 12 }} />
                <YAxis stroke="#7a6648" tickLine={false} width={48} tick={{ fill: '#3b2a1a', fontSize: 12 }} />
                <Tooltip
                  cursor={{ fill: 'rgba(59,42,26,0.08)' }}
                  formatter={(v) => [fmtSilver(Number(v)), 'Spend']}
                  labelFormatter={(d) => fmtDay(Number(d))}
                  contentStyle={{ background: '#f6ead0', border: '2px solid #3b2a1a', fontFamily: 'Pixelify Sans' }}
                />
                <Bar dataKey="spend" fill="#2c62b0" radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="empty">Nothing spent yet this period.</p>
          )}
        </Panel>

        <Panel title="Wagons on the road" flavour="Paid for, not yet arrived.">
          {transit.length ? (
            <div className="table-scroll">
              <table className="simple-table">
                <thead>
                  <tr>
                    <th>Arrives</th>
                    <th>Item</th>
                    <th className="num">Qty</th>
                    <th className="num">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {transit.map((o) => (
                    <tr key={o.id}>
                      <td className="nowrap">{fmtDay(o.deliveryOn)}</td>
                      <td>
                        {game.items[o.itemId]?.name}
                        <span className="muted"> · {game.vendors[o.vendorId]?.name}</span>
                      </td>
                      <td className="num">{fmtQty(o.qty)}</td>
                      <td className="num">
                        {fmtSilver(o.cost)}
                        {!!o.surcharge && <div className="muted small">incl. {fmtSilver(o.surcharge)} surcharge</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty">No wagons on the road.</p>
          )}
        </Panel>
      </div>

      <Panel title="Ledger of periods">
        <div className="table-scroll">
          <table className="simple-table">
            <thead>
              <tr>
                <th>Period</th>
                <th>Days</th>
                <th className="num">Allowance</th>
                <th className="num">Committed</th>
                <th className="num">Left</th>
              </tr>
            </thead>
            <tbody>
              {t.periods.map((q) => (
                <tr key={q.index} className={q === p ? 'current' : undefined}>
                  <td>{q.index + 1}</td>
                  <td className="nowrap">
                    {fmtDay(q.start)} – {fmtDay(q.end)}
                  </td>
                  <td className="num">{fmtSilver(q.allowance)}</td>
                  <td className="num">{fmtSilver(q.committed)}</td>
                  <td className={`num ${q.allowance - q.committed < 0 ? 'bad-text' : ''}`}>{fmtSilver(q.allowance - q.committed)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
