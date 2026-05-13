import { attackPatterns, getNextAttackId } from "./attackPatterns";
import { cardDefinitions, starterDeck } from "./cards";
import { addStatus, clearUntilTurnEndStatuses, hasStatus, removeStatus } from "./statuses";
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
  guardPrevented: 0,
  blockPrevented: 0,
  recoverySaves: 0,
  riposteDamage: 0,
});

const updateSummary = (
  state: CombatState,
  update: (summary: EnemyPhaseSummary) => EnemyPhaseSummary,
): Pick<CombatState, "currentEnemyPhaseSummary"> => ({
  currentEnemyPhaseSummary: update(state.currentEnemyPhaseSummary ?? createEnemyPhaseSummary(state.enemy.intent)),
});

export const createInitialCombatState = (): CombatState => {
  const deck = starterDeck.map(createCard);
  const shuffledDeck = shuffleCards(deck, 17);
  const openingDraw = drawCards(shuffledDeck.cards, [], 5, shuffledDeck.seed);

  return {
    phase: "playerTurn",
    player: {
      hp: 60,
      maxHp: 60,
      block: 0,
      energy: 3,
      maxEnergy: 3,
      handSize: 5,
      perfection: 0,
      maxPerfection: 10,
      statuses: {},
    },
    enemy: {
      hp: 48,
      maxHp: 48,
      attackId: "quick-slash",
      intent: attackPatterns["quick-slash"].name,
      statuses: {},
    },
    hand: openingDraw.hand,
    drawPile: openingDraw.drawPile,
    discard: [],
    nextCardInstanceId: deck.length,
    shuffleSeed: openingDraw.shuffleSeed,
    selectedCardId: null,
    currentEnemyPhaseSummary: null,
    lastEnemyPhaseSummary: null,
    log: ["A duel begins."],
  };
};

const resolveReaction = (state: CombatState, result: ReactionResult, damage = 10, hitLabel?: string): CombatState => {
  const focusBonus = hasStatus(state.player.statuses, "focus") ? 1 : 0;
  const guardMitigation = hasStatus(state.player.statuses, "guard") ? 5 : 0;
  const labelPrefix = hitLabel ? `${hitLabel}: ` : "";
  const isParry = result === "PARRY_PERFECT" || result === "PARRY_NORMAL";

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
    const perfectionGain = result === "PARRY_PERFECT" ? 2 + focusBonus : 1 + focusBonus;
    const parryLog = result === "PARRY_PERFECT" ? "Perfect parry. Perfection rises." : "Parry. The rhythm holds.";
    let nextState: CombatState = {
      ...state,
      ...updateSummary(state, (summary) => ({
        ...summary,
        parries: summary.parries + 1,
        perfectParries: summary.perfectParries + (result === "PARRY_PERFECT" ? 1 : 0),
      })),
      player: {
        ...state.player,
        perfection: clamp(state.player.perfection + perfectionGain, 0, state.player.maxPerfection),
      },
      log: appendLog(state, `${labelPrefix}${parryLog}`),
    };

    if (hasStatus(state.player.statuses, "riposte-prep")) {
      const nextHp = clamp(state.enemy.hp - 5, 0, state.enemy.maxHp);
      const currentSummary = nextState.currentEnemyPhaseSummary ?? createEnemyPhaseSummary(state.enemy.intent);
      const riposteSummary = {
        ...currentSummary,
        riposteDamage: currentSummary.riposteDamage + 5,
      };
      nextState = {
        ...nextState,
        phase: nextHp <= 0 ? "won" : nextState.phase,
        enemy: {
          ...state.enemy,
          hp: nextHp,
        },
        player: {
          ...nextState.player,
          statuses: removeStatus(nextState.player.statuses, "riposte-prep"),
        },
        currentEnemyPhaseSummary: nextHp <= 0 ? null : riposteSummary,
        lastEnemyPhaseSummary: nextHp <= 0 ? riposteSummary : nextState.lastEnemyPhaseSummary,
        log: appendLog(nextState, "Riposte Prep counters for 5 damage."),
      };
    }

    return nextState;
  }

  if (result === "DODGE_SUCCESS") {
    return {
      ...state,
      ...updateSummary(state, (summary) => ({
        ...summary,
        dodges: summary.dodges + 1,
      })),
      player: {
        ...state.player,
        perfection: clamp(state.player.perfection + 1, 0, state.player.maxPerfection),
      },
      log: appendLog(state, `${labelPrefix}Clean dodge. Perfection rises.`),
    };
  }

  const baseDamage = result === "REACTION_FAILED" ? Math.max(1, damage - 2) : damage;
  const guardPrevented = Math.min(baseDamage, guardMitigation);
  const mitigatedDamage = Math.max(0, baseDamage - guardMitigation);
  const blockDamage = Math.min(state.player.block, mitigatedDamage);
  const hpDamage = mitigatedDamage - blockDamage;
  const nextHp = clamp(state.player.hp - hpDamage, 0, state.player.maxHp);
  const currentSummary = state.currentEnemyPhaseSummary ?? createEnemyPhaseSummary(state.enemy.intent);
  const nextSummary = {
    ...currentSummary,
    hitsTaken: currentSummary.hitsTaken + (result === "HIT_TAKEN" ? 1 : 0),
    failedReactions: currentSummary.failedReactions + (result === "REACTION_FAILED" ? 1 : 0),
    damageTaken: currentSummary.damageTaken + hpDamage,
    guardPrevented: currentSummary.guardPrevented + guardPrevented,
    blockPrevented: currentSummary.blockPrevented + blockDamage,
  };

  return {
    ...state,
    phase: nextHp <= 0 ? "lost" : state.phase,
    currentEnemyPhaseSummary: nextHp <= 0 ? null : nextSummary,
    lastEnemyPhaseSummary: nextHp <= 0 ? nextSummary : state.lastEnemyPhaseSummary,
    player: {
      ...state.player,
      hp: nextHp,
      block: state.player.block - blockDamage,
      perfection: clamp(state.player.perfection - 2, 0, state.player.maxPerfection),
    },
    log: appendLog(
      state,
      `${labelPrefix}${result === "REACTION_FAILED" ? "Mistimed reaction" : "Hit taken"} for ${hpDamage} HP.`,
    ),
  };
};

