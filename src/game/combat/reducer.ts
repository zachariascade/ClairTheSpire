import { attackPatterns, getNextAttackId } from "./attackPatterns";
import { cardDefinitions } from "./cards";
import { applyCombatEffects } from "./effects";
import { getActiveEnemy, updateActiveEnemy } from "./enemies";
import { clearUntilTurnEndStatuses, hasStatus, removeStatus } from "./statuses";
import { characterDefinitions, createInitialMechanicState } from "../characters/definitions";
import type { CharacterId } from "../characters/types";
import { applyPerfectionDamageDealt } from "../characters/perfection";
import { applyStanceDamageDealt, applyStanceDamageReceived } from "../characters/stances";
import type { CombatAction, CombatCard, CombatState, EnemyPhaseSummary, ReactionResult } from "./types";

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

export const createInitialCombatState = (characterId: CharacterId = "perfector"): CombatState => {
  const character = characterDefinitions[characterId];
  const deck = character.starterDeck.map(createCard);
  const shuffledDeck = shuffleCards(deck, 17);
  const openingDraw = drawCards(shuffledDeck.cards, [], 5, shuffledDeck.seed);

  return {
    phase: "playerTurn",
    player: {
      characterId,
      hp: character.maxHp,
      maxHp: character.maxHp,
      block: 0,
      energy: character.maxEnergy,
      maxEnergy: character.maxEnergy,
      handSize: character.handSize,
      mechanic: createInitialMechanicState(character),
      statuses: {},
    },
    enemies: [
      {
        id: "enemy-1",
        hp: 48,
        maxHp: 48,
        attackId: "quick-slash",
        intent: attackPatterns["quick-slash"].name,
        statuses: {},
      },
    ],
    activeEnemyId: "enemy-1",
    hand: openingDraw.hand,
    drawPile: openingDraw.drawPile,
    discard: [],
    nextCardInstanceId: deck.length,
    shuffleSeed: openingDraw.shuffleSeed,
    selectedCardId: null,
    currentEnemyPhaseSummary: null,
    lastEnemyPhaseSummary: null,
    log: [`${character.name} enters the duel.`],
  };
};

const gainPerfection = (state: CombatState, amount: number): CombatState => {
  if (state.player.mechanic.type !== "perfection") {
    return state;
  }

  return {
    ...state,
    player: {
      ...state.player,
      mechanic: {
        ...state.player.mechanic,
        perfection: clamp(state.player.mechanic.perfection + amount, 0, state.player.mechanic.maxPerfection),
      },
    },
  };
};

