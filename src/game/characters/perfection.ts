import type { CharacterMechanicState, PerfectionMechanicState, PerfectionRank } from "./types";

export const PERFECTION_GAIN_ON_ENEMY_HIT = 5;

export const perfectionRankRules: Record<PerfectionRank, { label: PerfectionRank; threshold: number; damageDealt: number }> = {
  C: {
    label: "C",
    threshold: 0,
    damageDealt: 1,
  },
  B: {
    label: "B",
    threshold: 30,
    damageDealt: 1.1,
  },
  A: {
    label: "A",
    threshold: 60,
    damageDealt: 1.25,
  },
  S: {
    label: "S",
    threshold: 100,
    damageDealt: 1.5,
  },
};

export const getPerfectionRank = (mechanic: PerfectionMechanicState): PerfectionRank => {
  if (mechanic.perfection >= perfectionRankRules.S.threshold) {
    return "S";
  }

  if (mechanic.perfection >= perfectionRankRules.A.threshold) {
    return "A";
  }

  if (mechanic.perfection >= perfectionRankRules.B.threshold) {
    return "B";
  }

  return "C";
};

export const getPerfectionDamageDealtMultiplier = (mechanic: CharacterMechanicState): number => {
  if (mechanic.type !== "perfection") {
    return 1;
  }

  return perfectionRankRules[getPerfectionRank(mechanic)].damageDealt;
};

export const applyPerfectionDamageDealt = (mechanic: CharacterMechanicState, damage: number): number =>
  Math.round(damage * getPerfectionDamageDealtMultiplier(mechanic));
