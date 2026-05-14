import { attackPatterns, getNextAttackId } from "./attackPatterns";
import { cardDefinitions, getCardPlayBlockReason } from "./cards";
import { applyCombatEffects, applyPlayerStrengthDamage, MAX_POISE } from "./effects";
import { createEnemyCombatants, getActiveEnemy, getNextLivingEnemyId, updateEnemy } from "./enemies";
import {
  applyStrengthToDamage,
  clearUntilTurnEndStatuses,
  getStatusStacks,
  hasStatus,
  removeStatus,
  setStatusStacks,
} from "./statuses";
import { characterDefinitions, createInitialMechanicState } from "../characters/definitions";
import type { CharacterId, CharacterMechanicState } from "../characters/types";
import { getPerfectionRank, getPerfectionStrength, losePerfectionRank } from "../characters/perfection";
import {
  applyCardPlayedRelics,
  applyEndTurnRelics,
  applyEnemyAttackCompleteRelics,
  applyReshuffleRelics,
  createStartingRelics,
  setRelicProgress,
  triggerOpeningTempo,
} from "../relics/engine";
import type { RelicId } from "../relics/types";
import type { CombatAction, CombatCard, CombatState, EnemyPhaseSummary, ReactionResult } from "./types";
import type { EnemyDefinitionId } from "./enemies";

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const createCard = (definitionId: string, index: number): CombatCard => ({
  definitionId,
  instanceId: `${definitionId}-${index}`,
});

const nextSeed = (seed: number) => (seed * 1664525 + 1013904223) >>> 0;

