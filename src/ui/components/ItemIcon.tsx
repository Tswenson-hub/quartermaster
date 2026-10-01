import { useEffect, useState } from 'react';
import type { Item, ItemCategory } from '../../engine/types';

// Placeholder tiles until curated art lands in public/assets/manifest.json. When the manifest
// has an entry for item.icon, the real sprite is used instead.

const CATEGORY_COLOUR: Record<ItemCategory, string> = {
  rations: '#b8862f',
  fodder: '#7f9a3a',
  munitions: '#8a4b2a',
  arms: '#6b6f78',
  armor: '#4f5d73',
  medical: '#b5463c',
  siege: '#5e4630',
  tools: '#55606b',
};

type Manifest = { icons?: Record<string, string> };
let manifestPromise: Promise<Manifest> | null = null;
function loadManifest(): Promise<Manifest> {
  manifestPromise ??= fetch(`${import.meta.env.BASE_URL}assets/manifest.json`)
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}));
  return manifestPromise;
}

export function ItemIcon({ item, size = 32 }: { item: Item | undefined; size?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (item) loadManifest().then((m) => live && setSrc(m.icons?.[item.icon] ?? null));
    return () => {
      live = false;
    };
  }, [item]);

  if (!item) return <span className="icon-tile" style={{ width: size, height: size }} />;
  if (src) {
    return <img className="icon-img" src={`${import.meta.env.BASE_URL}${src.replace(/^\//, '')}`} width={size} height={size} alt="" />;
  }
  return (
    <span
      className="icon-tile"
      style={{ width: size, height: size, background: CATEGORY_COLOUR[item.category], fontSize: size * 0.42 }}
      title={item.category}
      aria-hidden
    >
      {item.name.slice(0, 2).toUpperCase()}
    </span>
  );
}

export function VendorTile({ name, size = 28 }: { name: string; size?: number }) {
  return (
    <span className="icon-tile vendor-tile" style={{ width: size, height: size, fontSize: size * 0.42 }} aria-hidden>
      {name.slice(0, 1)}
    </span>
  );
}
