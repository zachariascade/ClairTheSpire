import type { CombatState } from "../combat/types";
import type { StanceId } from "./types";

export const stanceRules: Record<
  StanceId,
  { label: string; helperText: string; strength: number; dexterity: number; color: string }
> = {
  neutral: {
    label: "Neutral",
    helperText: "No bonus.",
    strength: 0,
    dexterity: 0,
    color: "#a8abb2",
  },
  offensive: {
    label: "Offensive",
    helperText: "+3 Strength. -3 Dexterity.",
    strength: 3,
    dexterity: -3,
    color: "#e25d5d",
  },
  virtuoso: {
    label: "Virtuoso",
    helperText: "+5 Strength. +5 Dexterity.",
    strength: 5,
    dexterity: 5,
    color: "#b278ff",
  },
  defensive: {
    label: "Defensive",
    helperText: "+3 Dexterity. -3 Strength.",
    strength: -3,
    dexterity: 3,
    color: "#6fa8ff",
  },
};

export const stanceOrder: StanceId[] = ["neutral", "offensive", "virtuoso", "defensive"];

export const getCurrentStance = (state: CombatState): StanceId | null =>
  state.player.mechanic.type === "stance" ? state.player.mechanic.stance : null;

export const getStanceStrength = (state: CombatState): number => {
  const stance = getCurrentStance(state);

  return stance ? stanceRules[stance].strength : 0;
};

export const getStanceDexterity = (state: CombatState): number => {
  const stance = getCurrentStance(state);

  return stance ? stanceRules[stance].dexterity : 0;
};
