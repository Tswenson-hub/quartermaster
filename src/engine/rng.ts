// Seeded, deterministic RNG. The engine never calls Math.random.

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Standard normal (mean 0, sd 1). */
  normal(): number;
}

/** Mix several integers into one 32-bit seed (FNV-1a over the 4 bytes of each part). */
export function hashSeed(...parts: number[]): number {
  let h = 0x811c9dc5;
  for (const part of parts) {
    let v = Math.trunc(part) >>> 0;
    for (let i = 0; i < 4; i++) {
      h ^= v & 0xff;
      h = Math.imul(h, 0x01000193) >>> 0;
      v >>>= 8;
    }
  }
  return h >>> 0;
}

/** mulberry32 — small, fast, good enough for a game. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const normal = () => {
    // Box–Muller; 1 - u keeps the log argument in (0, 1].
    const u = 1 - next();
    const v = next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  return { next, normal };
}

/** RNG for one simulated day, so advanceDay needs no RNG state stored in GameState. */
export function rngForDay(seed: number, day: number): Rng {
  return createRng(hashSeed(seed, day));
}
