import type { CharacterDefinition, CharacterId, CharacterMechanicState } from "./types";

export const characterDefinitions: Record<CharacterId, CharacterDefinition> = {
  rev: {
    id: "rev",
    name: "Rev",
    description:
      "Rev came walking out of smoke and sacrament, black coat torn by travel, speaking as if every wound in the world could still be answered by prayer.",
    image: "characters/rev.png",
    maxHp: 58,
    maxEnergy: 3,
    handSize: 5,
    starterDeck: [
      "lunge",
      "lunge",
      "elegant-flourish",
      "brace",
      "brace",
      "measure",
      "riposte-line",
      "flow-state",
      "finale-thrust",
      "perfect-tempo",
      "guard",
      "poise",
    ],
    mechanics: {
      type: "stance",
      startingStance: "neutral",
    },
  },
  eirene: {
    id: "eirene",
    name: "Eirene",
    description:
      "Eirene carried Grace first as a thesis, then as the only name she had for the thing that kept standing up inside her after terror.",
    image: "characters/eirene.png",
    maxHp: 58,
    maxEnergy: 3,
    handSize: 5,
    starterDeck: [
      "lunge",
      "lunge",
      "elegant-flourish",
      "brace",
      "brace",
      "measure",
      "riposte-line",
      "flow-state",
      "finale-thrust",
      "perfect-tempo",
      "guard",
      "poise",
    ],
    mechanics: {
      type: "stance",
      startingStance: "neutral",
    },
  },
  yung: {
    id: "yung",
    name: "Yung",
    description:
      "Yung learned in Xokytos that trust was expensive and survival was cleaner, until Pendulum took him alive and made the old math tremble.",
    image: "characters/yung.png",
    maxHp: 60,
    maxEnergy: 3,
    handSize: 5,
    starterDeck: [
      "strike",
      "strike",
      "flurry",
      "guard",
      "guard",
      "poise",
      "expose",
      "poise",
      "poise",
      "riposte-prep",
      "crescendo",
    ],
    mechanics: {
      type: "perfection",
      maxPerfection: 9,
    },
  },
  sig: {
    id: "sig",
    name: "Sig",
    description:
      "Sig had already buried enough to know time was never free; still he moved toward the breach, because someone had to teach the living how to stand.",
    image: "characters/sig.png",
    maxHp: 60,
    maxEnergy: 3,
    handSize: 5,
    starterDeck: [
      "strike",
      "strike",
      "flurry",
      "guard",
      "guard",
      "poise",
      "expose",
      "poise",
      "poise",
      "riposte-prep",
      "crescendo",
    ],
    mechanics: {
      type: "perfection",
      maxPerfection: 9,
    },
  },
};

export const characterOrder: CharacterId[] = ["rev", "eirene", "yung", "sig"];

export const createInitialMechanicState = (definition: CharacterDefinition): CharacterMechanicState => {
  if (definition.mechanics.type === "perfection") {
    return {
      type: "perfection",
      perfection: 0,
      maxPerfection: definition.mechanics.maxPerfection,
    };
  }

  return {
    type: "stance",
    stance: definition.mechanics.startingStance,
    transitionsThisTurn: 0,
  };
};
