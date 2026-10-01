import { fmtDay } from '../format';
import { useCampaignDay, useGame } from '../hooks';
import { useUiStore } from '../uiStore';
import { Panel } from './Panel';

/** One-time note on the first morning: the campaign was already running before the player arrived. */
export function TakeoverNote() {
  const game = useGame();
  const campaign = useCampaignDay();
  const seen = useUiStore((s) => s.seenTakeover);
  const dismiss = useUiStore((s) => s.dismissTakeover);
  // Only on the takeover morning: after that the numbers in it would no longer describe the handover.
  if (!game || !campaign || seen || campaign.inheritedDays <= 0 || game.today !== game.startDay) return null;
  const inTransit = game.openOrders.length;

  return (
    <Panel
      className="takeover"
      testId="takeover-note"
      title="You take command"
      flavour={`${fmtDay(game.startDay)}. The seal of office is yours.`}
      actions={
        <button type="button" className="btn btn-primary" onClick={dismiss} data-testid="takeover-dismiss">
          Take the ledger
        </button>
      }
    >
      <p className="letter-body">
        The previous quartermaster ran the stores for {campaign.inheritedDays} days before you. Everything they set in motion is
        now yours: {inTransit > 0 ? `${inTransit} wagon${inTransit === 1 ? '' : 's'} already on the road, ` : ''}the ledger of
        what the army ate, and the merchants’ record of who delivers on time. You have {campaign.total} days of command
        ahead.
      </p>
      <p className="muted small">
        The KPIs start fresh from today (switch to “Inherited record” to see your predecessor’s). Demand history and vendor
        performance carry over, so the forecasts already have something to go on.
      </p>
    </Panel>
  );
}
