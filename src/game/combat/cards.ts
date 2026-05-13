export type CardKind = "attack" | "skill" | "power";

export type CardDefinition = {
  id: string;
  name: string;
  cost: number;
  kind: CardKind;
  rulesText: string;
  target: "enemy" | "self" | "none";
};

export const cardDefinitions: Record<string, CardDefinition> = {
  strike: {
    id: "strike",
    name: "Strike",
    cost: 1,
    kind: "attack",
    rulesText: "Deal 6 damage.",
    target: "enemy",
  },
  guard: {
    id: "guard",
    name: "Guard",
    cost: 1,
    kind: "skill",
    rulesText: "Gain 5 block. Failed reactions hurt less this turn.",
    target: "self",
  },
  focus: {
    id: "focus",
    name: "Focus",
    cost: 1,
    kind: "skill",
    rulesText: "Widen the next parry window.",
    target: "self",
  },
  "riposte-prep": {
    id: "riposte-prep",
    name: "Riposte Prep",
    cost: 1,
    kind: "skill",
    rulesText: "Your next parry counters for 5 damage.",
    target: "self",
  },
  "recovery-step": {
    id: "recovery-step",
    name: "Recovery Step",
    cost: 1,
    kind: "skill",
    rulesText: "Prevent the next failed reaction punishment.",
    target: "self",
  },
  crescendo: {
    id: "crescendo",
    name: "Crescendo",
    cost: 2,
    kind: "attack",
    rulesText: "Spend Perfection to deal scaling damage.",
    target: "enemy",
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
