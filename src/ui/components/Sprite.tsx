import type { ReactNode } from 'react';
import { type ManifestGroup, useSpriteUrl } from './manifest';

interface Props {
  /** Manifest keys to try, in order. */
  keys: string[];
  group?: ManifestGroup;
  size: number;
  alt?: string;
  className?: string;
  fallback: ReactNode;
}

export function Sprite({ keys, group = 'icons', size, alt = '', className = '', fallback }: Props) {
  const src = useSpriteUrl(keys, group);
  if (!src) return <>{fallback}</>;
  return <img className={`sprite ${className}`} src={src} width={size} height={size} alt={alt} draggable={false} />;
}
