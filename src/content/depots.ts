import type { Depot, DepotId } from '../engine/types';

const list: Depot[] = [
  { id: 'eastern-camp', name: 'Eastern Camp at Brackenford' },
  { id: 'harrowmere', name: 'Siege Lines at Harrowmere' },
  { id: 'northern-pass', name: 'Northern Pass Garrison' },
];

export const DEPOTS: Record<DepotId, Depot> = Object.fromEntries(list.map((d) => [d.id, d]));
