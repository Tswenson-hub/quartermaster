import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { BattlePlan } from '../../engine/types';
import { fmtDay, fmtQty } from '../format';
import type { PlanningView } from '../hooks';
import { mopDriver } from '../mop';

// Series colours validated (dataviz validator) against the parchment surface #efe0bd.
const SERIES = { projected: '#2c62b0', forecast: '#c0611a', history: '#7a4fa0' };
const INK = '#3b2a1a';
const MUTED = '#7a6648';
const MOP = '#a8202a';
const COP = '#8a6a12';
const USER_FC = '#d9a441';

/** "MOP (SS)" / "MOP (fill)": which input sets MOP. */
function mopLabel(safetyStock: number, minimumFill: number) {
  const d = mopDriver(safetyStock, minimumFill);
  return d === 'minimumFill' ? 'MOP (fill)' : d === 'safetyStock' ? 'MOP (SS)' : 'MOP';
}

const axisProps = {
  stroke: MUTED,
  tick: { fill: INK, fontSize: 12, fontFamily: 'Inter, system-ui, sans-serif' },
  tickLine: false,
};

function TipBox({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: number }) {
  if (!active || !payload?.length || label === undefined) return null;
  return (
    <div className="chart-tip">
      <div className="chart-tip-day">{fmtDay(label)}</div>
      {payload
        .filter((p) => p.value !== undefined && p.value !== null)
        .map((p) => (
          <div key={p.name} className="chart-tip-row">
            <span className="swatch" style={{ background: p.color }} />
            <span>{p.name}</span>
            <strong>{fmtQty(p.value)}</strong>
          </div>
        ))}
    </div>
  );
}

interface Props {
  view: PlanningView;
  unit: string;
  battlePlans: BattlePlan[];
}

export function PlanningCharts({ view, unit, battlePlans }: Props) {
  const { points, params, today, d2CheckDay, overrides } = view;
  const first = points[0]?.day ?? 0;
  const last = points[points.length - 1]?.day ?? 0;
  const domain: [number, number] = [first, last];
  const plans = battlePlans.filter((b) => b.end >= first && b.start <= last);
  const shade = plans.map((b) => (
    <ReferenceArea key={b.id} x1={Math.max(b.start, first)} x2={Math.min(b.end, last)} fill="#7a4fa0" fillOpacity={0.08} ifOverflow="hidden" />
  ));

  return (
    <div className="charts">
      <div className="chart-block">
        <div className="chart-title">
          Projected stock <span className="muted">({unit}s, end of day)</span>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={points} syncId="planning" margin={{ top: 18, right: 72, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#c9b38a" strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="day" type="number" domain={domain} allowDecimals={false} {...axisProps} tickFormatter={(d) => String(d)} />
            <YAxis {...axisProps} width={48} />
            <Tooltip content={<TipBox />} cursor={{ stroke: INK, strokeDasharray: '3 3' }} />
            {shade}
            <ReferenceLine x={today} stroke={INK} strokeWidth={2} label={{ value: 'Today', position: 'top', fill: INK, fontSize: 12 }} />
            {params && (
              <>
                <ReferenceLine y={params.canOrderPoint} stroke={COP} strokeDasharray="6 4" strokeWidth={2} label={{ value: 'COP', position: 'right', fill: COP, fontSize: 12 }} />
                {/* The MOP trio's shared tint: the zone below MOP that safety stock / minimum fill protect. */}
                <ReferenceArea y1={0} y2={params.mustOrderPoint} fill={MOP} fillOpacity={0.07} ifOverflow="hidden" />
                <ReferenceLine
                  y={params.mustOrderPoint}
                  stroke={MOP}
                  strokeDasharray="6 4"
                  strokeWidth={2}
                  label={{ value: mopLabel(params.safetyStock, params.minimumFill), position: 'right', fill: MOP, fontSize: 12 }}
                />
                <ReferenceLine x={params.d1} stroke={MUTED} strokeDasharray="2 3" label={{ value: 'D1', position: 'top', fill: INK, fontSize: 12 }} />
                <ReferenceLine x={params.d2} stroke={INK} strokeDasharray="2 3" label={{ value: 'D2', position: 'top', fill: INK, fontSize: 12 }} />
{params.projectedAtD2 < 0 && (
                  // Unmet demand: physical stock stops at 0; the shortfall hangs below it.
                  <ReferenceArea
                    x1={(d2CheckDay ?? params.d2) - 0.35}
                    x2={(d2CheckDay ?? params.d2) + 0.35}
                    y1={params.projectedAtD2}
                    y2={0}
                    fill={MOP}
                    fillOpacity={0.75}
                    ifOverflow="extendDomain"
                    label={{ value: `${fmtQty(-params.projectedAtD2)} short`, position: 'right', fill: MOP, fontSize: 12 }}
                  />
                )}
                <ReferenceDot
                  x={d2CheckDay ?? params.d2}
                  y={Math.max(0, params.projectedAtD2)}
                  r={6}
                  fill={params.projectedAtD2 < params.mustOrderPoint ? MOP : SERIES.projected}
                  stroke="#efe0bd"
                  strokeWidth={2}
                  ifOverflow="extendDomain"
                />
              </>
            )}
            <ReferenceLine y={0} stroke={MUTED} />
            <Line name="Projected stock" dataKey="projected" stroke={SERIES.projected} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-block">
        <div className="chart-title">
          Daily demand <span className="muted">— actual vs forecast ({unit}s/day)</span>
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <ComposedChart data={points} syncId="planning" margin={{ top: 8, right: 72, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#c9b38a" strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="day" type="number" domain={domain} allowDecimals={false} {...axisProps} />
            <YAxis {...axisProps} width={48} />
            <Tooltip content={<TipBox />} cursor={{ stroke: INK, strokeDasharray: '3 3' }} />
            {shade}
            {overrides.map((o) => (
              <ReferenceArea
                key={`${o.from}-${o.to}-${o.mode}`}
                x1={Math.max(o.from, first) - 0.5}
                x2={Math.min(o.to, last) + 0.5}
                fill={USER_FC}
                fillOpacity={0.18}
                ifOverflow="hidden"
                label={o === overrides[0] ? { value: 'your forecast', position: 'insideTop', fill: INK, fontSize: 12 } : undefined}
              />
            ))}
            <ReferenceLine x={today} stroke={INK} strokeWidth={2} />
            <Line name="Actual demand" dataKey="history" stroke={SERIES.history} strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
            <Line name="Forecast" dataKey="forecast" stroke={SERIES.forecast} strokeWidth={2} strokeDasharray="5 3" dot={false} isAnimationActive={false} />
            <Legend verticalAlign="top" height={24} iconType="plainline" wrapperStyle={{ fontSize: 12, color: INK }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
