import { describe, expect, it } from 'vitest';
import { createRng, hashSeed, rngForDay } from '../../src/engine/rng';

describe('rng', () => {
  it('is deterministic per seed', () => {
    const a = createRng(7);
    const b = createRng(7);
    const xs = Array.from({ length: 5 }, () => a.next());
    expect(Array.from({ length: 5 }, () => b.next())).toEqual(xs);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(createRng(8).next()).not.toBe(xs[0]);
  });

  it('day streams differ and are reproducible', () => {
    expect(rngForDay(1, 3).next()).toBe(rngForDay(1, 3).next());
    expect(rngForDay(1, 3).next()).not.toBe(rngForDay(1, 4).next());
    expect(hashSeed(1, 2)).not.toBe(hashSeed(2, 1));
  });

  it('normal() has roughly mean 0, sd 1', () => {
    const r = createRng(123);
    const xs = Array.from({ length: 20000 }, () => r.normal());
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
    expect(Math.abs(mean)).toBeLessThan(0.03);
    expect(Math.abs(sd - 1)).toBeLessThan(0.03);
  });
});
