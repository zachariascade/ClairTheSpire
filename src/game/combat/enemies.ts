import type { CombatState, EnemyCombatant } from "./types";

export const getActiveEnemy = (state: CombatState): EnemyCombatant => {
  const activeEnemy = state.enemies.find((enemy) => enemy.id === state.activeEnemyId);

  if (!activeEnemy) {
    throw new Error(`Active enemy not found: ${state.activeEnemyId}`);
  }

  return activeEnemy;
};

export const updateEnemy = (
  state: CombatState,
  enemyId: string,
  update: (enemy: EnemyCombatant) => EnemyCombatant,
): CombatState => ({
  ...state,
  enemies: state.enemies.map((enemy) => (enemy.id === enemyId ? update(enemy) : enemy)),
});

export const updateActiveEnemy = (
  state: CombatState,
  update: (enemy: EnemyCombatant) => EnemyCombatant,
): CombatState => updateEnemy(state, state.activeEnemyId, update);
