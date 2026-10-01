// Regression: a player who accepts every proposal should be well served on the tutorials.
import { describe, expect, it } from 'vitest';
import { scenarios } from '../../src/content';
import type { Scenario } from '../../src/engine/types';
import { acceptAll, asPlayerWouldFix, isOverrideLesson, isTriggerLesson, serviceLevel } from './play';

describe('accept-all on content scenarios', () => {
  it('tutorial-2 (abbey, LT 3, Mon/Thu) keeps service ≥ 95%', () => {
    const s = acceptAll(scenarios.find((x) => x.id === 'tutorial-2')!);
    expect(serviceLevel(s)).toBeGreaterThanOrEqual(0.95);
  });

  // Defaults must reach ≥ 95%, except lessons that expect a player action first (see asPlayerWouldFix):
  // order-trigger lessons lower triggers; forecast-override lessons reveal the true surge.
  const cases = scenarios.map((x) => {
    const fix = asPlayerWouldFix(x);
    return [`${x.id}${fix.note}`, fix] as const;
  });

  it.each(cases)('%s keeps service ≥ 95%%', (_id, fix) => {
    expect(serviceLevel(acceptAll(fix.scenario, fix.lowerTriggers))).toBeGreaterThanOrEqual(0.95);
  });

  it.each(cases)('%s is deterministic', (_id, fix) => {
    expect(acceptAll(fix.scenario, fix.lowerTriggers)).toEqual(acceptAll(fix.scenario, fix.lowerTriggers));
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
    const fix = asPlayerWouldFix(lesson);
    expect(serviceLevel(acceptAll(fix.scenario, fix.lowerTriggers))).toBeGreaterThanOrEqual(0.95);
  });
});

describe('forecast-override lesson rule', () => {
  const lesson = scenarios.find(isOverrideLesson);

  it('content has an override lesson, and its fix reveals the true surge', () => {
    expect(lesson).toBeDefined();
    const fix = asPlayerWouldFix(lesson!);
    expect(fix.note).toBe(' (surge overridden)');
    expect(fix.scenario.initial.battlePlans.length).toBeGreaterThan(0);
    for (const b of fix.scenario.initial.battlePlans) expect(b.statedUplift).toEqual(b.actualUplift);
    expect(lesson!.initial.battlePlans).not.toBe(fix.scenario.initial.battlePlans); // original untouched
  });

  it('other scenarios are played as-is', () => {
    const plain = scenarios.find((x) => !isOverrideLesson(x) && !isTriggerLesson(x))!;
    expect(asPlayerWouldFix(plain)).toEqual({ scenario: plain, lowerTriggers: false, note: '' });
  });
});
