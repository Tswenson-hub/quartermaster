import type { Depot, DepotId } from '../engine/types';

const list: Depot[] = [
  { id: 'eastern-camp', name: 'Eastern Camp at Brackenford' },
  { id: 'harrowmere', name: 'Siege Lines at Harrowmere' },
  { id: 'northern-pass', name: 'Northern Pass Garrison' },
  // Distribution centre: no consumption of its own. Buys from vendors, ships to the front by transfer.
  { id: 'kingsreach-dc', name: 'Royal Depot at Kingsreach', kind: 'dc' },
];

export const DEPOTS: Record<DepotId, Depot> = Object.fromEntries(list.map((d) => [d.id, d]));
