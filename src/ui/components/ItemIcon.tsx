import type { Item, ItemCategory } from '../../engine/types';
import { Sprite } from './Sprite';

// Real sprites come from public/assets/manifest.json (item.<id>, vendor.<id>); coloured tiles
// stand in until the manifest lists an icon.

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

export function ItemIcon({ item, size = 32 }: { item: Item | undefined; size?: number }) {
  if (!item) return <span className="icon-tile" style={{ width: size, height: size }} />;
  return (
    <Sprite
      keys={[`item.${item.id}`, item.icon]}
      size={size}
      className="icon-framed"
      fallback={
        <span
          className="icon-tile"
          style={{ width: size, height: size, background: CATEGORY_COLOUR[item.category], fontSize: size * 0.42 }}
          title={item.category}
          aria-hidden
        >
          {item.name.slice(0, 2).toUpperCase()}
        </span>
      }
    />
  );
}

export function VendorTile({ id, name, size = 28 }: { id?: string; name: string; size?: number }) {
  return (
    <Sprite
      keys={id ? [`vendor.${id}`] : []}
      size={size}
      className="icon-framed"
      fallback={
        <span className="icon-tile vendor-tile" style={{ width: size, height: size, fontSize: size * 0.42 }} aria-hidden>
          {name.slice(0, 1)}
        </span>
      }
    />
  );
}
