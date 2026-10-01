import type { ReactNode } from 'react';

export interface MeterSegment {
  value: number;
  className: string;
  label: string;
}

interface Props {
  segments: MeterSegment[];
  max: number;
  /** Vertical markers (e.g. vendor minimum, order trigger) as absolute values. */
  markers?: { value: number; label: string; className?: string }[];
  caption?: ReactNode;
  testId?: string;
}

/** Pixel-style stacked bar. Segment widths are clamped to the bar. */
export function Meter({ segments, max, markers = [], caption, testId }: Props) {
  const scale = max > 0 ? 100 / max : 0;
  // Widths in %, each clamped to what is left of the bar.
  const widths = segments.reduce<number[]>((acc, s) => {
    const used = acc.reduce((a, b) => a + b, 0);
    return [...acc, Math.max(0, Math.min(100 - used, s.value * scale))];
  }, []);
  return (
    <div className="meter-wrap" data-testid={testId}>
      <div className="meter" role="img" aria-label={segments.map((s) => `${s.label}: ${Math.round(s.value)}`).join(', ')}>
        {segments.map((s, i) => (
          <span key={s.label} className={`meter-seg ${s.className}`} style={{ width: `${widths[i]}%` }} title={s.label} />
        ))}
        {markers.map((m) => (
          <span
            key={m.label}
            className={`meter-marker ${m.className ?? ''}`}
            style={{ left: `${Math.min(100, m.value * scale)}%` }}
            title={m.label}
          />
        ))}
      </div>
      {caption && <div className="meter-caption">{caption}</div>}
    </div>
  );
}
