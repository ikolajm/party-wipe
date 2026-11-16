/**
 * The game's one source of randomness. A `?seed=` in the URL makes every roll,
 * room, encounter and drop repeat from that seed, so a capture plays the same
 * on every take; without one it is Math.random.
 */

let next: (() => number) | null = null;

// mulberry32
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

function init(): () => number {
  const seed = typeof window === 'undefined'
    ? null
    : new URLSearchParams(window.location.search).get('seed');
  return seed ? seeded(hash(seed)) : Math.random;
}

export function random(): number {
  if (!next) next = init();
  return next();
}
