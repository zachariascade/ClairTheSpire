import type { CombatState } from "../combat/types";
import type { StanceId } from "./types";

export const stanceRules: Record<
  StanceId,
  { label: string; helperText: string; strength: number; dexterity: number; color: string }
> = {
  neutral: {
    label: "Neutral",
    helperText: "No innate bonus.",
    strength: 0,
    dexterity: 0,
    color: "#a8abb2",
  },
  offensive: {
    label: "Offensive",
    helperText: "No innate bonus.",
    strength: 0,
    dexterity: 0,
    color: "#e25d5d",
  },
  virtuoso: {
    label: "Virtuoso",
    helperText: "No innate bonus.",
    strength: 0,
    dexterity: 0,
    color: "#b278ff",
  },
  defensive: {
    label: "Defensive",
    helperText: "No innate bonus.",
    strength: 0,
    dexterity: 0,
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

const hasRelic = (state: CombatState, relicId: string) => state.player.relics.some((relic) => relic.id === relicId);

export const getStanceDexterity = (state: CombatState): number => {
  const stance = getCurrentStance(state);

  if (!stance) {
    return 0;
  }

  const relicDexterity = stance === "defensive" && hasRelic(state, "defensive-dexterity") ? 3 : 0;

  return stanceRules[stance].dexterity + relicDexterity;
};
