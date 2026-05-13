import type { CombatState } from "../combat/types";
import type { StanceId } from "./types";

export const stanceRules: Record<
  StanceId,
  { label: string; helperText: string; damageDealt: number; damageReceived: number; color: string }
> = {
  neutral: {
    label: "Neutral",
    helperText: "No buff.",
    damageDealt: 1,
    damageReceived: 1,
    color: "#a8abb2",
  },
  offensive: {
    label: "Offensive",
    helperText: "Deal 1.25x damage. Receive 1.25x damage.",
    damageDealt: 1.25,
    damageReceived: 1.25,
    color: "#e25d5d",
  },
  virtuoso: {
    label: "Virtuoso",
    helperText: "Deal 1.5x damage.",
    damageDealt: 1.5,
    damageReceived: 1,
    color: "#b278ff",
  },
  defensive: {
    label: "Defensive",
    helperText: "Deal 0.75x damage. Receive 0.75x damage.",
    damageDealt: 0.75,
    damageReceived: 0.75,
    color: "#6fa8ff",
  },
};

export const stanceOrder: StanceId[] = ["neutral", "offensive", "virtuoso", "defensive"];

export const getCurrentStance = (state: CombatState): StanceId | null =>
  state.player.mechanic.type === "stance" ? state.player.mechanic.stance : null;

export const applyStanceDamageDealt = (state: CombatState, damage: number): number => {
  const stance = getCurrentStance(state);

  return Math.round(damage * (stance ? stanceRules[stance].damageDealt : 1));
};

export const applyStanceDamageReceived = (state: CombatState, damage: number): number => {
  const stance = getCurrentStance(state);

  return Math.round(damage * (stance ? stanceRules[stance].damageReceived : 1));
};
