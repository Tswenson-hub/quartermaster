import { Sprite } from './Sprite';

/** Rank insignia: manifest sprite rank.N, else gold pips (one per level). */
export function RankBadge({ level, size = 32 }: { level: number; size?: number }) {
  return (
    <Sprite
      keys={[`rank.${level}`]}
      size={size}
      className="rank-sprite"
      alt=""
      fallback={
        <span className="rank-pips" style={{ width: size, height: size }} aria-hidden>
          {Array.from({ length: Math.max(1, level + 1) }, (_, i) => (
            <span key={i} className="rank-pip" />
          ))}
        </span>
      }
    />
  );
}
