import type { AttackId } from "./attackPatterns";
import type { EnemyDefinitionId } from "./enemies";
import type { StatusCollection } from "./statuses";
import type { CharacterId, CharacterMechanicState } from "../characters/types";
import type { PlayerRelic, RelicTrigger } from "../relics/types";

export type CombatPhase = "playerTurn" | "enemyTurn" | "enemyAttack" | "won" | "lost";

export type CombatCard = {
  instanceId: string;
  definitionId: string;
};

export type EnemyPhaseSummary = {
  attackName: string;
  parries: number;
  perfectParries: number;
  dodges: number;
  hitsTaken: number;
  failedReactions: number;
  damageTaken: number;
  blockPrevented: number;
  recoverySaves: number;
  riposteDamage: number;
};

export type EnemyCombatant = {
  id: string;
  definitionId: EnemyDefinitionId;
  name: string;
  image: string;
  hp: number;
  maxHp: number;
  attackId: AttackId;
  intent: string;
  statuses: StatusCollection;
};

export type CombatState = {
  phase: CombatPhase;
  player: {
    characterId: CharacterId;
    hp: number;
    maxHp: number;
    block: number;
    energy: number;
    maxEnergy: number;
    poise: number;
    maxPoise: number;
    handSize: number;
    turnCardsPlayed: number;
    combatTurnNumber: number;
    mechanic: CharacterMechanicState;
    statuses: StatusCollection;
    relics: PlayerRelic[];
  };
  enemies: EnemyCombatant[];
  activeEnemyId: string;
  hand: CombatCard[];
  drawPile: CombatCard[];
  discard: CombatCard[];
  nextCardInstanceId: number;
  shuffleSeed: number;
  selectedCardId: string | null;
  enemyTurnQueue: string[];
  currentEnemyPhaseSummary: EnemyPhaseSummary | null;
  lastEnemyPhaseSummary: EnemyPhaseSummary | null;
  lastTriggeredRelic: RelicTrigger | null;
  log: string[];
};

export type ReactionResult =
  | "PARRY_PERFECT"
  | "PARRY_NORMAL"
  | "DODGE_SUCCESS"
  | "REACTION_FAILED"
  | "HIT_TAKEN";

export type CombatAction =
  | { type: "SELECT_CARD"; cardId: string | null }
  | { type: "SELECT_ENEMY"; enemyId: string }
  | { type: "PLAY_CARD"; cardId: string; targetEnemyId?: string }
  | { type: "END_TURN" }
  | { type: "BEGIN_ENEMY_ATTACK" }
  | { type: "SPEND_POISE"; reaction: "parry" | "dodge" }
  | { type: "REACTION_RESULT"; result: ReactionResult; damage?: number; hitLabel?: string }
  | { type: "ENEMY_ATTACK_COMPLETE" }
  | { type: "SET_NEXT_ATTACK"; attackId: AttackId }
  | { type: "RESET_COMBAT"; characterId?: CharacterId; enemyIds?: EnemyDefinitionId[] };
