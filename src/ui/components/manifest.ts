import { useEffect, useState } from 'react';

// Curated art listed in public/assets/manifest.json (content agent). Keys look like "item.grain",
// "rank.3", "tile.grass". Anything missing falls back to the given placeholder.

export type ManifestGroup = 'icons' | 'tiles' | 'ui';
type Manifest = Partial<Record<ManifestGroup, Record<string, string>>>;

let manifest: Manifest | null = null;
let manifestPromise: Promise<Manifest> | null = null;

function loadManifest(): Promise<Manifest> {
  manifestPromise ??= fetch(`${import.meta.env.BASE_URL}assets/manifest.json`)
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}))
    .then((m: Manifest) => (manifest = m));
  return manifestPromise;
}

export function assetUrl(path: string) {
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;
}

/** The asset manifest, or null until it has loaded. */
export function useManifest(): Manifest | null {
  const [m, setM] = useState(manifest);
  useEffect(() => {
    let live = true;
    if (!m) loadManifest().then((x) => live && setM(x));
    return () => {
      live = false;
    };
  }, [m]);
  return m;
}

/** First manifest path found for any of `keys` in `group`. */
export function useSpriteUrl(keys: string[], group: ManifestGroup = 'icons'): string | null {
  const m = useManifest();
  const path = keys.map((k) => m?.[group]?.[k]).find(Boolean);
  return path ? assetUrl(path) : null;
}

