import { attackPatterns, type AttackId } from "./attackPatterns";
import type { CombatState, EnemyCombatant } from "./types";

export type EnemyDefinitionId = "griffith" | "sephiroth" | "war-apostle" | "astral-sentinel" | "iron-vanguard";

type EnemyDefinition = {
  id: EnemyDefinitionId;
  name: string;
  image: string;
  maxHp: number;
  attackId: AttackId;
  description: string;
};

export const maxScenarioEnemies = 3;

export const enemyDefinitions: Record<EnemyDefinitionId, EnemyDefinition> = {
  griffith: {
    id: "griffith",
    name: "Griffith",
    image: "griffith.png",
    maxHp: 64,
    attackId: "quick-slash",
    description: "Fast single-target pressure with a readable opening slash.",
  },
  sephiroth: {
    id: "sephiroth",
    name: "Sephiroth",
    image: "sephiroth.png",
    maxHp: 68,
    attackId: "heavy-overhead",
    description: "A precise duelist with a delayed, punishing Masamune strike.",
  },
  "war-apostle": {
    id: "war-apostle",
    name: "War Apostle",
    image: "griffith.png",
    maxHp: 36,
    attackId: "three-hit-combo",
    description: "A bruiser that tests repeated parry and dodge timing.",
  },
  "astral-sentinel": {
    id: "astral-sentinel",
    name: "Astral Sentinel",
    image: "griffith.png",
    maxHp: 30,
    attackId: "orbital-laser",
    description: "Low health, long attack strings, and punishing rhythm checks.",
  },
  "iron-vanguard": {
    id: "iron-vanguard",
    name: "Iron Vanguard",
    image: "griffith.png",
    maxHp: 42,
    attackId: "shield-breaker",
    description: "A defensive test that rewards planning block before its blast.",
  },
};

export const enemyOrder: EnemyDefinitionId[] = ["griffith", "sephiroth", "war-apostle", "astral-sentinel", "iron-vanguard"];

export const defaultEnemySelection: EnemyDefinitionId[] = ["griffith"];

export const normalizeEnemySelection = (enemyIds?: readonly EnemyDefinitionId[]): EnemyDefinitionId[] => {
  const validEnemyIds = (enemyIds ?? defaultEnemySelection)
    .filter((enemyId): enemyId is EnemyDefinitionId => enemyId in enemyDefinitions)
    .slice(0, maxScenarioEnemies);

  return validEnemyIds.length > 0 ? validEnemyIds : defaultEnemySelection;
};

export const createEnemyCombatants = (enemyIds?: readonly EnemyDefinitionId[]): EnemyCombatant[] =>
  normalizeEnemySelection(enemyIds).map((enemyId, index) => {
    const definition = enemyDefinitions[enemyId];

    return {
      id: `${enemyId}-${index + 1}`,
      definitionId: definition.id,
      name: definition.name,
      image: definition.image,
      hp: definition.maxHp,
      maxHp: definition.maxHp,
      attackId: definition.attackId,
      intent: attackPatterns[definition.attackId].name,
      statuses: {},
    };
  });

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

export const getNextLivingEnemyId = (state: CombatState, defeatedEnemyId: string): string | null => {
  const defeatedIndex = state.enemies.findIndex((enemy) => enemy.id === defeatedEnemyId);
  const searchOrder = [
    ...state.enemies.slice(defeatedIndex + 1),
    ...state.enemies.slice(0, Math.max(0, defeatedIndex)),
  ];

  return searchOrder.find((enemy) => enemy.hp > 0)?.id ?? null;
};
