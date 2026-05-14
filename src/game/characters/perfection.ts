import type { CharacterMechanicState, PerfectionMechanicState, PerfectionRank } from "./types";

export const PERFECTION_GAIN_ON_ENEMY_HIT = 1;

export const perfectionRankRules: Record<PerfectionRank, { label: PerfectionRank; threshold: number; strength: number }> = {
  D: {
    label: "D",
    threshold: 0,
    strength: 0,
  },
  C: {
    label: "C",
    threshold: 2,
    strength: 1,
  },
  B: {
    label: "B",
    threshold: 3,
    strength: 2,
  },
  A: {
    label: "A",
    threshold: 5,
    strength: 3,
  },
  S: {
    label: "S",
    threshold: 9,
    strength: 5,
  },
};

export const perfectionRankOrder: PerfectionRank[] = ["D", "C", "B", "A", "S"];

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

  if (mechanic.perfection >= perfectionRankRules.C.threshold) {
    return "C";
  }

  return "D";
};

export const losePerfectionRank = (mechanic: PerfectionMechanicState): PerfectionMechanicState => {
  const rank = getPerfectionRank(mechanic);
  const rankIndex = perfectionRankOrder.indexOf(rank);
  const previousRank = perfectionRankOrder[Math.max(0, rankIndex - 1)];

  return {
    ...mechanic,
    perfection: perfectionRankRules[previousRank].threshold,
  };
};

export const getPerfectionTierProgress = (mechanic: PerfectionMechanicState): number => {
  const rank = getPerfectionRank(mechanic);
  const rankIndex = perfectionRankOrder.indexOf(rank);
  const nextRank = perfectionRankOrder[rankIndex + 1];

  if (!nextRank) {
    return 100;
  }

  const currentThreshold = perfectionRankRules[rank].threshold;
  const nextThreshold = perfectionRankRules[nextRank].threshold;
  const tierSpan = Math.max(1, nextThreshold - currentThreshold);

  return Math.max(0, Math.min(100, ((mechanic.perfection - currentThreshold) / tierSpan) * 100));
};

export const getPerfectionStrength = (mechanic: CharacterMechanicState): number => {
  if (mechanic.type !== "perfection") {
    return 0;
  }

  return perfectionRankRules[getPerfectionRank(mechanic)].strength;
};

export const applyPerfectionStrengthDamage = (mechanic: CharacterMechanicState, damage: number): number =>
  Math.round(damage) + getPerfectionStrength(mechanic);
