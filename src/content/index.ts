import type { Scenario } from '../engine/types';
import { SANDBOX_SCENARIO, TUTORIAL_SCENARIOS } from './scenarios';

export { ITEMS, ITEM_IDS } from './items';
export { VENDORS } from './vendors';
export { SOURCING } from './sourcing';
export { DEPOTS } from './depots';
export { BATTLE_PLANS, BATTLE_PLANS_BY_ID } from './battlePlans';
export { TUTORIAL_SCENARIOS, SANDBOX_SCENARIO, BASE_DEMAND } from './scenarios';

/** All playable levels: the tutorial campaign in order (first = 'tutorial-1'), then the sandbox. */
export const scenarios: Scenario[] = [...TUTORIAL_SCENARIOS, SANDBOX_SCENARIO];
