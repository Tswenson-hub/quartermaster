import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { GLOSSARY, type TermKey } from '../glossary';

interface Props {
  k: TermKey;
  /** Visible label; defaults to the short RELEX abbreviation/term. */
  children?: ReactNode;
}

/** A RELEX term with a hover/focus tooltip explaining it in plain words. */
export function Term({ k, children }: Props) {
  const entry = GLOSSARY[k];
  const id = useId();
  const anchor = useRef<HTMLSpanElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; below: boolean } | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchor.current || !tip.current) return;
    const a = anchor.current.getBoundingClientRect();
    const t = tip.current.getBoundingClientRect();
    const margin = 8;
    const left = Math.min(Math.max(margin, a.left + a.width / 2 - t.width / 2), window.innerWidth - t.width - margin);
    const below = a.top - t.height - margin < 0;
    const top = below ? a.bottom + margin : a.top - t.height - margin;
    setPos({ left, top, below });
  }, [open]);

  const label = children ?? entry.term.split(' — ')[0];

  return (
    <>
      <span
        ref={anchor}
        className="term"
        tabIndex={0}
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
      >
        {label}
      </span>
      {open &&
        createPortal(
          <div
            ref={tip}
            id={id}
            role="tooltip"
            className="term-tip"
            style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: 0 }}
          >
            <div className="term-tip-title">{entry.term}</div>
            <div className="term-tip-flavour">{entry.flavour}</div>
            <div className="term-tip-plain">{entry.plain}</div>
            {entry.related && (
              <div className="term-tip-related">Related: {entry.related.map((r) => GLOSSARY[r].term.split(' — ')[0]).join(' · ')}</div>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
