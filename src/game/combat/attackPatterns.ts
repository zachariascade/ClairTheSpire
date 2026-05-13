export type AttackId = "quick-slash" | "heavy-overhead" | "three-hit-combo" | "orbital-laser" | "shield-breaker";

export type AttackHit = {
  atMs: number;
  damage: number;
  label: string;
};

export type AttackPattern = {
  id: AttackId;
  name: string;
  cue: string;
  defense: "reaction" | "shield";
  recoveryMs: number;
  perfectParryWindowMs: number;
  normalParryWindowMs: number;
  dodgeWindowMs: number;
  hits: AttackHit[];
};

export const attackPatterns: Record<AttackId, AttackPattern> = {
  "quick-slash": {
    id: "quick-slash",
    name: "Quick Slash",
    cue: "Fast single hit",
    defense: "reaction",
    recoveryMs: 420,
    perfectParryWindowMs: 100,
    normalParryWindowMs: 150,
    dodgeWindowMs: 250,
    hits: [{ atMs: 920, damage: 8, label: "Slash" }],
  },
  "heavy-overhead": {
    id: "heavy-overhead",
    name: "Heavy Overhead",
    cue: "Delayed heavy strike",
    defense: "reaction",
    recoveryMs: 520,
    perfectParryWindowMs: 100,
    normalParryWindowMs: 150,
    dodgeWindowMs: 250,
    hits: [{ atMs: 1500, damage: 13, label: "Overhead" }],
  },
  "three-hit-combo": {
    id: "three-hit-combo",
    name: "Three-Hit Combo",
    cue: "Three spaced beats",
    defense: "reaction",
    recoveryMs: 640,
    perfectParryWindowMs: 100,
    normalParryWindowMs: 150,
    dodgeWindowMs: 250,
    hits: [
      { atMs: 850, damage: 4, label: "First" },
      { atMs: 1500, damage: 4, label: "Second" },
      { atMs: 2250, damage: 7, label: "Final" },
    ],
  },
  "orbital-laser": {
    id: "orbital-laser",
    name: "Orbital Laser",
    cue: "Six rotating beams",
    defense: "reaction",
    recoveryMs: 760,
    perfectParryWindowMs: 90,
    normalParryWindowMs: 140,
    dodgeWindowMs: 230,
    hits: [
      { atMs: 1200, damage: 3, label: "Orb I" },
      { atMs: 2000, damage: 3, label: "Orb II" },
      { atMs: 2800, damage: 3, label: "Orb III" },
      { atMs: 3600, damage: 3, label: "Orb IV" },
      { atMs: 4400, damage: 3, label: "Orb V" },
      { atMs: 5200, damage: 3, label: "Orb VI" },
    ],
  },
  "shield-breaker": {
    id: "shield-breaker",
    name: "Shield Breaker",
    cue: "Shield-only blast",
    defense: "shield",
    recoveryMs: 680,
    perfectParryWindowMs: 0,
    normalParryWindowMs: 0,
    dodgeWindowMs: 0,
    hits: [{ atMs: 1850, damage: 16, label: "Breaker" }],
  },
};

export const attackOrder: AttackId[] = ["quick-slash", "heavy-overhead", "three-hit-combo", "orbital-laser", "shield-breaker"];

export const getNextAttackId = (attackId: AttackId): AttackId => {
  const index = attackOrder.indexOf(attackId);
  return attackOrder[(index + 1) % attackOrder.length];
};

export const getAttackDuration = (pattern: AttackPattern): number => {
  const lastHit = pattern.hits[pattern.hits.length - 1];
  return lastHit.atMs + pattern.dodgeWindowMs + pattern.recoveryMs;
};
