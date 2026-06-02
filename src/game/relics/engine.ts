import { dealDamage, gainBlock, gainPoise } from "../combat/effects";
import type { CombatState, EnemyPhaseSummary } from "../combat/types";
import type { CharacterId } from "../characters/types";
import type { PlayerRelic, RelicId, RelicTrigger } from "./types";

const appendLog = (state: CombatState, entry: string): string[] => [entry, ...state.log].slice(0, 6);

const hasRelic = (state: CombatState, relicId: RelicId) => state.player.relics.some((relic) => relic.id === relicId);

const createRelic = (id: RelicId): PlayerRelic => ({
  id,
  progress: 0,
  pulse: 0,
});

export const createStartingRelics = (characterId: CharacterId): PlayerRelic[] => {
  const isStanceCharacter = characterId === "rev" || characterId === "eirene";
  const characterRelic: RelicId = isStanceCharacter ? "mirror-guard" : "duelists-tempo";
  const relicIds: RelicId[] =
    !isStanceCharacter
      ? [characterRelic, "rising-poise", "rank-strength", "rank-reserve", "iron-thread", "steady-pulse"]
      : [characterRelic, "virtuoso-reserve", "defensive-dexterity", "offensive-riposte", "iron-thread", "steady-pulse"];

  return relicIds.map(createRelic);
};

const triggerRelic = (state: CombatState, relicId: RelicId, message: string): CombatState => ({
  ...state,
  player: {
    ...state.player,
    relics: state.player.relics.map((relic) =>
      relic.id === relicId
        ? {
            ...relic,
            pulse: relic.pulse + 1,
          }
        : relic,
    ),
  },
  lastTriggeredRelic: {
    relicId,
    message,
  },
  log: appendLog(state, message),
});

export const setRelicProgress = (state: CombatState, relicId: RelicId, progress: number): CombatState => ({
  ...state,
  player: {
    ...state.player,
    relics: state.player.relics.map((relic) => (relic.id === relicId ? { ...relic, progress } : relic)),
  },
});

export const triggerOpeningTempo = (state: CombatState): CombatState => {
  if (!hasRelic(state, "duelists-tempo")) {
    return state;
  }

  return triggerRelic(state, "duelists-tempo", "Duelist's Tempo draws 2 additional cards.");
};

export const applyCardPlayedRelics = (state: CombatState): CombatState => {
  if (!hasRelic(state, "steady-pulse")) {
    return state;
  }

  const progress = state.player.turnCardsPlayed % 3;
  let nextState = setRelicProgress(state, "steady-pulse", progress);

  if (progress === 0) {
    nextState = {
      ...nextState,
      player: {
        ...nextState.player,
        energy: nextState.player.energy + 1,
      },
    };
    nextState = triggerRelic(nextState, "steady-pulse", "Steady Pulse restores 1 Energy.");
  }

  return nextState;
};

export const applyReshuffleRelics = (state: CombatState): CombatState => {
  if (!hasRelic(state, "iron-thread")) {
    return state;
  }

  return triggerRelic(gainBlock(state, 3), "iron-thread", "Iron Thread grants 3 Block.");
};

export const applyEndTurnRelics = (state: CombatState): CombatState => {
  if (
    !hasRelic(state, "virtuoso-reserve") ||
    state.player.mechanic.type !== "stance" ||
    state.player.mechanic.stance !== "virtuoso"
  ) {
    return state;
  }

  return triggerRelic(gainPoise(state, 1), "virtuoso-reserve", "Virtuoso Reserve grants 1 Poise.");
};

export const applyEnemyAttackCompleteRelics = (
  state: CombatState,
  summary: EnemyPhaseSummary | null,
  attackHitCount: number,
): CombatState => {
  if (!summary || !hasRelic(state, "mirror-guard")) {
    return state;
  }

  const parriedEveryHit =
    attackHitCount > 0 &&
    summary.parries === attackHitCount &&
    summary.dodges === 0 &&
    summary.hitsTaken === 0 &&
    summary.failedReactions === 0;

  if (!parriedEveryHit) {
    return state;
  }

  const nextState = dealDamage(state, "enemy", 6);
  return triggerRelic(nextState, "mirror-guard", "Mirror Guard counterattacks for 6 damage.");
};

export const clearRelicTrigger = (state: CombatState): CombatState => ({
  ...state,
  lastTriggeredRelic: null,
});

export const getRelicTrigger = (state: CombatState): RelicTrigger | null => state.lastTriggeredRelic;
