import type { StatusDuration, StatusId } from "./statuses";
import type { StanceId } from "../characters/types";

export type CardKind = "attack" | "skill" | "power";
export type CardPool = "colorless" | "perfector" | "fencer";
export type CardPlayCondition = {
  type: "stance";
  stance: StanceId;
};
export type CardPresentationDamage =
  | {
      type: "fixed";
      amount: number;
    }
  | {
      type: "spendPerfection";
      baseDamage: number;
      damagePerPerfection: number;
    }
  | {
      type: "stanceTransitions";
      baseDamage: number;
      damagePerTransition: number;
    };
export type CardPresentationStep =
  | {
      type: "attack";
      target: "enemy";
      damage: CardPresentationDamage;
      animation: "slash" | "heavy";
      delayMs: number;
    }
  | {
      type: "status";
      target: "enemy" | "player";
      label: string;
      tone: "good" | "bad";
      delayMs: number;
    }
  | {
      type: "block";
      target: "player";
      amount: number;
      delayMs: number;
    }
  | {
      type: "poise";
      target: "player";
      amount: number;
      delayMs: number;
    }
  | {
      type: "stance";
      target: "player";
      label: string;
      delayMs: number;
    };

export type CombatEffect =
  | {
      type: "damage";
      target: "enemy" | "player";
      amount: number;
      log?: string;
    }
  | {
      type: "gainBlock";
      amount: number;
      log?: string;
    }
  | {
      type: "gainEnergy";
      amount: number;
      log?: string;
    }
  | {
      type: "gainPoise";
      amount: number;
      log?: string;
    }
  | {
      type: "applyStatus";
      target: "enemy" | "player";
      status: StatusId;
      stacks?: number;
      duration?: StatusDuration;
      log?: string;
    }
  | {
      type: "spendPerfectionDamage";
      target: "enemy";
      baseDamage: number;
      damagePerPerfection: number;
    }
  | {
      type: "changeStance";
      stance: StanceId;
      log?: string;
    }
  | {
      type: "damagePerStanceTransition";
      target: "enemy";
      baseDamage: number;
      damagePerTransition: number;
      log?: string;
    };

export type CardDefinition = {
  id: string;
  name: string;
  cost: number;
  kind: CardKind;
  rulesText: string;
  pool: CardPool;
  target: "enemy" | "self" | "none";
  playCondition?: CardPlayCondition;
  effects: CombatEffect[];
  presentation: CardPresentationStep[];
};

export const getCardPlayBlockReason = (
  definition: CardDefinition,
  mechanic: { type: string; stance?: StanceId },
): string | null => {
  if (!definition.playCondition) {
    return null;
  }

  if (definition.playCondition.type === "stance" && mechanic.stance !== definition.playCondition.stance) {
    return `Requires ${definition.playCondition.stance[0].toUpperCase()}${definition.playCondition.stance.slice(1)} Stance.`;
  }

  return null;
};

