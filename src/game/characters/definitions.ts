import type { CharacterDefinition, CharacterId, CharacterMechanicState } from "./types";

export const characterDefinitions: Record<CharacterId, CharacterDefinition> = {
  perfection: {
    id: "perfection",
    name: "Perfection",
    description: "Build momentum through clean reactions, then cash it in for a decisive finisher.",
    image: "gutz.png",
    maxHp: 60,
    maxEnergy: 3,
    handSize: 5,
    starterDeck: [
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
    ],
    mechanics: {
      type: "perfection",
      maxPerfection: 10,
    },
  },
  stance: {
    id: "stance",
    name: "Stance Fencer",
    description: "Sequence cards into posture changes, then end the turn in the stance that answers the attack.",
    image: "gutz.png",
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
      "focus",
    ],
    mechanics: {
      type: "stance",
      startingStance: "neutral",
    },
  },
};

export const characterOrder: CharacterId[] = ["perfection", "stance"];

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
