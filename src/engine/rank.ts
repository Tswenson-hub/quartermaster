// Career: reprimands, demotion, merit, promotion, battles, game over (docs/RELEX_RULES.md §9, §11).
import { serviceLevel } from './kpi';
import { rules as defaultRules, type Rules } from './rules.config';
import type {
  BattleOutcome,
  BattlePlan,
  DailyKpi,
  Day,
  FiscalPeriod,
  GameState,
  GameStatus,
  Letter,
  LetterKind,
  RankState,
} from './types';

export interface CareerUpdate {
  rank: RankState;
  letters: Letter[];
  battles: BattleOutcome[];
  status: GameStatus;
}

/** Days in the campaign. TODO(contract): GameState has no lengthDays; the store's market series has exactly lengthDays values. */
export function campaignLength(state: GameState): number {
  return state.market?.values.length ?? Infinity;
}

/**
 * Service level to a battle plan's depots over its window.
 * TODO(contract): per-location fulfilment isn't stored, so this uses the daily KPI rows over
 * the window (all locations). Exact once ItemLocation carries fulfilled history.
 */
export function battleServiceLevel(plan: BattlePlan, kpis: readonly DailyKpi[]): number {
  return serviceLevel(kpis.filter((k) => k.day >= plan.start && k.day <= plan.end));
}

/**
 * Career events at the end of day t, in order: fiscal period close (reprimand / merit),
 * battles whose window ended on t, promotion, then demotion below level 0 → game over;
 * otherwise 'complete' once the campaign's last day is played.
 * `kpis` includes day t; `period` is the period that closed on t, if any.
 */
export function updateCareer(
  state: GameState,
  t: Day,
  kpis: readonly DailyKpi[],
  period: FiscalPeriod | undefined,
  r: Rules = defaultRules,
): CareerUpdate {
  const R = r.rank;
  const rank: RankState = { ...state.rank };
  const letters: Letter[] = [];
  const battles: BattleOutcome[] = [];
  const decidedOn = t + 1;
  const letter = (kind: LetterKind, from: string, subject: string, body: string, battlePlanId?: string) =>
    letters.push({
      id: `L${decidedOn}-${letters.length + 1}-${kind}${battlePlanId ? `-${battlePlanId}` : ''}`,
      day: decidedOn,
      kind,
      from,
      subject,
      body,
      ...(battlePlanId ? { battlePlanId } : {}),
    });

  const demote = (levels: number, why: string) => {
    rank.level -= levels;
    rank.reprimands = 0;
    rank.merit = 0;
    letter('demotion', 'The Marshal', 'Reduced in rank', `${why} You are reduced to rank ${rank.level}.`);
  };

  if (period && period.end === t) {
    const overspend = period.committed - period.allowance;
    const sl = serviceLevel(kpis.filter((k) => k.day >= period.start && k.day <= t));
    if (overspend > period.allowance * R.reprimandOverspendPct) {
      rank.overspentStreak += 1;
      rank.reprimands += 1;
      letter(
        'reprimand',
        'The Royal Treasury',
        `Letter of reprimand — period ${period.index + 1}`,
        `You spent ${Math.round(period.committed)} silver against an allowance of ${Math.round(period.allowance)}. ` +
          `This is reprimand ${rank.reprimands} of ${R.reprimandsPerDemotion}.`,
      );
      if (rank.reprimands >= R.reprimandsPerDemotion) demote(1, 'The Treasury has lost patience with your accounts.');
    } else {
      rank.overspentStreak = 0;
      if (overspend <= 0 && sl >= R.meritServiceLevel) {
        rank.merit += R.meritPerGoodPeriod;
        letter(
          'commendation',
          'The Marshal',
          `Commendation — period ${period.index + 1}`,
          `On budget, and ${Math.round(sl * 100)}% of the army's needs met. Merit ${rank.merit} of ${R.promotionMerit}.`,
        );
      }
    }
  }

  for (const plan of state.battlePlans) {
    if (plan.end !== t) continue;
    const sl = battleServiceLevel(plan, kpis);
    const won = sl >= R.battleWinServiceLevel;
    battles.push({ battlePlanId: plan.id, day: decidedOn, won, serviceLevel: sl });
    if (won) {
      rank.merit += R.meritPerBattleWon;
      letter('battle-won', 'The Marshal', `Victory: ${plan.title}`, `The army was ${Math.round(sl * 100)}% supplied and carried the day.`, plan.id);
    } else {
      letter('battle-lost', 'The Marshal', `Defeat: ${plan.title}`, `Only ${Math.round(sl * 100)}% of the army's needs were met. The battle is lost.`, plan.id);
      demote(R.levelsLostPerBattle, `The defeat at ${plan.title} is laid at your door.`);
    }
  }

  if (rank.merit >= R.promotionMerit && rank.level < R.maxLevel && rank.level >= 0) {
    rank.level += 1;
    rank.merit = 0;
    rank.reprimands = 0;
    letter('promotion', 'The Marshal', 'Promotion', `For a well-kept army and honest books you are raised to rank ${rank.level}.`);
  }

  let status: GameStatus = state.status;
  if (rank.level < 0) {
    status = 'lost';
    letter('game-over', 'The Crown', 'Dismissed', 'You are stripped of your commission. The campaign goes on without you.');
  } else if (decidedOn >= campaignLength(state)) {
    status = 'complete';
  }
  return { rank, letters, battles, status };
}
