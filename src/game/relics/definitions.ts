import type { RelicDefinition, RelicId } from "./types";

export const relicDefinitions: Record<RelicId, RelicDefinition> = {
  "duelists-tempo": {
    id: "duelists-tempo",
    name: "Duelist's Tempo",
    rarity: "character",
    icon: "II",
    description: "On your first turn each combat, draw 2 additional cards.",
  },
  "mirror-guard": {
    id: "mirror-guard",
    name: "Mirror Guard",
    rarity: "character",
    icon: "<>",
    description: "If you parry every hit in an enemy attack, counterattack for 6 damage.",
  },
  "iron-thread": {
    id: "iron-thread",
    name: "Iron Thread",
    rarity: "uncommon",
    icon: "#",
    description: "Whenever your discard pile reshuffles into your draw pile, gain 3 Block.",
  },
  "steady-pulse": {
    id: "steady-pulse",
    name: "Steady Pulse",
    rarity: "common",
    icon: "3",
    description: "Every third card you play each turn, gain 1 Energy.",
  },
};
