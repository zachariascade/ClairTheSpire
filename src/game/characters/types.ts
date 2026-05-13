export type CharacterId = "perfector" | "fencer";

export type StanceId = "neutral" | "offensive" | "virtuoso" | "defensive";
export type PerfectionRank = "C" | "B" | "A" | "S";

export type PerfectionMechanicState = {
  type: "perfection";
  perfection: number;
  maxPerfection: number;
};

export type StanceMechanicState = {
  type: "stance";
  stance: StanceId;
  transitionsThisTurn: number;
};

export type CharacterMechanicState = PerfectionMechanicState | StanceMechanicState;

export type CharacterMechanicDefinition =
  | {
      type: "perfection";
      maxPerfection: number;
    }
  | {
      type: "stance";
      startingStance: StanceId;
    };

export type CharacterDefinition = {
  id: CharacterId;
  name: string;
  description: string;
  image: string;
  maxHp: number;
  maxEnergy: number;
  handSize: number;
  starterDeck: string[];
  mechanics: CharacterMechanicDefinition;
};
