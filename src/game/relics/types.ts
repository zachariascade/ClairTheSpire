export type RelicId =
  | "duelists-tempo"
  | "mirror-guard"
  | "iron-thread"
  | "steady-pulse"
  | "rising-poise"
  | "rank-strength"
  | "rank-reserve"
  | "virtuoso-reserve"
  | "defensive-dexterity"
  | "offensive-riposte";

export type RelicRarity = "common" | "uncommon" | "rare" | "character";

export type RelicDefinition = {
  id: RelicId;
  name: string;
  rarity: RelicRarity;
  icon: string;
  description: string;
};

export type PlayerRelic = {
  id: RelicId;
  progress: number;
  pulse: number;
};

export type RelicTrigger = {
  relicId: RelicId;
  message: string;
};
