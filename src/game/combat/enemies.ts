import { attackPatterns, type AttackId } from "./attackPatterns";
import type { CombatState, EnemyCombatant } from "./types";

export type EnemyDefinitionId =
  | "first-talon-acqueline"
  | "forcas"
  | "rondeau"
  | "second-talon-scyara"
  | "tetratitanuke"
  | "vesuvio";

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
  "first-talon-acqueline": {
    id: "first-talon-acqueline",
    name: "First Talon Acqueline",
    image: "enemies/first-talon-acqueline.png",
    maxHp: 50,
    attackId: "heavy-overhead",
    description: "A commanding Talon fighter with deliberate, punishing strikes.",
  },
  forcas: {
    id: "forcas",
    name: "Forcas",
    image: "enemies/forcas.png",
    maxHp: 44,
    attackId: "three-hit-combo",
    description: "A relentless attacker that pressures repeated parry and dodge timing.",
  },
  rondeau: {
    id: "rondeau",
    name: "Rondeau",
    image: "enemies/rondeau.png",
    maxHp: 38,
    attackId: "quick-slash",
    description: "A nimble foe with fast, readable strikes and little room for hesitation.",
  },
  "second-talon-scyara": {
    id: "second-talon-scyara",
    name: "Second Talon Scyara",
    image: "enemies/second-talon-scyara.png",
    maxHp: 46,
    attackId: "three-hit-combo",
    description: "A poised duelist whose measured rhythm punishes sloppy reactions.",
  },
  tetratitanuke: {
    id: "tetratitanuke",
    name: "Tetratitanuke",
    image: "enemies/tetratitanuke.png",
    maxHp: 54,
    attackId: "orbital-laser",
    description: "A strange engine of layered hits that tests long defensive rhythms.",
  },
  vesuvio: {
    id: "vesuvio",
    name: "Vesuvio",
    image: "enemies/vesuvio.png",
    maxHp: 48,
    attackId: "shield-breaker",
    description: "A volcanic brute whose blast rewards preparing solid block before impact.",
  },
};

export const enemyOrder: EnemyDefinitionId[] = [
  "vesuvio",
  "first-talon-acqueline",
  "forcas",
  "rondeau",
  "second-talon-scyara",
  "tetratitanuke",
];

export const defaultEnemySelection: EnemyDefinitionId[] = ["vesuvio"];

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
