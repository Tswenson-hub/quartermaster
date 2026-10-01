// Regression: a player who accepts every proposal should be well served on the tutorials.
import { describe, expect, it } from 'vitest';
import { scenarios } from '../../src/content';
import type { Scenario } from '../../src/engine/types';
import { acceptAll, isTriggerLesson, serviceLevel } from './play';

describe('accept-all on content scenarios', () => {
  it('tutorial-2 (abbey, LT 3, Mon/Thu) keeps service ≥ 95%', () => {
    const s = acceptAll(scenarios.find((x) => x.id === 'tutorial-2')!);
    expect(serviceLevel(s)).toBeGreaterThanOrEqual(0.95);
  });

  // Defaults must reach ≥ 95%, except order-trigger lessons (teaches 'order trigger'), whose
  // deliberately high triggers the player first lowers to the rules default.
  it.each(scenarios.map((x) => [`${x.id}${isTriggerLesson(x) ? ' (triggers lowered)' : ''}`, x] as const))(
    '%s keeps service ≥ 95%%',
    (_id, scenario) => {
      expect(serviceLevel(acceptAll(scenario, isTriggerLesson(scenario)))).toBeGreaterThanOrEqual(0.95);
    },
  );

  it.each(scenarios.map((x) => [x.id, x] as const))('%s is deterministic', (_id, scenario) => {
    const lower = isTriggerLesson(scenario);
    expect(acceptAll(scenario, lower)).toEqual(acceptAll(scenario, lower));
  });
});

describe('order-trigger lesson rule', () => {
  // tutorial-5 with every vendor's trigger at 500%: nothing can be built until the player lowers it.
  const base = scenarios.find((x) => x.id === 'tutorial-5')!;
  const lesson: Scenario = {
    ...base,
    id: 'trigger-lesson-fixture',
    teaches: [...base.teaches, 'order trigger'],
    initial: {
      ...base.initial,
      vendors: Object.fromEntries(Object.entries(base.initial.vendors).map(([id, v]) => [id, { ...v, orderTrigger: 5 }])),
    },
  };

  it('is detected from teaches', () => {
    expect(isTriggerLesson(lesson)).toBe(true);
    expect(isTriggerLesson({ ...base, teaches: base.teaches.filter((t) => t !== 'order trigger') })).toBe(false);
  });

  it('high triggers starve the army; lowering them to the default restores ≥ 95%', () => {
    const untouched = acceptAll(lesson);
    expect(untouched.vendorPlans.every((p) => p.status !== 'built')).toBe(true);
    expect(serviceLevel(untouched)).toBeLessThan(0.95);
    expect(serviceLevel(acceptAll(lesson, true))).toBeGreaterThanOrEqual(0.95);
  });
});
