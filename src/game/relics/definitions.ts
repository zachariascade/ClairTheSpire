import type { RelicDefinition, RelicId } from "./types";

export const relicDefinitions: Record<RelicId, RelicDefinition> = {
  "duelists-tempo": {
    id: "duelists-tempo",
    name: "Duelist's Tempo",
    rarity: "character",
    icon: "II",
    description: "On your first turn each combat, draw 2 additional cards.",
  },
  "rising-poise": {
    id: "rising-poise",
    name: "Rising Poise",
    rarity: "character",
    icon: "P",
    description: "Anytime you increase rank, gain 1 Poise.",
  },
  "rank-strength": {
    id: "rank-strength",
    name: "Rank Strength",
    rarity: "character",
    icon: "S",
    description: "Your Perfection rank grants Strength: C 1, B 2, A 3, S 5.",
  },
  "rank-reserve": {
    id: "rank-reserve",
    name: "Rank Reserve",
    rarity: "character",
    icon: "R",
    description: "If Poise is 0, spend 1 rank as Poise.",
  },
  "mirror-guard": {
    id: "mirror-guard",
    name: "Mirror Guard",
    rarity: "character",
    icon: "<>",
    description: "If you parry every hit in an enemy attack, counterattack for 6 damage.",
  },
  "virtuoso-reserve": {
    id: "virtuoso-reserve",
    name: "Virtuoso Reserve",
    rarity: "character",
    icon: "V",
    description: "At end of turn, if you remain in Virtuoso Stance, gain 1 Poise.",
  },
  "defensive-dexterity": {
    id: "defensive-dexterity",
    name: "Defensive Dexterity",
    rarity: "character",
    icon: "D",
    description: "While in Defensive Stance, gain 3 Dexterity.",
  },
  "offensive-riposte": {
    id: "offensive-riposte",
    name: "Offensive Riposte",
    rarity: "character",
    icon: "O",
    description: "While in Offensive Stance, counterattack on parry for 5 damage.",
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
