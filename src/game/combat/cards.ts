import type { StatusDuration, StatusId } from "./statuses";
import type { StanceId } from "../characters/types";

export type CardKind = "attack" | "skill" | "power";
export type CardPool = "neutral" | "perfection" | "stance";

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
    }
  | {
      type: "changeStance";
      stance: StanceId;
      log?: string;
    }
  | {
      type: "damageInStance";
      target: "enemy";
      stance: StanceId;
      amount: number;
      bonusAmount: number;
      log?: string;
    }
  | {
      type: "gainBlockInStance";
      stance: StanceId;
      amount: number;
      bonusAmount: number;
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
  effects: CombatEffect[];
};

export const cardDefinitions: Record<string, CardDefinition> = {
  strike: {
    id: "strike",
    name: "Strike",
    cost: 1,
    kind: "attack",
    rulesText: "Deal 6 damage.",
    pool: "neutral",
    target: "enemy",
    effects: [{ type: "damage", target: "enemy", amount: 6, log: "Strike deals 6 damage." }],
  },
  guard: {
    id: "guard",
    name: "Guard",
    cost: 1,
    kind: "skill",
    rulesText: "Gain 5 block. Failed reactions hurt less this turn.",
    pool: "neutral",
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
    pool: "neutral",
    target: "self",
    effects: [{ type: "applyStatus", target: "player", status: "focus", log: "Focus widens the next parry window." }],
  },
  "riposte-prep": {
    id: "riposte-prep",
    name: "Riposte Prep",
    cost: 1,
    kind: "skill",
    rulesText: "Your next parry counters for 5 damage.",
    pool: "perfection",
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
    pool: "perfection",
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
    pool: "perfection",
    target: "enemy",
    effects: [{ type: "spendPerfectionDamage", target: "enemy", baseDamage: 4, damagePerPerfection: 2 }],
  },
  lunge: {
    id: "lunge",
    name: "Lunge",
    cost: 1,
    kind: "attack",
    rulesText: "Deal 5 damage. Virtuoso adds 3.",
    pool: "stance",
    target: "enemy",
    effects: [
      {
        type: "damageInStance",
        target: "enemy",
        stance: "virtuoso",
        amount: 5,
        bonusAmount: 8,
        log: "Lunge presses the opening.",
      },
    ],
  },
  "elegant-flourish": {
    id: "elegant-flourish",
    name: "Elegant Flourish",
    cost: 1,
    kind: "attack",
    rulesText: "Deal 5 damage. Enter Virtuoso.",
    pool: "stance",
    target: "enemy",
    effects: [
      { type: "damage", target: "enemy", amount: 5, log: "Elegant Flourish deals 5 damage." },
      { type: "changeStance", stance: "virtuoso", log: "You enter Virtuoso Stance." },
    ],
  },
  brace: {
    id: "brace",
    name: "Brace",
    cost: 1,
    kind: "skill",
    rulesText: "Gain 6 block. Enter Defensive.",
    pool: "stance",
    target: "self",
    effects: [
      { type: "gainBlock", amount: 6 },
      { type: "changeStance", stance: "defensive", log: "You enter Defensive Stance." },
    ],
  },
  measure: {
    id: "measure",
    name: "Measure",
    cost: 1,
    kind: "skill",
    rulesText: "Gain 4 block, or 8 in Defensive.",
    pool: "stance",
    target: "self",
    effects: [
      {
        type: "gainBlockInStance",
        stance: "defensive",
        amount: 4,
        bonusAmount: 8,
        log: "Measure steadies your guard.",
      },
    ],
  },
  "riposte-line": {
    id: "riposte-line",
    name: "Riposte Line",
    cost: 1,
    kind: "skill",
    rulesText: "Your next parry counters. Enter Counter.",
    pool: "stance",
    target: "self",
    effects: [
      { type: "applyStatus", target: "player", status: "riposte-prep", log: "Riposte Line readies a counter." },
      { type: "changeStance", stance: "counter", log: "You enter Counter Stance." },
    ],
  },
  "flow-state": {
    id: "flow-state",
    name: "Flow State",
    cost: 2,
    kind: "attack",
    rulesText: "Deal 6 damage. +3 per stance transition this turn.",
    pool: "stance",
    target: "enemy",
    effects: [{ type: "damagePerStanceTransition", target: "enemy", baseDamage: 6, damagePerTransition: 3 }],
  },
};