const shuffleCards = (cards: CombatCard[], seed: number): { cards: CombatCard[]; seed: number } => {
  const shuffled = [...cards];
  let currentSeed = seed;

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    currentSeed = nextSeed(currentSeed);
    const swapIndex = currentSeed % (index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return { cards: shuffled, seed: currentSeed };
};

const drawCards = (
  drawPile: CombatCard[],
  discard: CombatCard[],
  handSize: number,
  shuffleSeed: number,
): { hand: CombatCard[]; drawPile: CombatCard[]; discard: CombatCard[]; shuffleSeed: number; reshuffled: boolean } => {
  let availableDraw = [...drawPile];
  let availableDiscard = [...discard];
  let currentSeed = shuffleSeed;
  const hand: CombatCard[] = [];
  let reshuffled = false;

  while (hand.length < handSize && (availableDraw.length > 0 || availableDiscard.length > 0)) {
    if (availableDraw.length === 0) {
      const shuffled = shuffleCards(availableDiscard, currentSeed);
      availableDraw = shuffled.cards;
      availableDiscard = [];
      currentSeed = shuffled.seed;
      reshuffled = true;
    }

    const nextCard = availableDraw[0];
    availableDraw = availableDraw.slice(1);
    hand.push(nextCard);
  }

  return {
    hand,
    drawPile: availableDraw,
    discard: availableDiscard,
    shuffleSeed: currentSeed,
    reshuffled,
  };
};

const appendLog = (state: CombatState, entry: string): string[] => [entry, ...state.log].slice(0, 6);

const getLivingEnemyIds = (state: CombatState): string[] =>
  state.enemies.filter((enemy) => enemy.hp > 0).map((enemy) => enemy.id);

const hasRelic = (state: CombatState, relicId: string) => state.player.relics.some((relic) => relic.id === relicId);

const createEnemyPhaseSummary = (attackName: string): EnemyPhaseSummary => ({
  attackName,
  parries: 0,
  perfectParries: 0,
  dodges: 0,
  hitsTaken: 0,
  failedReactions: 0,
  damageTaken: 0,
  blockPrevented: 0,
  recoverySaves: 0,
  riposteDamage: 0,
});

const updateSummary = (
  state: CombatState,
  update: (summary: EnemyPhaseSummary) => EnemyPhaseSummary,
): Pick<CombatState, "currentEnemyPhaseSummary"> => ({
  currentEnemyPhaseSummary: update(state.currentEnemyPhaseSummary ?? createEnemyPhaseSummary(getActiveEnemy(state).intent)),
});

const syncPerfectionStrengthStatus = (state: CombatState, previousMechanic?: CharacterMechanicState): CombatState => {
  if (!hasRelic(state, "rank-strength")) {
    return state;
  }

  const previousStrength = previousMechanic ? getPerfectionStrength(previousMechanic) : 0;
  const nextStrength = getPerfectionStrength(state.player.mechanic);
  const strengthDelta = nextStrength - previousStrength;

  if (strengthDelta === 0) {
    return state;
  }

  return {
    ...state,
    player: {
      ...state.player,
      statuses: setStatusStacks(
        state.player.statuses,
        "strength",
        getStatusStacks(state.player.statuses, "strength") + strengthDelta,
        "combat",
      ),
    },
  };
};

export type CombatSetup = {
  characterId?: CharacterId;
  enemyIds?: EnemyDefinitionId[];
};

type NormalizedCombatSetup = {
  characterId: CharacterId;
  enemyIds?: EnemyDefinitionId[];
};

const normalizeCombatSetup = (setup: CharacterId | CombatSetup = "perfector"): NormalizedCombatSetup => {
  if (typeof setup === "string") {
    return {
      characterId: setup,
      enemyIds: undefined,
    };
  }

  return {
    characterId: setup.characterId ?? "perfector",
    enemyIds: setup.enemyIds,
  };
};

export const createInitialCombatState = (setup: CharacterId | CombatSetup = "perfector"): CombatState => {
  const { characterId, enemyIds } = normalizeCombatSetup(setup);
  const character = characterDefinitions[characterId];
  const deck = character.starterDeck.map(createCard);
  const relics = createStartingRelics(characterId);
  const openingHandSize = relics.some((relic) => relic.id === "duelists-tempo") ? character.handSize + 2 : character.handSize;
  const shuffledDeck = shuffleCards(deck, 17);
  const openingDraw = drawCards(shuffledDeck.cards, [], openingHandSize, shuffledDeck.seed);
  const enemies = createEnemyCombatants(enemyIds);

  const initialState: CombatState = {
    phase: "playerTurn",
    player: {
      characterId,
      hp: character.maxHp,
      maxHp: character.maxHp,
      block: 0,
      energy: character.maxEnergy,
      maxEnergy: character.maxEnergy,
      poise: 0,
      maxPoise: MAX_POISE,
      handSize: character.handSize,
      turnCardsPlayed: 0,
      combatTurnNumber: 1,
      mechanic: createInitialMechanicState(character),
      statuses: {},
      relics,
    },
    enemies,
    activeEnemyId: enemies[0].id,
    hand: openingDraw.hand,
    drawPile: openingDraw.drawPile,
    discard: [],
    nextCardInstanceId: deck.length,
    shuffleSeed: openingDraw.shuffleSeed,
    selectedCardId: null,
    enemyTurnQueue: [],
    currentEnemyPhaseSummary: null,
    lastEnemyPhaseSummary: null,
    lastTriggeredRelic: null,
    log: [`${character.name} enters the duel.`],
  };

  return triggerOpeningTempo(initialState);
};

const loseOnePerfectionRank = (state: CombatState): CombatState => {
  if (state.player.mechanic.type !== "perfection") {
    return state;
  }

  return syncPerfectionStrengthStatus({
    ...state,
    player: {
      ...state.player,
      mechanic: losePerfectionRank(state.player.mechanic),
    },
  }, state.player.mechanic);
};

const spendRankAsPoise = (state: CombatState): CombatState | null => {
  if (!hasRelic(state, "rank-reserve") || state.player.mechanic.type !== "perfection") {
    return null;
  }

  if (getPerfectionRank(state.player.mechanic) === "D") {
    return null;
  }

  const previousMechanic = state.player.mechanic;

  return syncPerfectionStrengthStatus({
    ...state,
    player: {
      ...state.player,
      mechanic: losePerfectionRank(state.player.mechanic),
      relics: state.player.relics.map((relic) =>
        relic.id === "rank-reserve"
          ? {
              ...relic,
              pulse: relic.pulse + 1,
            }
          : relic,
      ),
    },
    lastTriggeredRelic: {
      relicId: "rank-reserve",
      message: "Rank Reserve spends 1 rank as Poise.",
    },
    log: appendLog(state, "Rank Reserve spends 1 rank as Poise."),
  }, previousMechanic);
};

const triggerRelicPulse = (state: CombatState, relicId: RelicId, message: string): CombatState => ({
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

const applyParryCounterDamage = (
  state: CombatState,
  enemyId: string,
  baseDamage: number,
  message: string,
  relicId?: RelicId,
): CombatState => {
  const enemy = state.enemies.find((candidate) => candidate.id === enemyId);
  if (!enemy || enemy.hp <= 0) {
    return state;
  }

  const baseCounterDamage = applyPlayerStrengthDamage(state, baseDamage);
  const counterDamage = hasStatus(enemy.statuses, "vulnerable")
    ? Math.round(baseCounterDamage * 1.5)
    : baseCounterDamage;
  const nextHp = clamp(enemy.hp - counterDamage, 0, enemy.maxHp);
  const nextActiveEnemyId = nextHp <= 0 ? getNextLivingEnemyId(state, enemy.id) : state.activeEnemyId;
  const currentSummary = state.currentEnemyPhaseSummary ?? createEnemyPhaseSummary(enemy.intent);
  const counterSummary = {
    ...currentSummary,
    riposteDamage: currentSummary.riposteDamage + counterDamage,
  };
  let nextState = updateEnemy(
    {
      ...state,
      phase: nextHp <= 0 && !nextActiveEnemyId ? "won" : state.phase,
      activeEnemyId: nextActiveEnemyId ?? state.activeEnemyId,
      currentEnemyPhaseSummary: nextHp <= 0 ? null : counterSummary,
      lastEnemyPhaseSummary: nextHp <= 0 ? counterSummary : state.lastEnemyPhaseSummary,
      log: appendLog(state, `${message} deals ${counterDamage} damage.`),
    },
    enemy.id,
    (candidate) => ({
      ...candidate,
      hp: nextHp,
    }),
  );

  if (relicId) {
    nextState = triggerRelicPulse(nextState, relicId, `${message} triggers.`);
  }

  return nextState;
};

export const getReactionTimingModifiers = (state: CombatState): { parryWindowBonusMs: number; dodgeWindowBonusMs: number } => {
  const focusBonus = hasStatus(state.player.statuses, "focus") ? 140 : 0;

  return {
    parryWindowBonusMs: focusBonus,
    dodgeWindowBonusMs: focusBonus,
  };
};

const resolveReaction = (state: CombatState, result: ReactionResult, damage = 10, hitLabel?: string): CombatState => {
  const labelPrefix = hitLabel ? `${hitLabel}: ` : "";
  const isParry = result === "PARRY_PERFECT" || result === "PARRY_NORMAL";
  const activeEnemy = getActiveEnemy(state);
  const incomingDamage = applyStrengthToDamage(activeEnemy.statuses, damage);

  if (result === "REACTION_FAILED" && hasStatus(state.player.statuses, "recovery-step")) {
    return {
      ...state,
      ...updateSummary(state, (summary) => ({
        ...summary,
        failedReactions: summary.failedReactions + 1,
        recoverySaves: summary.recoverySaves + 1,
      })),
      player: {
        ...state.player,
        statuses: removeStatus(state.player.statuses, "recovery-step"),
      },
      log: appendLog(state, `${labelPrefix}Recovery Step catches the mistake.`),
    };
  }

  if (isParry) {
    const parryLog = result === "PARRY_PERFECT" ? "Perfect parry." : "Parry. The rhythm holds.";
    let nextState: CombatState = {
      ...state,
      ...updateSummary(state, (summary) => ({
        ...summary,
        parries: summary.parries + 1,
        perfectParries: summary.perfectParries + (result === "PARRY_PERFECT" ? 1 : 0),
      })),
      log: appendLog(state, `${labelPrefix}${parryLog}`),
    };

    if (hasStatus(state.player.statuses, "riposte-prep")) {
      nextState = applyParryCounterDamage(nextState, activeEnemy.id, 3, "Counter Attack");
    }

    if (
      hasRelic(nextState, "offensive-riposte") &&
      nextState.player.mechanic.type === "stance" &&
      nextState.player.mechanic.stance === "offensive"
    ) {
      nextState = applyParryCounterDamage(nextState, activeEnemy.id, 5, "Offensive Riposte", "offensive-riposte");
    }

    return nextState;
  }

  if (result === "DODGE_SUCCESS") {
    const nextState: CombatState = {
      ...state,
      ...updateSummary(state, (summary) => ({
        ...summary,
        dodges: summary.dodges + 1,
      })),
      log: appendLog(state, `${labelPrefix}Clean dodge.`),
    };

    return nextState;
  }

  const blockDamage = Math.min(state.player.block, incomingDamage);
  const hpDamage = incomingDamage - blockDamage;
  const nextHp = clamp(state.player.hp - hpDamage, 0, state.player.maxHp);
  const currentSummary = state.currentEnemyPhaseSummary ?? createEnemyPhaseSummary(activeEnemy.intent);
  const nextSummary = {
    ...currentSummary,
    hitsTaken: currentSummary.hitsTaken + (result === "HIT_TAKEN" ? 1 : 0),
    failedReactions: currentSummary.failedReactions + (result === "REACTION_FAILED" ? 1 : 0),
    damageTaken: currentSummary.damageTaken + hpDamage,
    blockPrevented: currentSummary.blockPrevented + blockDamage,
  };

  return loseOnePerfectionRank({
    ...state,
    phase: nextHp <= 0 ? "lost" : state.phase,
    currentEnemyPhaseSummary: nextHp <= 0 ? null : nextSummary,
    lastEnemyPhaseSummary: nextHp <= 0 ? nextSummary : state.lastEnemyPhaseSummary,
    player: {
      ...state.player,
      hp: nextHp,
      block: state.player.block - blockDamage,
    },
    log: appendLog(
      state,
      `${labelPrefix}${result === "REACTION_FAILED" ? "Mistimed reaction" : "Hit taken"} for ${hpDamage} HP.`,
    ),
  });
};

export const combatReducer = (state: CombatState, action: CombatAction): CombatState => {
  if (action.type === "RESET_COMBAT") {
    return createInitialCombatState({
      characterId: action.characterId ?? state?.player.characterId ?? "perfector",
      enemyIds: action.enemyIds,
    });
  }

  if (state.phase === "won" || state.phase === "lost") {
    return state;
  }

  switch (action.type) {
    case "SELECT_CARD":
      return {
        ...state,
        selectedCardId: action.cardId,
      };

    case "SELECT_ENEMY":
      if (state.phase !== "playerTurn") {
        return state;
      }

      if (!state.enemies.some((enemy) => enemy.id === action.enemyId && enemy.hp > 0)) {
        return state;
      }

      return {
        ...state,
        activeEnemyId: action.enemyId,
      };

    case "PLAY_CARD": {
      if (state.phase !== "playerTurn") {
        return state;
      }

      const targetEnemyId =
        action.targetEnemyId && state.enemies.some((enemy) => enemy.id === action.targetEnemyId && enemy.hp > 0)
          ? action.targetEnemyId
          : state.activeEnemyId;
      const card = state.hand.find((candidate) => candidate.instanceId === action.cardId);
      if (!card) {
        return state;
      }

      const definition = cardDefinitions[card.definitionId];
      if (state.player.energy < definition.cost) {
        return {
          ...state,
          log: appendLog(state, "Not enough energy."),
        };
      }

      const playBlockReason = getCardPlayBlockReason(definition, state.player.mechanic);
      if (playBlockReason) {
        return {
          ...state,
          log: appendLog(state, playBlockReason),
        };
      }

      let nextState: CombatState = {
        ...state,
        activeEnemyId: targetEnemyId,
        selectedCardId: null,
        hand: state.hand.filter((candidate) => candidate.instanceId !== card.instanceId),
        discard: [card, ...state.discard],
        player: {
          ...state.player,
          energy: state.player.energy - definition.cost,
          turnCardsPlayed: state.player.turnCardsPlayed + 1,
        },
      };

      nextState = applyCardPlayedRelics(nextState);
      return applyCombatEffects(nextState, definition.effects);
    }

    case "END_TURN":
      if (state.phase !== "playerTurn") {
        return state;
      }

      const enemyTurnQueue = getLivingEnemyIds(state);
      const firstEnemyId = enemyTurnQueue[0] ?? state.activeEnemyId;
      const firstEnemy = state.enemies.find((enemy) => enemy.id === firstEnemyId) ?? getActiveEnemy(state);

      return applyEndTurnRelics({
        ...state,
        phase: "enemyTurn",
        activeEnemyId: firstEnemy.id,
        enemyTurnQueue,
        hand: [],
        discard: [...state.hand, ...state.discard],
        selectedCardId: null,
        currentEnemyPhaseSummary: createEnemyPhaseSummary(firstEnemy.intent),
        player: {
          ...state.player,
          energy: 0,
        },
        log: appendLog(state, `${firstEnemy.name} commits to ${firstEnemy.intent}.`),
      });

    case "BEGIN_ENEMY_ATTACK":
      if (state.phase !== "enemyTurn") {
        return state;
      }

      const attackingEnemyId = state.enemyTurnQueue[0] ?? state.activeEnemyId;
      const attackingEnemy = state.enemies.find((enemy) => enemy.id === attackingEnemyId && enemy.hp > 0);
      if (!attackingEnemy) {
        return state;
      }

      return {
        ...state,
        phase: "enemyAttack",
        activeEnemyId: attackingEnemy.id,
        currentEnemyPhaseSummary: state.currentEnemyPhaseSummary ?? createEnemyPhaseSummary(attackingEnemy.intent),
      };

    case "SPEND_POISE":
      if (state.phase !== "enemyAttack") {
        return state;
      }

      if (state.player.poise <= 0) {
        return spendRankAsPoise(state) ?? {
          ...state,
          log: appendLog(state, "Not enough Poise."),
        };
      }

      return {
        ...state,
        player: {
          ...state.player,
          poise: state.player.poise - 1,
        },
      };

    case "REACTION_RESULT":
      if (state.phase !== "enemyAttack") {
        return state;
      }

      return resolveReaction(state, action.result, action.damage, action.hitLabel);

    case "ENEMY_ATTACK_COMPLETE": {
      if (state.phase !== "enemyAttack") {
        return state;
      }

      const attackSummary = state.currentEnemyPhaseSummary;
      const completedEnemyId = state.enemyTurnQueue[0] ?? state.activeEnemyId;
      const completedEnemy = state.enemies.find((enemy) => enemy.id === completedEnemyId) ?? getActiveEnemy(state);
      const attackHitCount = attackPatterns[completedEnemy.attackId].hits.length;
      let postAttackState = applyEnemyAttackCompleteRelics(state, attackSummary, attackHitCount);

      if (postAttackState.phase === "won" || postAttackState.phase === "lost") {
        return {
          ...postAttackState,
          currentEnemyPhaseSummary: null,
          lastEnemyPhaseSummary: attackSummary,
        };
      }

      const nextAttackId = getNextAttackId(completedEnemy.attackId);
      const enemiesAfterCompletedAttack = postAttackState.enemies.map((enemy) =>
        enemy.id === completedEnemyId
          ? {
              ...enemy,
              attackId: nextAttackId,
              intent: attackPatterns[nextAttackId].name,
              statuses: removeStatus(enemy.statuses, "vulnerable", 1),
            }
          : enemy,
      );
      const remainingEnemyTurnQueue = state.enemyTurnQueue
        .slice(1)
        .filter((enemyId) => enemiesAfterCompletedAttack.some((enemy) => enemy.id === enemyId && enemy.hp > 0));
      const nextActingEnemyId = remainingEnemyTurnQueue[0];

      if (nextActingEnemyId) {
        const nextActingEnemy =
          enemiesAfterCompletedAttack.find((enemy) => enemy.id === nextActingEnemyId) ?? completedEnemy;

        return {
          ...postAttackState,
          phase: "enemyTurn",
          activeEnemyId: nextActingEnemy.id,
          enemies: enemiesAfterCompletedAttack,
          enemyTurnQueue: remainingEnemyTurnQueue,
          currentEnemyPhaseSummary: createEnemyPhaseSummary(nextActingEnemy.intent),
          lastEnemyPhaseSummary: attackSummary,
          log: appendLog(postAttackState, `${nextActingEnemy.name} commits to ${nextActingEnemy.intent}.`),
        };
      }

      const nextDraw = drawCards(
        postAttackState.drawPile,
        postAttackState.discard,
        postAttackState.player.handSize,
        postAttackState.shuffleSeed,
      );
      const drawLog = nextDraw.reshuffled
        ? `Your turn. Discard reshuffled; drew ${nextDraw.hand.length}.`
        : `Your turn. Drew ${nextDraw.hand.length}.`;

      let nextState: CombatState = {
        ...postAttackState,
        phase: "playerTurn",
        enemies: enemiesAfterCompletedAttack,
        hand: nextDraw.hand,
        drawPile: nextDraw.drawPile,
        discard: nextDraw.discard,
        shuffleSeed: nextDraw.shuffleSeed,
        enemyTurnQueue: [],
        currentEnemyPhaseSummary: null,
        lastEnemyPhaseSummary: attackSummary,
        player: {
          ...postAttackState.player,
          block: 0,
          energy: postAttackState.player.maxEnergy,
          turnCardsPlayed: 0,
          combatTurnNumber: postAttackState.player.combatTurnNumber + 1,
          mechanic:
            postAttackState.player.mechanic.type === "stance"
              ? {
                  ...postAttackState.player.mechanic,
                  transitionsThisTurn: 0,
                }
              : postAttackState.player.mechanic,
          statuses: clearUntilTurnEndStatuses(postAttackState.player.statuses),
        },
        log: appendLog(postAttackState, drawLog),
      };

      nextState = setRelicProgress(nextState, "steady-pulse", 0);
      return nextDraw.reshuffled ? applyReshuffleRelics(nextState) : nextState;
    }

    case "SET_NEXT_ATTACK":
      if (state.phase !== "playerTurn") {
        return state;
      }

      return {
        ...state,
        enemies: state.enemies.map((enemy) =>
          enemy.id === state.activeEnemyId
            ? {
                ...enemy,
                attackId: action.attackId,
                intent: attackPatterns[action.attackId].name,
              }
            : enemy,
        ),
        log: appendLog(state, `Debug: next attack set to ${attackPatterns[action.attackId].name}.`),
      };

    default:
      return state;
  }
};
