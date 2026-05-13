import type { CharacterDefinition, CharacterId, CharacterMechanicState } from "./types";

export const characterDefinitions: Record<CharacterId, CharacterDefinition> = {
  perfector: {
    id: "perfector",
    name: "Gutz",
    description: "Build momentum through clean reactions, then cash it in for a decisive finisher.",
    image: "gutz.png",
    maxHp: 60,
    maxEnergy: 3,
    handSize: 5,
    starterDeck: [
      "strike",
      "strike",
      "flurry",
      "guard",
      "guard",
      "expose",
      "guard",
      "riposte-prep",
      "crescendo",
    ],
    mechanics: {
      type: "perfection",
      maxPerfection: 100,
    },
  },
  fencer: {
    id: "fencer",
    name: "Caska",
    description: "Sequence cards into posture changes, then end the turn in the stance that answers the attack.",
    image: "caska.png",
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
      "guard",
      "measure",
    ],
    mechanics: {
      type: "stance",
      startingStance: "neutral",
    },
  },
};

export const characterOrder: CharacterId[] = ["perfector", "fencer"];

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