export const cardDefinitions: Record<string, CardDefinition> = {
  strike: {
    id: "strike",
    name: "Strike",
    cost: 1,
    kind: "attack",
    rulesText: "Deal 6 damage.",
    pool: "colorless",
    target: "enemy",
    effects: [{ type: "damage", target: "enemy", amount: 6, log: "Strike deals 6 damage." }],
    presentation: [{ type: "attack", target: "enemy", damage: { type: "fixed", amount: 6 }, animation: "slash", delayMs: 0 }],
  },
  guard: {
    id: "guard",
    name: "Guard",
    cost: 1,
    kind: "skill",
    rulesText: "Gain 5 Block.",
    pool: "colorless",
    target: "self",
    effects: [{ type: "gainBlock", amount: 5 }],
    presentation: [{ type: "block", target: "player", amount: 5, delayMs: 0 }],
  },
  poise: {
    id: "poise",
    name: "Poise",
    cost: 1,
    kind: "skill",
    rulesText: "Gain 1 Poise.",
    pool: "colorless",
    target: "self",
    effects: [{ type: "gainPoise", amount: 1, log: "Poise restores 1 Poise." }],
    presentation: [{ type: "poise", target: "player", amount: 1, delayMs: 0 }],
  },
  focus: {
    id: "focus",
    name: "Focus",
    cost: 1,
    kind: "skill",
    rulesText: "Widen the next parry window.",
    pool: "colorless",
    target: "self",
    effects: [{ type: "applyStatus", target: "player", status: "focus", log: "Focus widens the next parry window." }],
    presentation: [{ type: "status", target: "player", label: "Focus", tone: "good", delayMs: 0 }],
  },
  "riposte-prep": {
    id: "riposte-prep",
    name: "Counter Attack",
    cost: 1,
    kind: "skill",
    rulesText: "This turn, all parries counter for 3 damage.",
    pool: "perfector",
    target: "self",
    effects: [
      { type: "applyStatus", target: "player", status: "riposte-prep", log: "Counter Attack readies your parries." },
    ],
    presentation: [{ type: "status", target: "player", label: "Counter Ready", tone: "good", delayMs: 0 }],
  },
  expose: {
    id: "expose",
    name: "Expose",
    cost: 1,
    kind: "skill",
    rulesText: "Apply 1 Vulnerable.",
    pool: "perfector",
    target: "enemy",
    effects: [
      {
        type: "applyStatus",
        target: "enemy",
        status: "vulnerable",
        stacks: 1,
        duration: "combat",
        log: "Expose leaves the enemy vulnerable.",
      },
    ],
    presentation: [{ type: "status", target: "enemy", label: "Vulnerable", tone: "bad", delayMs: 0 }],
  },
  flurry: {
    id: "flurry",
    name: "Flurry",
    cost: 2,
    kind: "attack",
    rulesText: "Deal 3 damage 4 times.",
    pool: "perfector",
    target: "enemy",
    effects: [
      { type: "damage", target: "enemy", amount: 3, log: "Flurry opens with a cut." },
      { type: "damage", target: "enemy", amount: 3 },
      { type: "damage", target: "enemy", amount: 3 },
      { type: "damage", target: "enemy", amount: 3, log: "Flurry finishes the rush." },
    ],
    presentation: [
      { type: "attack", target: "enemy", damage: { type: "fixed", amount: 3 }, animation: "slash", delayMs: 0 },
      { type: "attack", target: "enemy", damage: { type: "fixed", amount: 3 }, animation: "slash", delayMs: 170 },
      { type: "attack", target: "enemy", damage: { type: "fixed", amount: 3 }, animation: "slash", delayMs: 340 },
      { type: "attack", target: "enemy", damage: { type: "fixed", amount: 3 }, animation: "slash", delayMs: 510 },
    ],
  },
  crescendo: {
    id: "crescendo",
    name: "Crescendo",
    cost: 2,
    kind: "attack",
    rulesText: "Deal 4 damage. +1 damage per 5 Perfection. Spend all Perfection.",
    pool: "perfector",
    target: "enemy",
    effects: [{ type: "spendPerfectionDamage", target: "enemy", baseDamage: 4, damagePerPerfection: 0.2 }],
    presentation: [
      {
        type: "attack",
        target: "enemy",
        damage: { type: "spendPerfection", baseDamage: 4, damagePerPerfection: 0.2 },
        animation: "heavy",
        delayMs: 0,
      },
    ],
  },
  lunge: {
    id: "lunge",
    name: "Lunge",
    cost: 1,
    kind: "attack",
    rulesText: "Deal 5 damage. Enter Offensive.",
    pool: "fencer",
    target: "enemy",
    effects: [
      { type: "damage", target: "enemy", amount: 5, log: "Lunge presses the opening." },
      { type: "changeStance", stance: "offensive", log: "You enter Offensive Stance." },
    ],
    presentation: [
      { type: "attack", target: "enemy", damage: { type: "fixed", amount: 5 }, animation: "slash", delayMs: 0 },
      { type: "stance", target: "player", label: "Offensive", delayMs: 120 },
    ],
  },
  "elegant-flourish": {
    id: "elegant-flourish",
    name: "Elegant Flourish",
    cost: 1,
    kind: "attack",
    rulesText: "Deal 5 damage. Enter Virtuoso.",
    pool: "fencer",
    target: "enemy",
    effects: [
      { type: "damage", target: "enemy", amount: 5, log: "Elegant Flourish cuts in." },
      { type: "changeStance", stance: "virtuoso", log: "You enter Virtuoso Stance." },
    ],
    presentation: [
      { type: "attack", target: "enemy", damage: { type: "fixed", amount: 5 }, animation: "slash", delayMs: 0 },
      { type: "stance", target: "player", label: "Virtuoso", delayMs: 120 },
    ],
  },
  brace: {
    id: "brace",
    name: "Brace",
    cost: 0,
    kind: "skill",
    rulesText: "Enter Defensive.",
    pool: "fencer",
    target: "self",
    effects: [{ type: "changeStance", stance: "defensive", log: "You enter Defensive Stance." }],
    presentation: [{ type: "stance", target: "player", label: "Defensive", delayMs: 0 }],
  },
  measure: {
    id: "measure",
    name: "Measure",
    cost: 1,
    kind: "skill",
    rulesText: "Gain 4 block. Enter Neutral.",
    pool: "fencer",
    target: "self",
    effects: [
      { type: "gainBlock", amount: 4, log: "Measure steadies your guard." },
      { type: "changeStance", stance: "neutral", log: "You return to Neutral Stance." },
    ],
    presentation: [
      { type: "block", target: "player", amount: 4, delayMs: 0 },
      { type: "stance", target: "player", label: "Neutral", delayMs: 120 },
    ],
  },
  "riposte-line": {
    id: "riposte-line",
    name: "Riposte Line",
    cost: 1,
    kind: "skill",
    rulesText: "This turn, all parries counter for 3 damage. Enter Offensive.",
    pool: "fencer",
    target: "self",
    effects: [
      { type: "applyStatus", target: "player", status: "riposte-prep", log: "Riposte Line readies your parries." },
      { type: "changeStance", stance: "offensive", log: "You enter Offensive Stance." },
    ],
    presentation: [
      { type: "status", target: "player", label: "Counter Ready", tone: "good", delayMs: 0 },
      { type: "stance", target: "player", label: "Offensive", delayMs: 120 },
    ],
  },
  "flow-state": {
    id: "flow-state",
    name: "Flow State",
    cost: 2,
    kind: "attack",
    rulesText: "Deal 6 damage. +3 per stance transition this turn.",
    pool: "fencer",
    target: "enemy",
    effects: [{ type: "damagePerStanceTransition", target: "enemy", baseDamage: 6, damagePerTransition: 3 }],
    presentation: [
      {
        type: "attack",
        target: "enemy",
        damage: { type: "stanceTransitions", baseDamage: 6, damagePerTransition: 3 },
        animation: "heavy",
        delayMs: 0,
      },
    ],
  },
  "finale-thrust": {
    id: "finale-thrust",
    name: "Finale Thrust",
    cost: 2,
    kind: "attack",
    rulesText: "Requires Virtuoso. Deal 14 damage.",
    pool: "fencer",
    target: "enemy",
    playCondition: { type: "stance", stance: "virtuoso" },
    effects: [{ type: "damage", target: "enemy", amount: 14, log: "Finale Thrust lands from perfect form." }],
    presentation: [
      { type: "attack", target: "enemy", damage: { type: "fixed", amount: 14 }, animation: "heavy", delayMs: 0 },
    ],
  },
  "perfect-tempo": {
    id: "perfect-tempo",
    name: "Perfect Tempo",
    cost: 0,
    kind: "skill",
    rulesText: "Requires Virtuoso. Gain 2 Energy.",
    pool: "fencer",
    target: "self",
    playCondition: { type: "stance", stance: "virtuoso" },
    effects: [{ type: "gainEnergy", amount: 2, log: "Perfect Tempo restores 2 Energy." }],
    presentation: [{ type: "status", target: "player", label: "+2 Energy", tone: "good", delayMs: 0 }],
  },
};
