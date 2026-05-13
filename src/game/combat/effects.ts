import type { CombatEffect } from "./cards";
import { getActiveEnemy, updateActiveEnemy } from "./enemies";
import { addStatus } from "./statuses";
import type { CombatState } from "./types";

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
    const damage = effect.baseDamage + nextState.player.perfection * effect.damagePerPerfection;
    nextState = dealDamage(nextState, effect.target, damage);
    nextState = {
      ...nextState,
      player: {
        ...nextState.player,
        perfection: 0,
      },
      log: appendLog(nextState, `Crescendo spends Perfection for ${damage} damage.`),
    };
  }

  if (effect.type !== "spendPerfectionDamage" && effect.log) {
    nextState = {
      ...nextState,
      log: appendLog(nextState, effect.log),
    };
  }

  return nextState;
};

export const applyCombatEffects = (state: CombatState, effects: CombatEffect[]): CombatState =>
  effects.reduce((nextState, effect) => applyEffect(nextState, effect), state);