const losePerfection = (state: CombatState, amount: number): CombatState => {
  if (state.player.mechanic.type !== "perfection") {
    return state;
  }

  return {
    ...state,
    player: {
      ...state.player,
      mechanic: {
        ...state.player.mechanic,
        perfection: clamp(state.player.mechanic.perfection - amount, 0, state.player.mechanic.maxPerfection),
      },
    },
  };
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
  const baseRiposteDamage = applyPerfectionDamageDealt(state.player.mechanic, applyStanceDamageDealt(state, 3));
  const riposteDamage = hasStatus(activeEnemy.statuses, "vulnerable")
    ? Math.round(baseRiposteDamage * 1.5)
    : baseRiposteDamage;

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
    const perfectionGain = result === "PARRY_PERFECT" ? 10 : 5;
    const parryLog = result === "PARRY_PERFECT" ? "Perfect parry. Perfection rises." : "Parry. The rhythm holds.";
    let nextState: CombatState = {
      ...state,
      ...updateSummary(state, (summary) => ({
        ...summary,
        parries: summary.parries + 1,
        perfectParries: summary.perfectParries + (result === "PARRY_PERFECT" ? 1 : 0),
      })),
      log: appendLog(state, `${labelPrefix}${parryLog}`),
    };
    nextState = gainPerfection(nextState, perfectionGain);

    if (hasStatus(state.player.statuses, "riposte-prep")) {
      const nextHp = clamp(activeEnemy.hp - riposteDamage, 0, activeEnemy.maxHp);
      const currentSummary = nextState.currentEnemyPhaseSummary ?? createEnemyPhaseSummary(activeEnemy.intent);
      const riposteSummary = {
        ...currentSummary,
        riposteDamage: currentSummary.riposteDamage + riposteDamage,
      };
      nextState = updateActiveEnemy(
        {
          ...nextState,
          phase: nextHp <= 0 ? "won" : nextState.phase,
          currentEnemyPhaseSummary: nextHp <= 0 ? null : riposteSummary,
          lastEnemyPhaseSummary: nextHp <= 0 ? riposteSummary : nextState.lastEnemyPhaseSummary,
          log: appendLog(nextState, `Counter Attack deals ${riposteDamage} damage.`),
        },
        (enemy) => ({
          ...enemy,
          hp: nextHp,
        }),
      );
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

  const baseDamage = applyStanceDamageReceived(state, damage);
  const blockDamage = Math.min(state.player.block, baseDamage);
  const hpDamage = baseDamage - blockDamage;
  const nextHp = clamp(state.player.hp - hpDamage, 0, state.player.maxHp);
  const currentSummary = state.currentEnemyPhaseSummary ?? createEnemyPhaseSummary(activeEnemy.intent);
  const nextSummary = {
    ...currentSummary,
    hitsTaken: currentSummary.hitsTaken + (result === "HIT_TAKEN" ? 1 : 0),
    failedReactions: currentSummary.failedReactions + (result === "REACTION_FAILED" ? 1 : 0),
    damageTaken: currentSummary.damageTaken + hpDamage,
    blockPrevented: currentSummary.blockPrevented + blockDamage,
  };

  return losePerfection({
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
  }, 20);
};

export const combatReducer = (state: CombatState, action: CombatAction): CombatState => {
  if (action.type === "RESET_COMBAT") {
    return createInitialCombatState(action.characterId ?? state?.player.characterId ?? "perfector");
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

    case "PLAY_CARD": {
      if (state.phase !== "playerTurn") {
        return state;
      }

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

      let nextState: CombatState = {
        ...state,
        selectedCardId: null,
        hand: state.hand.filter((candidate) => candidate.instanceId !== card.instanceId),
        discard: [card, ...state.discard],
        player: {
          ...state.player,
          energy: state.player.energy - definition.cost,
        },
      };

      return applyCombatEffects(nextState, definition.effects);
    }

    case "END_TURN":
      if (state.phase !== "playerTurn") {
        return state;
      }

      return {
        ...state,
        phase: "enemyTurn",
        hand: [],
        discard: [...state.hand, ...state.discard],
        selectedCardId: null,
        currentEnemyPhaseSummary: createEnemyPhaseSummary(getActiveEnemy(state).intent),
        player: {
          ...state.player,
          energy: 0,
        },
        log: appendLog(state, `The enemy commits to ${getActiveEnemy(state).intent}.`),
      };

    case "BEGIN_ENEMY_ATTACK":
      if (state.phase !== "enemyTurn") {
        return state;
      }

      return {
        ...state,
        phase: "enemyAttack",
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

      const activeEnemy = getActiveEnemy(state);
      const nextAttackId = getNextAttackId(activeEnemy.attackId);
      const nextDraw = drawCards(state.drawPile, state.discard, state.player.handSize, state.shuffleSeed);
      const drawLog = nextDraw.reshuffled
        ? `Your turn. Discard reshuffled; drew ${nextDraw.hand.length}.`
        : `Your turn. Drew ${nextDraw.hand.length}.`;

      return {
        ...state,
        phase: "playerTurn",
        enemies: state.enemies.map((enemy) =>
          enemy.id === state.activeEnemyId
            ? {
                ...enemy,
                attackId: nextAttackId,
                intent: attackPatterns[nextAttackId].name,
                statuses: removeStatus(enemy.statuses, "vulnerable", 1),
              }
            : enemy,
        ),
        hand: nextDraw.hand,
        drawPile: nextDraw.drawPile,
        discard: nextDraw.discard,
        shuffleSeed: nextDraw.shuffleSeed,
        currentEnemyPhaseSummary: null,
        lastEnemyPhaseSummary: state.currentEnemyPhaseSummary,
        player: {
          ...state.player,
          block: 0,
          energy: state.player.maxEnergy,
          mechanic:
            state.player.mechanic.type === "stance"
              ? {
                  ...state.player.mechanic,
                  transitionsThisTurn: 0,
                }
              : state.player.mechanic,
          statuses: clearUntilTurnEndStatuses(state.player.statuses),
        },
        log: appendLog(state, drawLog),
      };
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
