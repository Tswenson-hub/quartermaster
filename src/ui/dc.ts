import type { Depot, Vendor } from '../engine/types';

// Distribution-centre display helpers (contract: Depot.kind 'dc', Vendor.dcDepotId = transfer lane).

export const isDc = (depot: Depot | undefined) => depot?.kind === 'dc';

/** A "vendor" that is really an internal transfer lane from a DC. */
export const isTransferLane = (vendor: Vendor | undefined) => !!vendor?.dcDepotId;
