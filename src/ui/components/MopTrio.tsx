import { fmtQty } from '../format';
import { MOP_CAPTION, mopDriver } from '../mop';
import { Term } from './Term';

/** Safety stock, minimum fill and MOP as one group, with the deciding input marked. */
export function MopTrio({ safetyStock, minimumFill, mop }: { safetyStock: number; minimumFill: number; mop: number }) {
  const driver = mopDriver(safetyStock, minimumFill);
  const sets = (k: 'safetyStock' | 'minimumFill') => driver === k || driver === 'both';
  const tag = <span className="sets-mop">sets MOP</span>;

  return (
    <div className="mop-trio" role="group" aria-label={MOP_CAPTION}>
      <div className="mop-trio-caption">
        <Term k="mop">MOP</Term> = max(<Term k="safetyStock">safety stock</Term>, <Term k="minimumFill">minimum fill</Term>)
      </div>
      <dl className="facts mop-trio-facts">
        <dt className={sets('safetyStock') ? 'mop-driver' : undefined}>
          <Term k="safetyStock" /> {sets('safetyStock') && tag}
        </dt>
        <dd className={sets('safetyStock') ? 'mop-driver' : undefined} data-testid="planning-ss">
          {fmtQty(safetyStock)}
        </dd>
        <dt className={sets('minimumFill') ? 'mop-driver' : undefined}>
          <Term k="minimumFill" /> {sets('minimumFill') && tag}
        </dt>
        <dd className={sets('minimumFill') ? 'mop-driver' : undefined} data-testid="planning-min-fill">
          {fmtQty(minimumFill)}
        </dd>
        <dt className="mop-total">
          <Term k="mop">MOP</Term> <span className="muted">must order point</span>
        </dt>
        <dd className="mop-total" data-testid="planning-mop">
          {fmtQty(mop)}
        </dd>
      </dl>
    </div>
  );
}
