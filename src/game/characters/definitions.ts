import type { CharacterDefinition, CharacterId, CharacterMechanicState } from "./types";

export const characterDefinitions: Record<CharacterId, CharacterDefinition> = {
  rev: {
    id: "rev",
    name: "Rev",
    description: "Changes stance fluidly to answer pressure, then turns the tempo back on the enemy.",
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
    description: "A stance specialist who sharpens each transition into poised counterplay.",
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
    description: "Builds clean reaction chains toward a decisive perfection finisher.",
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
    description: "Turns precision defense into rising perfection and heavy finishers.",
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
