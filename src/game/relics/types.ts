export type RelicId = "duelists-tempo" | "mirror-guard" | "iron-thread" | "steady-pulse";

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
