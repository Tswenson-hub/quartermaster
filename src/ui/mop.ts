// Display helper for the MOP trio (RELEX_RULES §3: MOP = max(safety stock, minimum fill)).
// Only says which of two engine-supplied numbers is the larger; it computes nothing new.

export type MopDriver = 'safetyStock' | 'minimumFill' | 'both';

export function mopDriver(safetyStock: number | undefined, minimumFill: number): MopDriver | undefined {
  if (safetyStock === undefined) return undefined;
  if (Math.round(safetyStock) === Math.round(minimumFill)) return 'both';
  return safetyStock > minimumFill ? 'safetyStock' : 'minimumFill';
}

export const MOP_CAPTION = 'MOP = max(safety stock, minimum fill)';
