import { assetUrl, useManifest } from './manifest';

// A war-camp vignette built from Kenney Medieval RTS tiles (CC0) listed under manifest.tiles.
// Ground letters and overlay letters map to tile keys; one character per 64px cell.

const GROUND: Record<string, string> = {
  g: 'tile.grass',
  G: 'tile.grass-2',
  r: 'tile.road-ns',
  f: 'tile.forest',
  p: 'tile.pines',
  t: 'tile.trees',
  c: 'tile.crate-yard',
  d: 'tile.dirt',
  s: 'tile.stumps',
};

const OVERLAY: Record<string, string> = {
  T: 'struct.tent',
  L: 'struct.tent-large',
  S: 'struct.tent-small',
  F: 'env.campfire',
  M: 'struct.market',
  K: 'struct.stall',
  b: 'env.bush',
  o: 'env.rock',
  l: 'env.log',
  e: 'env.tree',
  w: 'struct.windmill',
};

// 24 columns; the scene is centred and clipped to its container.
const SCENE = {
  ground: [
    'pfptfpfgggggrggggftpfpft',
    'tggGgggggGgdrdgggggGgggt',
    'gggggGggggcdrdcggGgggggg',
  ],
  overlay: [
    '            .           ',
    ' e L S  T  KFMF  T S L e',
    '  b   l  S  .   l  b  w ',
  ],
};

export function CampScene({ cell = 40, className = '' }: { cell?: number; className?: string }) {
  const manifest = useManifest();
  const tiles = manifest?.tiles;
  if (!tiles?.['tile.grass']) return null;
  const url = (key: string | undefined) => (key && tiles[key] ? assetUrl(tiles[key]) : undefined);
  const cols = SCENE.ground[0].length;

  return (
    <div className={`camp-scene ${className}`} aria-hidden style={{ height: cell * SCENE.ground.length }}>
      <div className="camp-grid" style={{ gridTemplateColumns: `repeat(${cols}, ${cell}px)`, gridAutoRows: `${cell}px` }}>
        {SCENE.ground.flatMap((row, y) =>
          [...row].map((g, x) => {
            const over = url(OVERLAY[SCENE.overlay[y]?.[x] ?? ' ']);
            return (
              <span key={`${x}-${y}`} className="camp-cell" style={{ backgroundImage: `url(${url(GROUND[g]) ?? url('tile.grass')})` }}>
                {over && <img src={over} alt="" draggable={false} />}
              </span>
            );
          }),
        )}
      </div>
    </div>
  );
}
