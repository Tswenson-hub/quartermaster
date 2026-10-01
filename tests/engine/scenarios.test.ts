// Regression: a player who accepts every proposal should be well served on the tutorials.
import { describe, expect, it } from 'vitest';
import { scenarios } from '../../src/content';
import { acceptAll, serviceLevel } from './play';

describe('accept-all on content scenarios', () => {
  it('tutorial-2 (abbey, LT 3, Mon/Thu) keeps service ≥ 95%', () => {
    const s = acceptAll(scenarios.find((x) => x.id === 'tutorial-2')!);
    expect(serviceLevel(s)).toBeGreaterThanOrEqual(0.95);
  });

  it.each(scenarios.map((x) => [x.id, x] as const))('%s keeps service ≥ 95%%', (_id, scenario) => {
    expect(serviceLevel(acceptAll(scenario))).toBeGreaterThanOrEqual(0.95);
  });

  it.each(scenarios.map((x) => [x.id, x] as const))('%s is deterministic', (_id, scenario) => {
    expect(acceptAll(scenario)).toEqual(acceptAll(scenario));
  });
});
