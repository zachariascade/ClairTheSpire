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
    name: "First Talon Aquiline",
    image: "enemies/first-talon-acqueline.png",
    maxHp: 50,
    attackId: "heavy-overhead",
    description:
      "Aquiline came from the Night-Serpent's dark order with the calm of a man who had never needed a second attempt at murder.",
  },
  forcas: {
    id: "forcas",
    name: "Forcas",
    image: "enemies/forcas.png",
    maxHp: 44,
    attackId: "three-hit-combo",
    description:
      "The Warehouse breathed around Forcas as though steel and shadow had crowned him king, and the breach laughed through his mouth.",
  },
  rondeau: {
    id: "rondeau",
    name: "Rondeau",
    image: "enemies/rondeau.png",
    maxHp: 38,
    attackId: "quick-slash",
    description:
      "Rondeau sold ruin with a perfect smile, making coercion sound elegant enough for rulers to call it the future.",
  },
  "second-talon-scyara": {
    id: "second-talon-scyara",
    name: "Second Talon Scyara",
    image: "enemies/second-talon-scyara.png",
    maxHp: 46,
    attackId: "three-hit-combo",
    description:
      "Scyara hunted in Aquiline's shadow until holy contradiction split the chase open and doubt found a voice beneath her knives.",
  },
  tetratitanuke: {
    id: "tetratitanuke",
    name: "Tetratitanuke",
    image: "enemies/tetratitanuke.png",
    maxHp: 54,
    attackId: "orbital-laser",
    description:
      "Egrebath's war-beast fell into the battlefield like biology taught to hate, eighty feet of Cain-grown siege made flesh.",
  },
  vesuvio: {
    id: "vesuvio",
    name: "Vesuvio",
    image: "enemies/vesuvio.png",
    maxHp: 48,
    attackId: "shield-breaker",
    description:
      "Vesuvio rose over Prushalem as a bound volcanic Chasm, disciplined catastrophe pouring fire through the city's golden streets.",
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
