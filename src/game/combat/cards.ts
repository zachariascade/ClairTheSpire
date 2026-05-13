import type { StatusDuration, StatusId } from "./statuses";

export type CardKind = "attack" | "skill" | "power";

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
    };

export type CardDefinition = {
  id: string;
  name: string;
  cost: number;
  kind: CardKind;
  rulesText: string;
  target: "enemy" | "self" | "none";
  effects: CombatEffect[];
};

export const cardDefinitions: Record<string, CardDefinition> = {
  strike: {
    id: "strike",
    name: "Strike",
    cost: 1,
    kind: "attack",
    rulesText: "Deal 6 damage.",
    target: "enemy",
    effects: [{ type: "damage", target: "enemy", amount: 6, log: "Strike deals 6 damage." }],
  },
  guard: {
    id: "guard",
    name: "Guard",
    cost: 1,
    kind: "skill",
    rulesText: "Gain 5 block. Failed reactions hurt less this turn.",
    target: "self",
    effects: [
      { type: "gainBlock", amount: 5 },
      { type: "applyStatus", target: "player", status: "guard", log: "Guard readies a safer defense." },
    ],
  },
  focus: {
    id: "focus",
    name: "Focus",
    cost: 1,
    kind: "skill",
    rulesText: "Widen the next parry window.",
    target: "self",
    effects: [{ type: "applyStatus", target: "player", status: "focus", log: "Focus widens the next parry window." }],
  },
  "riposte-prep": {
    id: "riposte-prep",
    name: "Riposte Prep",
    cost: 1,
    kind: "skill",
    rulesText: "Your next parry counters for 5 damage.",
    target: "self",
    effects: [
      { type: "applyStatus", target: "player", status: "riposte-prep", log: "Riposte Prep readies a counter." },
    ],
  },
  "recovery-step": {
    id: "recovery-step",
    name: "Recovery Step",
    cost: 1,
    kind: "skill",
    rulesText: "Prevent the next failed reaction punishment.",
    target: "self",
    effects: [
      { type: "applyStatus", target: "player", status: "recovery-step", log: "Recovery Step can catch one mistake." },
    ],
  },
  crescendo: {
    id: "crescendo",
    name: "Crescendo",
    cost: 2,
    kind: "attack",
    rulesText: "Deal 4 damage. +2 damage per Perfection. Spend all Perfection.",
    target: "enemy",
    effects: [{ type: "spendPerfectionDamage", target: "enemy", baseDamage: 4, damagePerPerfection: 2 }],
  },
};

export const starterDeck = [
  "strike",
  "strike",
  "strike",
  "guard",
  "guard",
  "focus",
  "focus",
  "riposte-prep",
  "recovery-step",
  "crescendo",
];
