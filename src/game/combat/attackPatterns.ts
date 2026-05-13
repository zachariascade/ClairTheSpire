export type AttackId = "quick-slash" | "heavy-overhead" | "three-hit-combo";

export type AttackHit = {
  atMs: number;
  damage: number;
  label: string;
};

export type AttackPattern = {
  id: AttackId;
  name: string;
  cue: string;
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
    recoveryMs: 420,
    perfectParryWindowMs: 160,
    normalParryWindowMs: 360,
    dodgeWindowMs: 460,
    hits: [{ atMs: 920, damage: 8, label: "Slash" }],
  },
  "heavy-overhead": {
    id: "heavy-overhead",
    name: "Heavy Overhead",
    cue: "Delayed heavy strike",
    recoveryMs: 520,
    perfectParryWindowMs: 170,
    normalParryWindowMs: 380,
    dodgeWindowMs: 520,
    hits: [{ atMs: 1500, damage: 13, label: "Overhead" }],
  },
  "three-hit-combo": {
    id: "three-hit-combo",
    name: "Three-Hit Combo",
    cue: "Three spaced beats",
    recoveryMs: 640,
    perfectParryWindowMs: 140,
    normalParryWindowMs: 320,
    dodgeWindowMs: 420,
    hits: [
      { atMs: 850, damage: 4, label: "First" },
      { atMs: 1500, damage: 4, label: "Second" },
      { atMs: 2250, damage: 7, label: "Final" },
    ],
  },
};

export const attackOrder: AttackId[] = ["quick-slash", "heavy-overhead", "three-hit-combo"];

export const getNextAttackId = (attackId: AttackId): AttackId => {
  const index = attackOrder.indexOf(attackId);
  return attackOrder[(index + 1) % attackOrder.length];
};

export const getAttackDuration = (pattern: AttackPattern): number => {
  const lastHit = pattern.hits[pattern.hits.length - 1];
  return lastHit.atMs + pattern.dodgeWindowMs + pattern.recoveryMs;
};