export const combatReducer = (state: CombatState, action: CombatAction): CombatState => {
  if (action.type === "RESET_COMBAT") {
    return createInitialCombatState();
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

      if (definition.id === "strike") {
        const nextHp = clamp(state.enemy.hp - 6, 0, state.enemy.maxHp);
        nextState = {
          ...nextState,
          phase: nextHp <= 0 ? "won" : nextState.phase,
          enemy: {
            ...state.enemy,
            hp: nextHp,
          },
          log: appendLog(nextState, "Strike deals 6 damage."),
        };
      }

      if (definition.id === "guard") {
        nextState = {
          ...nextState,
          player: {
            ...nextState.player,
            block: nextState.player.block + 5,
            statuses: addStatus(nextState.player.statuses, "guard"),
          },
          log: appendLog(nextState, "Guard readies a safer defense."),
        };
      }

      if (definition.id === "focus") {
        nextState = {
          ...nextState,
          player: {
            ...nextState.player,
            statuses: addStatus(nextState.player.statuses, "focus"),
          },
          log: appendLog(nextState, "Focus widens the next parry window."),
        };
      }

      if (definition.id === "riposte-prep") {
        nextState = {
          ...nextState,
          player: {
            ...nextState.player,
            statuses: addStatus(nextState.player.statuses, "riposte-prep"),
          },
          log: appendLog(nextState, "Riposte Prep readies a counter."),
        };
      }

      if (definition.id === "recovery-step") {
        nextState = {
          ...nextState,
          player: {
            ...nextState.player,
            statuses: addStatus(nextState.player.statuses, "recovery-step"),
          },
          log: appendLog(nextState, "Recovery Step can catch one mistake."),
        };
      }

      if (definition.id === "crescendo") {
        const damage = 4 + state.player.perfection * 2;
        const nextHp = clamp(state.enemy.hp - damage, 0, state.enemy.maxHp);
        nextState = {
          ...nextState,
          phase: nextHp <= 0 ? "won" : nextState.phase,
          enemy: {
            ...state.enemy,
            hp: nextHp,
          },
          player: {
            ...nextState.player,
            perfection: 0,
          },
          log: appendLog(nextState, `Crescendo spends Perfection for ${damage} damage.`),
        };
      }

      return nextState;
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
        currentEnemyPhaseSummary: createEnemyPhaseSummary(state.enemy.intent),
        player: {
          ...state.player,
          energy: 0,
        },
        log: appendLog(state, `The enemy commits to ${state.enemy.intent}.`),
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

      const nextAttackId = getNextAttackId(state.enemy.attackId);
      const nextDraw = drawCards(state.drawPile, state.discard, state.player.handSize, state.shuffleSeed);
      const drawLog = nextDraw.reshuffled
        ? `Your turn. Discard reshuffled; drew ${nextDraw.hand.length}.`
        : `Your turn. Drew ${nextDraw.hand.length}.`;

      return {
        ...state,
        phase: "playerTurn",
        enemy: {
          ...state.enemy,
          attackId: nextAttackId,
          intent: attackPatterns[nextAttackId].name,
        },
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
        enemy: {
          ...state.enemy,
          attackId: action.attackId,
          intent: attackPatterns[action.attackId].name,
        },
        log: appendLog(state, `Debug: next attack set to ${attackPatterns[action.attackId].name}.`),
      };

    default:
      return state;
  }
};
