import type { CombatEffect } from "./cards";
import { getActiveEnemy, updateActiveEnemy } from "./enemies";
import { addStatus } from "./statuses";
import type { CombatState } from "./types";
import type { StanceId } from "../characters/types";

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const appendLog = (state: CombatState, entry: string): string[] => [entry, ...state.log].slice(0, 6);

export const dealDamage = (state: CombatState, target: "enemy" | "player", amount: number): CombatState => {
  if (target === "enemy") {
    const activeEnemy = getActiveEnemy(state);
    const nextHp = clamp(activeEnemy.hp - amount, 0, activeEnemy.maxHp);

    return updateActiveEnemy(
      {
        ...state,
        phase: nextHp <= 0 ? "won" : state.phase,
      },
      (enemy) => ({
        ...enemy,
        hp: nextHp,
      }),
    );
  }

  const nextHp = clamp(state.player.hp - amount, 0, state.player.maxHp);

  return {
    ...state,
    phase: nextHp <= 0 ? "lost" : state.phase,
    player: {
      ...state.player,
      hp: nextHp,
    },
  };
};

export const gainBlock = (state: CombatState, amount: number): CombatState => ({
  ...state,
  player: {
    ...state.player,
    block: state.player.block + amount,
  },
});

const isInStance = (state: CombatState, stance: StanceId): boolean =>
  state.player.mechanic.type === "stance" && state.player.mechanic.stance === stance;

export const changeStance = (state: CombatState, stance: StanceId): CombatState => {
  if (state.player.mechanic.type !== "stance") {
    return state;
  }

  const changed = state.player.mechanic.stance !== stance;

  return {
    ...state,
    player: {
      ...state.player,
      mechanic: {
        ...state.player.mechanic,
        stance,
        transitionsThisTurn: state.player.mechanic.transitionsThisTurn + (changed ? 1 : 0),
      },
    },
  };
};

export const applyStatusEffect = (
  state: CombatState,
  target: "enemy" | "player",
  effect: Extract<CombatEffect, { type: "applyStatus" }>,
): CombatState => {
  if (target === "enemy") {
    return updateActiveEnemy(state, (enemy) => ({
      ...enemy,
      statuses: addStatus(enemy.statuses, effect.status, effect.stacks, effect.duration),
    }));
  }

  return {
    ...state,
    player: {
      ...state.player,
      statuses: addStatus(state.player.statuses, effect.status, effect.stacks, effect.duration),
    },
  };
};

const applyEffect = (state: CombatState, effect: CombatEffect): CombatState => {
  let nextState = state;

  if (effect.type === "damage") {
    nextState = dealDamage(nextState, effect.target, effect.amount);
  }

  if (effect.type === "gainBlock") {
    nextState = gainBlock(nextState, effect.amount);
  }

  if (effect.type === "applyStatus") {
    nextState = applyStatusEffect(nextState, effect.target, effect);
  }

  if (effect.type === "spendPerfectionDamage") {
    const perfection = nextState.player.mechanic.type === "perfection" ? nextState.player.mechanic.perfection : 0;
    const damage = effect.baseDamage + perfection * effect.damagePerPerfection;
    nextState = dealDamage(nextState, effect.target, damage);
    nextState = {
      ...nextState,
      player: {
        ...nextState.player,
        mechanic:
          nextState.player.mechanic.type === "perfection"
            ? {
                ...nextState.player.mechanic,
                perfection: 0,
              }
            : nextState.player.mechanic,
      },
      log: appendLog(nextState, `Crescendo spends Perfection for ${damage} damage.`),
    };
  }

  if (effect.type === "changeStance") {
    nextState = changeStance(nextState, effect.stance);
  }

  if (effect.type === "damageInStance") {
    const damage = isInStance(nextState, effect.stance) ? effect.bonusAmount : effect.amount;
    nextState = dealDamage(nextState, effect.target, damage);
  }

  if (effect.type === "gainBlockInStance") {
    const block = isInStance(nextState, effect.stance) ? effect.bonusAmount : effect.amount;
    nextState = gainBlock(nextState, block);
  }

  if (effect.type === "damagePerStanceTransition") {
    const transitions =
      nextState.player.mechanic.type === "stance" ? nextState.player.mechanic.transitionsThisTurn : 0;
    const damage = effect.baseDamage + transitions * effect.damagePerTransition;
    nextState = dealDamage(nextState, effect.target, damage);
    nextState = {
      ...nextState,
      log: appendLog(nextState, `Flow State deals ${damage} damage.`),
    };
  }

  if (effect.type !== "spendPerfectionDamage" && effect.type !== "damagePerStanceTransition" && effect.log) {
    nextState = {
      ...nextState,
      log: appendLog(nextState, effect.log),
    };
  }

  return nextState;
};

export const applyCombatEffects = (state: CombatState, effects: CombatEffect[]): CombatState =>
  effects.reduce((nextState, effect) => applyEffect(nextState, effect), state);
