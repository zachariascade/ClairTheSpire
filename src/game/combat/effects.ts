import type { CombatEffect } from "./cards";
import { getActiveEnemy, getNextLivingEnemyId, updateActiveEnemy, updateEnemy } from "./enemies";
import { addStatus, applyDexterityToBlock, applyStrengthToDamage, getStatusStacks, hasStatus, setStatusStacks } from "./statuses";
import type { CombatState } from "./types";
import type { CharacterMechanicState, StanceId } from "../characters/types";
import { getPerfectionStrength, PERFECTION_GAIN_ON_ENEMY_HIT } from "../characters/perfection";
import { getStanceDexterity, getStanceStrength } from "../characters/stances";

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const appendLog = (state: CombatState, entry: string): string[] => [entry, ...state.log].slice(0, 6);

export const getPlayerStrength = (state: CombatState): number =>
  getStatusStacks(state.player.statuses, "strength") + getStanceStrength(state);

export const getPlayerDexterity = (state: CombatState): number =>
  getStatusStacks(state.player.statuses, "dexterity") + getStanceDexterity(state);

export const applyPlayerStrengthDamage = (state: CombatState, damage: number): number =>
  Math.max(0, applyStrengthToDamage(state.player.statuses, damage) + getStanceStrength(state));

export const applyPlayerDexterityBlock = (state: CombatState, block: number): number =>
  Math.max(0, applyDexterityToBlock(state.player.statuses, block) + getStanceDexterity(state));

const syncPerfectionStrengthStatus = (state: CombatState, previousMechanic?: CharacterMechanicState): CombatState => {
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

const gainPerfectionFromEnemyHit = (state: CombatState, amount: number): CombatState => {
  if (state.player.mechanic.type !== "perfection") {
    return state;
  }

  return syncPerfectionStrengthStatus({
    ...state,
    player: {
      ...state.player,
      mechanic: {
        ...state.player.mechanic,
        perfection: clamp(state.player.mechanic.perfection + amount, 0, state.player.mechanic.maxPerfection),
      },
    },
  }, state.player.mechanic);
};

export const dealDamage = (state: CombatState, target: "enemy" | "player", amount: number): CombatState => {
  if (target === "enemy") {
    const activeEnemy = getActiveEnemy(state);
    const baseDamage = applyPlayerStrengthDamage(state, amount);
    const damage = hasStatus(activeEnemy.statuses, "vulnerable") ? Math.round(baseDamage * 1.5) : baseDamage;
    const nextHp = clamp(activeEnemy.hp - damage, 0, activeEnemy.maxHp);
    const nextActiveEnemyId = nextHp <= 0 ? getNextLivingEnemyId(state, activeEnemy.id) : state.activeEnemyId;
    const nextState = gainPerfectionFromEnemyHit(
      {
        ...state,
        activeEnemyId: nextActiveEnemyId ?? state.activeEnemyId,
        phase: nextHp <= 0 && !nextActiveEnemyId ? "won" : state.phase,
      },
      activeEnemy.hp > 0 && damage > 0 ? PERFECTION_GAIN_ON_ENEMY_HIT : 0,
    );

    return updateEnemy(
      nextState,
      activeEnemy.id,
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

export const gainBlock = (state: CombatState, amount: number): CombatState => {
  const block = applyPlayerDexterityBlock(state, amount);

  return {
    ...state,
    player: {
      ...state.player,
      block: state.player.block + block,
    },
  };
};

export const gainEnergy = (state: CombatState, amount: number): CombatState => ({
  ...state,
  player: {
    ...state.player,
    energy: state.player.energy + amount,
  },
});

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

  if (effect.type === "gainEnergy") {
    nextState = gainEnergy(nextState, effect.amount);
  }

  if (effect.type === "applyStatus") {
    nextState = applyStatusEffect(nextState, effect.target, effect);
  }

  if (effect.type === "spendPerfectionDamage") {
    const perfection = nextState.player.mechanic.type === "perfection" ? nextState.player.mechanic.perfection : 0;
    const damage = effect.baseDamage + perfection * effect.damagePerPerfection;
    const vulnerable = hasStatus(getActiveEnemy(nextState).statuses, "vulnerable");
    const baseActualDamage = applyPlayerStrengthDamage(nextState, damage);
    const actualDamage = vulnerable ? Math.round(baseActualDamage * 1.5) : baseActualDamage;
    nextState = dealDamage(nextState, effect.target, damage);
    const previousMechanic = nextState.player.mechanic;
    nextState = syncPerfectionStrengthStatus({
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
      log: appendLog(nextState, `Crescendo spends Perfection for ${actualDamage} damage.`),
    }, previousMechanic);
  }

  if (effect.type === "changeStance") {
    nextState = changeStance(nextState, effect.stance);
  }

  if (effect.type === "damagePerStanceTransition") {
    const transitions =
      nextState.player.mechanic.type === "stance" ? nextState.player.mechanic.transitionsThisTurn : 0;
    const damage = effect.baseDamage + transitions * effect.damagePerTransition;
    nextState = dealDamage(nextState, effect.target, damage);
    nextState = {
      ...nextState,
      log: appendLog(nextState, "Flow State releases."),
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
