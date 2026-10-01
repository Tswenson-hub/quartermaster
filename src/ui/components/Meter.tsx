import type { ReactNode } from 'react';

export interface MeterSegment {
  value: number;
  className: string;
  label: string;
}

interface Props {
  segments: MeterSegment[];
  max: number;
  /** Vertical marker (e.g. the vendor minimum) as an absolute value. */
  marker?: { value: number; label: string };
  caption?: ReactNode;
  testId?: string;
}

/** Pixel-style stacked bar. Segment widths are clamped to the bar. */
export function Meter({ segments, max, marker, caption, testId }: Props) {
  const scale = max > 0 ? 100 / max : 0;
  let used = 0;
  return (
    <div className="meter-wrap" data-testid={testId}>
      <div className="meter" role="img" aria-label={segments.map((s) => `${s.label}: ${Math.round(s.value)}`).join(', ')}>
        {segments.map((s) => {
          const w = Math.max(0, Math.min(100 - used, s.value * scale));
          used += w;
          return <span key={s.label} className={`meter-seg ${s.className}`} style={{ width: `${w}%` }} title={s.label} />;
        })}
        {marker && (
          <span className="meter-marker" style={{ left: `${Math.min(100, marker.value * scale)}%` }} title={marker.label} />
        )}
      </div>
      {caption && <div className="meter-caption">{caption}</div>}
    </div>
  );
}
