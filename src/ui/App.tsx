import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  attackOrder,
  attackPatterns,
  getAttackDuration,
  type AttackHit,
  type AttackId,
  type AttackPattern,
} from "../game/combat/attackPatterns";
import {
  cardDefinitions,
  getCardPlayBlockReason,
  type CardDefinition,
  type CardPresentationDamage,
  type CardPresentationStep,
} from "../game/combat/cards";
import {
  defaultEnemySelection,
  enemyDefinitions,
  enemyOrder,
  getActiveEnemy,
  maxScenarioEnemies,
  normalizeEnemySelection,
  type EnemyDefinitionId,
} from "../game/combat/enemies";
import { combatReducer, createInitialCombatState, getReactionTimingModifiers } from "../game/combat/reducer";
import { getStatusStacks, hasStatus, type StatusCollection, type StatusId } from "../game/combat/statuses";
import type { CombatCard, EnemyCombatant, EnemyPhaseSummary, ReactionResult } from "../game/combat/types";
import { playSfx, preloadSfx } from "../game/audio/audioManager";
import { characterDefinitions, characterOrder } from "../game/characters/definitions";
import {
  getPerfectionDamageDealtMultiplier,
  getPerfectionRank,
  perfectionRankRules,
} from "../game/characters/perfection";
import { stanceRules } from "../game/characters/stances";
import type { CharacterId, CharacterMechanicState } from "../game/characters/types";
import { relicDefinitions } from "../game/relics/definitions";
import type { PlayerRelic } from "../game/relics/types";
import { PhaserBattlefield, type PhaserBattlefieldHandle } from "./PhaserBattlefield";
import { TargetingOverlay } from "./TargetingOverlay";

type CardRects = Record<string, DOMRect>;
type PointerPoint = {
  x: number;
  y: number;
};
type BattlefieldTextTone = "good" | "bad" | "neutral" | "damage" | "block";
type ActorFeedback = {
  id: number;
  text: string;
  tone: "damage" | "good" | "block" | "perfect" | "parry" | "dodge" | "miss";
};
type TimingInputMarker = {
  id: number;
  percent: number;
  tone: "perfect" | "parry" | "dodge" | "miss";
};
type ResolvedCardPresentationStep = {
  delayMs: number;
  target: "player" | "enemy";
  text: string;
  tone: BattlefieldTextTone;
  impact: boolean;
  animation?: "slash" | "heavy";
};
type BackgroundOption = {
  id: string;
  name: string;
  image: string;
};
type MusicPlaybackState = "off" | "loading" | "on" | "missing";
type AppRoute = "root" | "battle";
type UrlSelection = {
  characterId: CharacterId;
  backgroundId: string;
  enemyIds: EnemyDefinitionId[];
};
type StatusDisplayDefinition = {
  description: string;
  label: string;
  shortLabel: string;
  tone: "good" | "bad" | "neutral";
};
type CardKeywordDefinition = {
  aliases: string[];
  description: string;
  label: string;
};

const TURN_BANNER_DURATION_MS = 1300;
const PLAYER_TURN_AFTER_ENEMY_PAUSE_MS = 750;
const backgroundOptions: BackgroundOption[] = [
  {
    id: "castle",
    name: "Castle",
    image: "castle-background.png",
  },
  {
    id: "battlefield",
    name: "Battlefield",
    image: "battlefield-background.png",
  },
];
const soundtrack = {
  title: "RPG Main Theme",
  artist: "OpenGameArt",
  sourceUrl: "https://opengameart.org/content/rpg-main-theme",
  audioPath: "https://opengameart.org/sites/default/files/maintheme.mp3",
  volume: 0.34,
};

const defaultUrlSelection: UrlSelection = {
  characterId: "perfector",
  backgroundId: backgroundOptions[0].id,
  enemyIds: defaultEnemySelection,
};
const statusDisplayDefinitions: Record<StatusId, StatusDisplayDefinition> = {
  focus: {
    label: "Focus",
    shortLabel: "Fo",
    tone: "good",
    description: "Widens parry and dodge timing windows. Perfector gains extra Perfection from parries.",
  },
  "recovery-step": {
    label: "Recovery Step",
    shortLabel: "Re",
    tone: "good",
    description: "The next failed reaction this turn causes no damage and no Perfection loss.",
  },
  "riposte-prep": {
    label: "Counter Attack",
    shortLabel: "Co",
    tone: "good",
    description: "This turn, all parries counter for 3 damage before damage modifiers.",
  },
  vulnerable: {
    label: "Vulnerable",
    shortLabel: "Vu",
    tone: "bad",
    description: "Takes 50% more damage from attacks and counters. Loses 1 stack after each enemy turn.",
  },
};
const cardKeywordDefinitions: CardKeywordDefinition[] = [
  {
    label: "Block",
    aliases: ["block"],
    description: "Prevents incoming attack damage before HP is lost.",
  },
  {
    label: "Vulnerable",
    aliases: ["vulnerable", "vulneralble"],
    description: "Takes 50% more damage from attacks and counters.",
  },
  {
    label: "Weak",
    aliases: ["weak"],
    description: "Deals reduced attack damage while active.",
  },
];

const normalizeCharacterId = (value: string | null): CharacterId | null => {
  if (value === "perfection") {
    return "perfector";
  }

  if (value === "stance") {
    return "fencer";
  }

  return value !== null && value in characterDefinitions ? (value as CharacterId) : null;
};

const isBackgroundId = (value: string | null): value is string =>
  value !== null && backgroundOptions.some((background) => background.id === value);

const normalizeEnemyId = (value: string): EnemyDefinitionId | null =>
  value in enemyDefinitions ? (value as EnemyDefinitionId) : null;

const readEnemySelection = (params: URLSearchParams): EnemyDefinitionId[] => {
  const rawEnemies = params.get("enemies");

  if (!rawEnemies) {
    return defaultUrlSelection.enemyIds;
  }

  return normalizeEnemySelection(
    rawEnemies
      .split(",")
      .map((enemyId) => normalizeEnemyId(enemyId.trim()))
      .filter((enemyId): enemyId is EnemyDefinitionId => enemyId !== null),
  );
};

const readUrlSelection = (): UrlSelection => {
  const params = new URLSearchParams(window.location.search);
  const character = params.get("character");
  const scene = params.get("scene");

  return {
    characterId: normalizeCharacterId(character) ?? defaultUrlSelection.characterId,
    backgroundId: isBackgroundId(scene) ? scene : defaultUrlSelection.backgroundId,
    enemyIds: readEnemySelection(params),
  };
};

const getBasePath = () => {
  const base = import.meta.env.BASE_URL;
  return base.endsWith("/") ? base.slice(0, -1) : base;
};

const getRoute = (): AppRoute => {
  const basePath = getBasePath();
  const routePath = window.location.pathname.slice(basePath.length) || "/";

  return routePath === "/battle" ? "battle" : "root";
};

const getRoutePath = (route: AppRoute) => {
  const basePath = getBasePath();
  return `${basePath}${route === "battle" ? "/battle" : "/"}`;
};

const writeUrlSelection = (selection: UrlSelection, route: AppRoute, mode: "push" | "replace" = "replace") => {
  const url = new URL(window.location.href);
  url.pathname = getRoutePath(route);
  url.searchParams.set("character", selection.characterId);
  url.searchParams.set("scene", selection.backgroundId);
  url.searchParams.set("enemies", normalizeEnemySelection(selection.enemyIds).join(","));
  url.searchParams.delete("screen");

  if (mode === "push") {
    window.history.pushState(null, "", url);
    return;
  }

  window.history.replaceState(null, "", url);
};

const getDamageMultiplier = (mechanic: CharacterMechanicState, enemyIsVulnerable = false) =>
  (mechanic.type === "stance" ? stanceRules[mechanic.stance].damageDealt : 1) *
  getPerfectionDamageDealtMultiplier(mechanic) *
  (enemyIsVulnerable ? 1.5 : 1);

const getPresentationDamage = (
  damage: CardPresentationDamage,
  mechanic: CharacterMechanicState,
  enemyIsVulnerable = false,
) => {
  const perfection = mechanic.type === "perfection" ? mechanic.perfection : 0;
  const transitions = mechanic.type === "stance" ? mechanic.transitionsThisTurn : 0;

  if (damage.type === "fixed") {
    return Math.round(damage.amount * getDamageMultiplier(mechanic, enemyIsVulnerable));
  }

  if (damage.type === "spendPerfection") {
    return Math.round(
      (damage.baseDamage + perfection * damage.damagePerPerfection) * getDamageMultiplier(mechanic, enemyIsVulnerable),
    );
  }

  return Math.round(
    (damage.baseDamage + transitions * damage.damagePerTransition) * getDamageMultiplier(mechanic, enemyIsVulnerable),
  );
};

const resolveCardPresentation = (
  definition: CardDefinition,
  mechanic: CharacterMechanicState,
  enemyIsVulnerable = false,
): ResolvedCardPresentationStep[] =>
  definition.presentation.map((step: CardPresentationStep) => {
    if (step.type === "attack") {
      return {
        delayMs: step.delayMs,
        target: step.target,
        text: `-${getPresentationDamage(step.damage, mechanic, enemyIsVulnerable)}`,
        tone: "damage",
        impact: true,
        animation: step.animation,
      };
    }

    if (step.type === "block") {
      return {
        delayMs: step.delayMs,
        target: step.target,
        text: `+${step.amount} Block`,
        tone: "block",
        impact: false,
      };
    }

    if (step.type === "stance") {
      return {
        delayMs: step.delayMs,
        target: step.target,
        text: step.label,
        tone: "good",
        impact: false,
      };
    }

    return {
      delayMs: step.delayMs,
      target: step.target,
      text: step.label,
      tone: step.tone,
      impact: false,
    };
  });

const getCurrentCardDamage = (
  definition: CardDefinition,
  mechanic: CharacterMechanicState,
  enemyIsVulnerable = false,
) => {
  const damageEffect = definition.effects.find((effect) => effect.type === "damage" && effect.target === "enemy");
  const transitionDamageEffect = definition.effects.find((effect) => effect.type === "damagePerStanceTransition");
  const perfectionDamageEffect = definition.effects.find((effect) => effect.type === "spendPerfectionDamage");
  const damageMultiplier = getDamageMultiplier(mechanic, enemyIsVulnerable);

  if (damageEffect?.type === "damage") {
    return {
      baseDamage: damageEffect.amount,
      displayedDamage: damageEffect.amount,
      currentDamage: Math.round(damageEffect.amount * damageMultiplier),
    };
  }

  if (transitionDamageEffect?.type === "damagePerStanceTransition") {
    const transitions = mechanic.type === "stance" ? mechanic.transitionsThisTurn : 0;
    const baseDamage = transitionDamageEffect.baseDamage + transitions * transitionDamageEffect.damagePerTransition;

    return {
      baseDamage,
      displayedDamage: transitionDamageEffect.baseDamage,
      currentDamage: Math.round(baseDamage * damageMultiplier),
    };
  }

  if (perfectionDamageEffect?.type === "spendPerfectionDamage") {
    const perfection = mechanic.type === "perfection" ? mechanic.perfection : 0;
    const baseDamage = perfectionDamageEffect.baseDamage + perfection * perfectionDamageEffect.damagePerPerfection;

    return {
      baseDamage,
      displayedDamage: perfectionDamageEffect.baseDamage,
      currentDamage: Math.round(baseDamage * damageMultiplier),
    };
  }

  return null;
};

const playCardSfx = (steps: ResolvedCardPresentationStep[]) => {
  playSfx("ui.cardPlay", { volume: 0.48 });

  for (const step of steps) {
    if (step.impact) {
      window.setTimeout(() => {
        playSfx("combat.whoosh", {
          volume: step.animation === "heavy" ? 0.5 : 0.38,
          playbackRateVariance: step.animation === "heavy" ? 0.05 : 0.1,
        });
      }, step.delayMs);
      window.setTimeout(() => {
        playSfx("combat.swordClash", {
          volume: step.animation === "heavy" ? 0.68 : 0.58,
          playbackRateVariance: 0.08,
        });
      }, step.delayMs + (step.animation === "heavy" ? 230 : 115));
      continue;
    }

    if (step.tone === "block") {
      window.setTimeout(() => {
        playSfx("combat.block", { volume: 0.5 });
      }, step.delayMs);
      continue;
    }

    window.setTimeout(() => {
      playSfx(step.tone === "bad" ? "status.debuff" : "status.buff", { volume: 0.42, playbackRateVariance: 0.035 });
    }, step.delayMs);
  }
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const getCardKeyword = (text: string) =>
  cardKeywordDefinitions.find((keyword) => keyword.aliases.some((alias) => alias.toLowerCase() === text.toLowerCase()));
const getCardRuleKeywords = (rulesText: string) =>
  cardKeywordDefinitions.filter((keyword) =>
    keyword.aliases.some((alias) => new RegExp(`\\b${escapeRegExp(alias)}\\b`, "i").test(rulesText)),
  );

const renderCardRulesText = (
  definition: CardDefinition,
  mechanic: CharacterMechanicState,
  enemyIsVulnerable = false,
) => {
  const stanceEntries = Object.entries(stanceRules);
  const stancePattern = stanceEntries.map(([, stance]) => escapeRegExp(stance.label)).join("|");
  const keywordPattern = cardKeywordDefinitions
    .flatMap((keyword) => keyword.aliases)
    .map(escapeRegExp)
    .join("|");
  const damagePreview = getCurrentCardDamage(definition, mechanic, enemyIsVulnerable);
  const damageNumberPattern =
    damagePreview && damagePreview.currentDamage !== damagePreview.baseDamage
      ? new RegExp(`(?<=\\bDeal\\s)${damagePreview.displayedDamage}\\b`)
      : null;
  const combinedPattern = new RegExp(
    `${damageNumberPattern ? `(${damageNumberPattern.source})|` : ""}\\b(${stancePattern}|${keywordPattern})\\b`,
    "gi",
  );
  const parts = definition.rulesText.split(combinedPattern).filter((part): part is string => part !== undefined && part !== "");

  return parts.map((part, index) => {
    const stance = stanceEntries.find(([, rule]) => rule.label.toLowerCase() === part.toLowerCase())?.[1];
    const keyword = getCardKeyword(part);

    if (stance) {
      return (
        <span className="card-rules-stance" style={{ "--stance-color": stance.color } as CSSProperties} key={`${part}-${index}`}>
          {part}
        </span>
      );
    }

    if (keyword) {
      return (
        <strong className="card-rules-keyword" key={`${part}-${index}`}>
          {part}
        </strong>
      );
    }

    if (damagePreview && damageNumberPattern && part === String(damagePreview.displayedDamage)) {
      const tone = damagePreview.currentDamage > damagePreview.baseDamage ? "up" : "down";

      return (
        <span className={`card-rules-damage card-rules-damage-${tone}`} key={`${part}-${index}`}>
          {damagePreview.currentDamage}
        </span>
      );
    }

    return part;
  });
};

export function App() {
  const initialUrlSelection = useMemo(readUrlSelection, []);
  const initialRoute = useMemo(getRoute, []);
  const [state, dispatch] = useReducer(
    combatReducer,
    {
      characterId: initialUrlSelection.characterId,
      enemyIds: initialUrlSelection.enemyIds,
    },
    createInitialCombatState,
  );
  const [selectedCharacterId, setSelectedCharacterId] = useState<CharacterId>(initialUrlSelection.characterId);
  const [selectedEnemyIds, setSelectedEnemyIds] = useState<EnemyDefinitionId[]>(initialUrlSelection.enemyIds);
  const [selectedBackgroundId, setSelectedBackgroundId] = useState(initialUrlSelection.backgroundId);
  const [route, setRoute] = useState<AppRoute>(initialRoute);
  const [enemyRect, setEnemyRect] = useState<DOMRect | null>(null);
  const [enemyRects, setEnemyRects] = useState<Record<string, DOMRect>>({});
  const [playerRect, setPlayerRect] = useState<DOMRect | null>(null);
  const [cardRects, setCardRects] = useState<CardRects>({});
  const [targetPointer, setTargetPointer] = useState<PointerPoint | null>(null);
  const [hoveredEnemyId, setHoveredEnemyId] = useState<string | null>(null);
  const [isPlayerTargetHovered, setIsPlayerTargetHovered] = useState(false);
  const [targetCornersExiting, setTargetCornersExiting] = useState(false);
  const [enemyFeedback, setEnemyFeedback] = useState<ActorFeedback | null>(null);
  const [playerFeedback, setPlayerFeedback] = useState<ActorFeedback | null>(null);
  const [timingInputMarker, setTimingInputMarker] = useState<TimingInputMarker | null>(null);
  const [animatingCardId, setAnimatingCardId] = useState<string | null>(null);
  const [attackStartedAt, setAttackStartedAt] = useState<number | null>(null);
  const [showTimingAssist, setShowTimingAssist] = useState(true);
  const [debugCollapsed, setDebugCollapsed] = useState(true);
  const [musicPlayback, setMusicPlayback] = useState<MusicPlaybackState>("off");
  const [musicMenuExpanded, setMusicMenuExpanded] = useState(false);
  const battlefieldRef = useRef<PhaserBattlefieldHandle | null>(null);
  const soundtrackRef = useRef<HTMLAudioElement | null>(null);
  const resolvedHitIdsRef = useRef<Set<number>>(new Set());
  const hadTargetCornerHoverRef = useRef(false);
  const targetCornerExitTimerRef = useRef<number | null>(null);
  const feedbackIdRef = useRef(0);
  const previousPhaseRef = useRef(state.phase);

  const selectedCard = useMemo(
    () => state.hand.find((card) => card.instanceId === state.selectedCardId) ?? null,
    [state.hand, state.selectedCardId],
  );

  const selectedDefinition = selectedCard ? cardDefinitions[selectedCard.definitionId] : null;
  const selectedCardRect = selectedCard ? cardRects[selectedCard.instanceId] ?? null : null;
  const isAimingEnemyCard = selectedDefinition?.target === "enemy";
  const isAimingPlayerCard = selectedDefinition?.target === "self";
  const isAimingTargetedCard = isAimingEnemyCard || isAimingPlayerCard;
  const hoveredEnemy = hoveredEnemyId ? state.enemies.find((enemy) => enemy.id === hoveredEnemyId) ?? null : null;
  const hoveredEnemyRect = hoveredEnemyId ? enemyRects[hoveredEnemyId] ?? null : null;
  const targetBounds = isAimingEnemyCard ? hoveredEnemyRect ?? enemyRect : isAimingPlayerCard ? playerRect : null;
  const isEnemyTargetHovered = hoveredEnemyId !== null;
  const isTargetHovered = isAimingEnemyCard ? isEnemyTargetHovered : isAimingPlayerCard ? isPlayerTargetHovered : false;
  const targetLabel = isAimingEnemyCard ? "enemy" : "player";
  const activeEnemy = getActiveEnemy(state);
  const turnBannerLabel = state.phase === "playerTurn" ? "Player Turn" : activeEnemy.name;
  const hoveredEnemyIsVulnerable = isAimingEnemyCard && hoveredEnemy !== null && hasStatus(hoveredEnemy.statuses, "vulnerable");
  const currentAttackPattern = attackPatterns[activeEnemy.attackId];
  const selectedBackground =
    backgroundOptions.find((background) => background.id === selectedBackgroundId) ?? backgroundOptions[0];

  const startCombat = useCallback((characterId: CharacterId, enemyIds: EnemyDefinitionId[]) => {
    const normalizedEnemyIds = normalizeEnemySelection(enemyIds);

    playSfx("ui.confirm", { volume: 0.44 });
    setSelectedCharacterId(characterId);
    setSelectedEnemyIds(normalizedEnemyIds);
    dispatch({ type: "RESET_COMBAT", characterId, enemyIds: normalizedEnemyIds });
    setRoute("battle");
    writeUrlSelection(
      {
        characterId,
        backgroundId: selectedBackgroundId,
        enemyIds: normalizedEnemyIds,
      },
      "battle",
      "push",
    );
  }, [selectedBackgroundId]);

  useEffect(() => {
    writeUrlSelection({
      characterId: selectedCharacterId,
      enemyIds: selectedEnemyIds,
      backgroundId: selectedBackgroundId,
    }, route);
  }, [route, selectedBackgroundId, selectedCharacterId, selectedEnemyIds]);

  useEffect(() => {
    preloadSfx([
      "ui.cardHover",
      "ui.cardPlay",
      "ui.confirm",
      "ui.turnStart",
      "combat.block",
      "combat.bodyHit",
      "combat.heavyBodyHit",
      "combat.laserCharge",
      "combat.laserFire",
      "combat.laserImpact",
      "combat.metalBlock",
      "combat.swordClash",
      "combat.whoosh",
      "status.buff",
      "status.perfection",
    ]);
  }, []);

  useEffect(() => {
    const previousPhase = previousPhaseRef.current;
    previousPhaseRef.current = state.phase;

    if (previousPhase === state.phase) {
      return;
    }

    if (state.phase === "playerTurn") {
      playSfx("ui.turnStart", { volume: 0.38, cooldownMs: 240 });
      return;
    }

  }, [state.phase]);

  useEffect(() => {
    const handlePopState = () => {
      const nextSelection = readUrlSelection();
      const nextRoute = getRoute();

      setSelectedCharacterId(nextSelection.characterId);
      setSelectedEnemyIds(nextSelection.enemyIds);
      setSelectedBackgroundId(nextSelection.backgroundId);
      setRoute(nextRoute);

      if (nextRoute === "battle") {
        dispatch({ type: "RESET_COMBAT", characterId: nextSelection.characterId, enemyIds: nextSelection.enemyIds });
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const showActorFeedback = useCallback((target: "player" | "enemy", text: string, tone: ActorFeedback["tone"]) => {
    feedbackIdRef.current += 1;
    const feedback = { id: feedbackIdRef.current, text, tone };
    const setter = target === "enemy" ? setEnemyFeedback : setPlayerFeedback;

    setter(feedback);
    window.setTimeout(() => {
      setter((current) => (current?.id === feedback.id ? null : current));
    }, 950);
  }, []);

  const showTimingInputMarker = useCallback((percent: number, tone: TimingInputMarker["tone"]) => {
    feedbackIdRef.current += 1;
    const marker = { id: feedbackIdRef.current, percent, tone };

    setTimingInputMarker(marker);
    window.setTimeout(() => {
      setTimingInputMarker((current) => (current?.id === marker.id ? null : current));
    }, 900);
  }, []);

  const playCard = useCallback(
    (card: CombatCard, targetEnemyId?: string) => {
      const definition = cardDefinitions[card.definitionId];
      const targetEnemy = targetEnemyId ? state.enemies.find((enemy) => enemy.id === targetEnemyId) ?? activeEnemy : activeEnemy;
      const enemyIsVulnerable = hasStatus(targetEnemy.statuses, "vulnerable");
      const presentation = resolveCardPresentation(definition, state.player.mechanic, enemyIsVulnerable);
      if (definition.target === "enemy") {
        battlefieldRef.current?.focusEnemy(targetEnemy.id);
        setEnemyRect(enemyRects[targetEnemy.id] ?? enemyRect);
      }
      playCardSfx(presentation);
      setAnimatingCardId(card.instanceId);
      let previewEnemyHp = targetEnemy.hp;

      for (const step of presentation) {
        window.setTimeout(() => {
          if (step.impact) {
            battlefieldRef.current?.playCardImpact(step.text, targetEnemy.id);
            const damage = Number.parseInt(step.text.replace(/[^0-9-]/g, ""), 10);
            if (Number.isFinite(damage) && damage < 0) {
              previewEnemyHp = Math.max(0, previewEnemyHp + damage);
              battlefieldRef.current?.updateEnemyHud({
                id: targetEnemy.id,
                image: targetEnemy.image,
                hp: previewEnemyHp,
                maxHp: targetEnemy.maxHp,
              });
            }
            showActorFeedback("enemy", step.text, "damage");
            return;
          }

          if (step.tone !== "block") {
            battlefieldRef.current?.showFloatingText(step.target, step.text, step.tone, step.target === "enemy" ? targetEnemy.id : undefined);
          }
          showActorFeedback(step.target, step.text, step.tone === "block" ? "block" : "good");
        }, step.delayMs);
      }

      const finalStepDelay = presentation.reduce((delay, step) => Math.max(delay, step.delayMs), 0);
      const resolutionDelay = Math.max(definition.target === "enemy" ? 260 : 80, finalStepDelay + 370);

      window.setTimeout(() => {
        dispatch({ type: "PLAY_CARD", cardId: card.instanceId, targetEnemyId });
        setHoveredEnemyId(null);
        setIsPlayerTargetHovered(false);
        setTargetPointer(null);
        setAnimatingCardId(null);
      }, resolutionDelay);
    },
    [activeEnemy, showActorFeedback, state.enemies, state.player.mechanic],
  );

  const handleCardClick = useCallback(
    (card: CombatCard) => {
      const definition = cardDefinitions[card.definitionId];

      if (definition.target === "none") {
        playCard(card);
        return;
      }

      playSfx(state.selectedCardId === card.instanceId ? "ui.cancel" : "ui.cardHover", { volume: 0.34, cooldownMs: 80 });
      dispatch({
        type: "SELECT_CARD",
        cardId: state.selectedCardId === card.instanceId ? null : card.instanceId,
      });
    },
    [playCard, state.selectedCardId],
  );

  const playSelectedCard = useCallback(() => {
    if (!selectedCard) {
      return;
    }

    playCard(selectedCard);
  }, [playCard, selectedCard]);

  const playSelectedCardOnEnemy = useCallback(
    (enemyId: string) => {
      if (!selectedCard) {
        return;
      }

      playCard(selectedCard, enemyId);
    },
    [playCard, selectedCard],
  );

  useEffect(() => {
    if (!isAimingTargetedCard || !selectedCardRect) {
      setTargetPointer(null);
      setHoveredEnemyId(null);
      setIsPlayerTargetHovered(false);
      return;
    }

    setTargetPointer((pointer) => pointer ?? {
      x: selectedCardRect.left + selectedCardRect.width / 2,
      y: selectedCardRect.top + selectedCardRect.height / 2,
    });

    const handlePointerMove = (event: PointerEvent) => {
      setTargetPointer({ x: event.clientX, y: event.clientY });
      if (isAimingEnemyCard) {
        const hoveredEnemyEntry = state.enemies
          .filter((enemy) => enemy.hp > 0)
          .map((enemy) => [enemy.id, enemyRects[enemy.id]] as const)
          .find(([, rect]) =>
            Boolean(rect) &&
            event.clientX >= rect.left &&
            event.clientX <= rect.right &&
            event.clientY >= rect.top &&
            event.clientY <= rect.bottom,
          );
        setHoveredEnemyId(hoveredEnemyEntry?.[0] ?? null);
        setIsPlayerTargetHovered(false);
        return;
      }

      if (isAimingPlayerCard && playerRect) {
        const hovered =
          event.clientX >= playerRect.left &&
          event.clientX <= playerRect.right &&
          event.clientY >= playerRect.top &&
          event.clientY <= playerRect.bottom;
        setIsPlayerTargetHovered(hovered);
        setHoveredEnemyId(null);
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    return () => window.removeEventListener("pointermove", handlePointerMove);
  }, [enemyRects, isAimingEnemyCard, isAimingPlayerCard, isAimingTargetedCard, playerRect, selectedCardRect, state.enemies]);

  useEffect(() => {
    if (targetCornerExitTimerRef.current !== null) {
      window.clearTimeout(targetCornerExitTimerRef.current);
      targetCornerExitTimerRef.current = null;
    }

    if (isTargetHovered) {
      hadTargetCornerHoverRef.current = true;
      setTargetCornersExiting(false);
      return;
    }

    if (hadTargetCornerHoverRef.current) {
      hadTargetCornerHoverRef.current = false;
      setTargetCornersExiting(true);
      targetCornerExitTimerRef.current = window.setTimeout(() => {
        setTargetCornersExiting(false);
        targetCornerExitTimerRef.current = null;
      }, 180);
    }
  }, [isTargetHovered]);

  useEffect(() => () => {
    if (targetCornerExitTimerRef.current !== null) {
      window.clearTimeout(targetCornerExitTimerRef.current);
    }
  }, []);

  const completeEnemyAttackSoon = useCallback(() => {
    window.setTimeout(() => dispatch({ type: "ENEMY_ATTACK_COMPLETE" }), PLAYER_TURN_AFTER_ENEMY_PAUSE_MS);
  }, []);

  const handleReactionResult = useCallback((hitIndex: number, hit: AttackHit, result: ReactionResult, label: string) => {
    if (resolvedHitIdsRef.current.has(hitIndex)) {
      return;
    }

    resolvedHitIdsRef.current.add(hitIndex);
    const recoveryCatches = result === "REACTION_FAILED" && hasStatus(state.player.statuses, "recovery-step");
    const riposteCounters =
      (result === "PARRY_PERFECT" || result === "PARRY_NORMAL") && hasStatus(state.player.statuses, "riposte-prep");
    const tone = result === "HIT_TAKEN" || (result === "REACTION_FAILED" && !recoveryCatches) ? "bad" : "good";
    const displayLabel = recoveryCatches ? "Recovery" : riposteCounters ? "Counter" : label;
    const stanceDamageReceived =
      state.player.mechanic.type === "stance" ? stanceRules[state.player.mechanic.stance].damageReceived : 1;
    const baseDamage = Math.round(hit.damage * stanceDamageReceived);
    const hpDamage = Math.max(0, baseDamage - state.player.block);
    const stanceDamageDealt =
      state.player.mechanic.type === "stance" ? stanceRules[state.player.mechanic.stance].damageDealt : 1;
    const enemyIsVulnerable = hasStatus(activeEnemy.statuses, "vulnerable");
    const riposteDamage = Math.round(
      3 * stanceDamageDealt * getPerfectionDamageDealtMultiplier(state.player.mechanic) * (enemyIsVulnerable ? 1.5 : 1),
    );

    battlefieldRef.current?.showReactionLabel(displayLabel, tone);
    if (result === "PARRY_PERFECT" || result === "PARRY_NORMAL" || result === "DODGE_SUCCESS") {
      battlefieldRef.current?.resetDefenseCooldowns();
    }
    if (result === "HIT_TAKEN" || (result === "REACTION_FAILED" && !recoveryCatches)) {
      battlefieldRef.current?.flashPlayer();
      playSfx(hpDamage > 0 ? "combat.laserImpact" : "combat.block", {
        volume: hpDamage > 0 ? 0.66 : 0.5,
        playbackRateVariance: 0.065,
      });
      if (hpDamage > 0) {
        battlefieldRef.current?.showFloatingText("player", `-${hpDamage}`, "bad");
      }
      showActorFeedback("player", hpDamage > 0 ? `-${hpDamage}` : "Blocked", hpDamage > 0 ? "damage" : "block");
    }
    if (result === "REACTION_FAILED" && recoveryCatches) {
      playSfx("status.buff", { volume: 0.44 });
      battlefieldRef.current?.showFloatingText("player", "Saved", "good");
      showActorFeedback("player", "Saved", "good");
    }
    if (result === "PARRY_PERFECT") {
      playSfx("status.perfection", { volume: 0.52, cooldownMs: 80 });
      playSfx("combat.metalBlock", { volume: 0.48, playbackRateVariance: 0.05 });
      battlefieldRef.current?.showFloatingText("player", "Perfect", "good");
      showActorFeedback("player", "Perfect", "perfect");
    }
    if (result === "PARRY_NORMAL") {
      playSfx("combat.metalBlock", { volume: 0.48, playbackRateVariance: 0.05 });
      battlefieldRef.current?.showReactionLabel("Parry", "good");
    }
    if (result === "DODGE_SUCCESS") {
      playSfx("combat.whoosh", { volume: 0.35, playbackRateVariance: 0.09 });
      battlefieldRef.current?.dodgePlayer();
    }
    if (riposteCounters) {
      playSfx("combat.swordClash", { volume: 0.62, playbackRateVariance: 0.06 });
      battlefieldRef.current?.flashEnemy();
      battlefieldRef.current?.showFloatingText("enemy", `-${riposteDamage}`, "damage");
      showActorFeedback("enemy", `-${riposteDamage}`, "damage");
    }
    dispatch({ type: "REACTION_RESULT", result, damage: hit.damage, hitLabel: hit.label });

    if (resolvedHitIdsRef.current.size >= currentAttackPattern.hits.length) {
      completeEnemyAttackSoon();
    }
  }, [
    completeEnemyAttackSoon,
    activeEnemy.statuses,
    currentAttackPattern.hits.length,
    state.player.mechanic,
    state.player.statuses,
  ]);

  const resolveReactionInput = useCallback(
    (input: "parry" | "dodge" | "miss") => {
      if (attackStartedAt === null) {
        return;
      }

      const elapsed = performance.now() - attackStartedAt;
      const timingModifiers = getReactionTimingModifiers(state);
      const nextHit = currentAttackPattern.hits
        .map((hit, index) => ({ hit, index, offset: Math.abs(elapsed - hit.atMs) }))
        .filter(({ index }) => !resolvedHitIdsRef.current.has(index))
        .sort((a, b) => a.offset - b.offset)[0];

      if (!nextHit) {
        return;
      }

      const markerPercent = Math.min(100, Math.max(0, (elapsed / getAttackDuration(currentAttackPattern)) * 100));

      if (currentAttackPattern.defense === "shield") {
        showTimingInputMarker(markerPercent, "miss");
        battlefieldRef.current?.showReactionLabel("Shield Only", "bad");
        return;
      }

      if (input === "miss") {
        showTimingInputMarker(markerPercent, "miss");
        handleReactionResult(nextHit.index, nextHit.hit, "REACTION_FAILED", "Miss");
        return;
      }

      if (input === "dodge") {
        const result =
          nextHit.offset <= currentAttackPattern.dodgeWindowMs + timingModifiers.dodgeWindowBonusMs
            ? "DODGE_SUCCESS"
            : "REACTION_FAILED";
        showTimingInputMarker(markerPercent, result === "DODGE_SUCCESS" ? "dodge" : "miss");
        handleReactionResult(nextHit.index, nextHit.hit, result, result === "DODGE_SUCCESS" ? "Dodge" : "Early");
        return;
      }

      if (nextHit.offset <= currentAttackPattern.perfectParryWindowMs + timingModifiers.parryWindowBonusMs / 2) {
        showTimingInputMarker(markerPercent, "perfect");
        handleReactionResult(nextHit.index, nextHit.hit, "PARRY_PERFECT", "Perfect");
        return;
      }

      if (nextHit.offset <= currentAttackPattern.normalParryWindowMs + timingModifiers.parryWindowBonusMs) {
        showTimingInputMarker(markerPercent, "parry");
        handleReactionResult(nextHit.index, nextHit.hit, "PARRY_NORMAL", "Parry");
        return;
      }

      showTimingInputMarker(markerPercent, "miss");
      handleReactionResult(nextHit.index, nextHit.hit, "REACTION_FAILED", elapsed < nextHit.hit.atMs ? "Early" : "Late");
    },
    [attackStartedAt, currentAttackPattern, handleReactionResult, showTimingInputMarker, state],
  );

  useEffect(() => {
    if (state.phase !== "enemyTurn") {
      return;
    }

    const timer = window.setTimeout(() => {
      dispatch({ type: "BEGIN_ENEMY_ATTACK" });
    }, TURN_BANNER_DURATION_MS);

    return () => window.clearTimeout(timer);
  }, [state.phase]);

  useEffect(() => {
    if (state.phase !== "enemyAttack") {
      resolvedHitIdsRef.current = new Set();
      setAttackStartedAt(null);
      return;
    }

    resolvedHitIdsRef.current = new Set();
    const startedAt = performance.now();
    setAttackStartedAt(startedAt);

    const hitTimers = currentAttackPattern.hits.map((hit, index) =>
      window.setTimeout(() => {
        if (resolvedHitIdsRef.current.has(index)) {
          return;
        }

        resolvedHitIdsRef.current.add(index);
        battlefieldRef.current?.showReactionLabel("Hit", "bad");
        battlefieldRef.current?.flashPlayer();
        playSfx("combat.laserImpact", { volume: 0.66, playbackRateVariance: 0.065 });
        const stanceDamageReceived =
          state.player.mechanic.type === "stance" ? stanceRules[state.player.mechanic.stance].damageReceived : 1;
        const baseDamage = Math.round(hit.damage * stanceDamageReceived);
        const hpDamage = Math.max(0, baseDamage - state.player.block);
        battlefieldRef.current?.showFloatingText("player", hpDamage > 0 ? `-${hpDamage}` : "Blocked", hpDamage > 0 ? "bad" : "block");
        showActorFeedback("player", hpDamage > 0 ? `-${hpDamage}` : "Blocked", hpDamage > 0 ? "damage" : "block");
        dispatch({ type: "REACTION_RESULT", result: "HIT_TAKEN", damage: hit.damage, hitLabel: hit.label });
      }, hit.atMs + currentAttackPattern.dodgeWindowMs),
    );
    const beamTimers = currentAttackPattern.hits.map((hit) =>
      window.setTimeout(() => {
        playSfx("combat.laserFire", { volume: 0.5, playbackRateVariance: 0.08, cooldownMs: 40 });
      }, hit.atMs),
    );

    const completionTimer = window.setTimeout(() => {
      dispatch({ type: "ENEMY_ATTACK_COMPLETE" });
    }, getAttackDuration(currentAttackPattern) + PLAYER_TURN_AFTER_ENEMY_PAUSE_MS);

    return () => {
      for (const timer of hitTimers) {
        window.clearTimeout(timer);
      }
      for (const timer of beamTimers) {
        window.clearTimeout(timer);
      }
      window.clearTimeout(completionTimer);
    };
  }, [currentAttackPattern, showActorFeedback, state.phase]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (state.phase !== "enemyAttack") {
        return;
      }

      if (key === "a") {
        resolveReactionInput("parry");
      }
      if (key === "s") {
        resolveReactionInput("dodge");
      }
      if (key === "d") {
        resolveReactionInput("miss");
      }
    };

    document.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => document.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [resolveReactionInput, state.phase]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        dispatch({ type: "SELECT_CARD", cardId: null });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const audio = new Audio(soundtrack.audioPath);
    audio.loop = true;
    audio.preload = "none";
    audio.volume = soundtrack.volume;
    soundtrackRef.current = audio;

    const handleError = () => setMusicPlayback("missing");
    audio.addEventListener("error", handleError);

    return () => {
      audio.pause();
      audio.removeEventListener("error", handleError);
      soundtrackRef.current = null;
    };
  }, []);

  const toggleMusic = useCallback(() => {
    const audio = soundtrackRef.current;

    if (!audio || musicPlayback === "missing") {
      return;
    }

    if (musicPlayback === "on") {
      audio.pause();
      setMusicPlayback("off");
      return;
    }

    setMusicPlayback("loading");
    audio
      .play()
      .then(() => setMusicPlayback("on"))
      .catch(() => setMusicPlayback("missing"));
  }, [musicPlayback]);

  if (route === "root") {
    return (
      <main className="app-shell">
        <MusicToggle
          expanded={musicMenuExpanded}
          playback={musicPlayback}
          onToggle={toggleMusic}
          onToggleExpanded={() => setMusicMenuExpanded((expanded) => !expanded)}
        />
        <CharacterSelectScreen
          selectedCharacterId={selectedCharacterId}
          selectedEnemyIds={selectedEnemyIds}
          selectedBackgroundId={selectedBackgroundId}
          onSelect={setSelectedCharacterId}
          onSelectEnemies={setSelectedEnemyIds}
          onSelectBackground={setSelectedBackgroundId}
          onStart={() => startCombat(selectedCharacterId, selectedEnemyIds)}
        />
      </main>
    );
  }

  return (
    <main className="app-shell">
      <section className="combat-root" aria-label="Combat prototype">
        <MusicToggle
          expanded={musicMenuExpanded}
          playback={musicPlayback}
          onToggle={toggleMusic}
          onToggleExpanded={() => setMusicMenuExpanded((expanded) => !expanded)}
        />
        <PhaserBattlefield
          ref={battlefieldRef}
          phase={state.phase}
          attackId={activeEnemy.attackId}
          backgroundPath={`${import.meta.env.BASE_URL}${selectedBackground.image}`}
          playerSpritePath={`${import.meta.env.BASE_URL}${characterDefinitions[state.player.characterId].image}`}
          enemies={state.enemies}
          activeEnemyId={state.activeEnemyId}
          onEnemyBoundsChange={setEnemyRect}
          onEnemyBoundsListChange={setEnemyRects}
          onPlayerBoundsChange={setPlayerRect}
        />

        {(state.phase === "playerTurn" || state.phase === "enemyTurn") && (
          <TurnBanner key={state.phase} label={turnBannerLabel} />
        )}

        {state.enemies.map((enemy) => (
          <EnemyBattlefieldHud
            key={enemy.id}
            bounds={enemyRects[enemy.id] ?? null}
            enemy={enemy}
            active={enemy.id === state.activeEnemyId}
          />
        ))}

        <TargetingOverlay
          activeCardRect={selectedCardRect}
          pointer={isAimingEnemyCard ? targetPointer : null}
          isAnimating={Boolean(animatingCardId)}
          target={isAimingEnemyCard ? "enemy" : null}
          isTargetHovered={isTargetHovered}
        />

        {isAimingPlayerCard && selectedCard && targetPointer && (
          <FloatingTargetCard card={selectedCard} mechanic={state.player.mechanic} pointer={targetPointer} />
        )}

        {isAimingEnemyCard && selectedCard && state.enemies.map((enemy) => {
          const bounds = enemyRects[enemy.id];
          if (!bounds || enemy.hp <= 0) {
            return null;
          }

          const isHovered = hoveredEnemyId === enemy.id;
          return (
            <button
              className={`enemy-target-button ${isHovered ? "is-armed" : ""}`}
              key={enemy.id}
              type="button"
              style={{
                left: bounds.left,
                top: bounds.top,
                width: bounds.width,
                height: bounds.height,
              }}
              aria-label={`Play ${selectedDefinition?.name ?? "card"} on ${enemy.name}`}
              onPointerEnter={() => setHoveredEnemyId(enemy.id)}
              onPointerLeave={() => setHoveredEnemyId(null)}
              onClick={() => playSelectedCardOnEnemy(enemy.id)}
            />
          );
        })}

        {isAimingPlayerCard && targetBounds && (
          <button
            className={`enemy-target-button ${isTargetHovered ? "is-armed" : ""}`}
            type="button"
            style={{
              left: targetBounds.left,
              top: targetBounds.top,
              width: targetBounds.width,
              height: targetBounds.height,
            }}
            aria-label={`Play ${selectedDefinition?.name ?? "card"} on ${targetLabel}`}
            onPointerEnter={() => {
              setIsPlayerTargetHovered(true);
            }}
            onPointerLeave={() => {
              setIsPlayerTargetHovered(false);
            }}
            onClick={playSelectedCard}
          />
        )}

        {isAimingTargetedCard && targetBounds && (isTargetHovered || targetCornersExiting) && (
          <div
            className={`enemy-target-corners ${targetCornersExiting ? "is-exiting" : ""}`}
            style={{
              left: targetBounds.left,
              top: targetBounds.top,
              width: targetBounds.width,
              height: targetBounds.height,
            }}
            aria-hidden="true"
          />
        )}

        <ActorFeedbackOverlay target="enemy" bounds={enemyRect} feedback={enemyFeedback} />
        <EnemyAttackOverlay
          enemyBounds={enemyRect}
          playerBounds={playerRect}
          active={state.phase === "enemyAttack"}
          attackStartedAt={attackStartedAt}
          pattern={currentAttackPattern}
        />
        <ActorFeedbackOverlay target="player" bounds={playerRect} feedback={playerFeedback} />

        <div className="top-hud">
          <Meter
            label="HP"
            value={state.player.hp}
            max={state.player.maxHp}
            block={state.player.block}
            statuses={state.player.statuses}
            tone="red"
          />
          <CharacterMechanicHud mechanic={state.player.mechanic} />
        </div>
        <RelicHud relics={state.player.relics} />

        <div className="left-rail">
          <DebugPanel
            collapsed={debugCollapsed}
            currentAttack={currentAttackPattern}
            disabled={state.phase !== "playerTurn"}
            attackStartedAt={attackStartedAt}
            inputMarker={timingInputMarker}
            log={state.log}
            lastEnemyPhaseSummary={state.lastEnemyPhaseSummary}
            showTimingAssist={showTimingAssist}
            onReset={() => {
              dispatch({ type: "RESET_COMBAT", characterId: state.player.characterId, enemyIds: selectedEnemyIds });
            }}
            onSetAttack={(attackId) => dispatch({ type: "SET_NEXT_ATTACK", attackId })}
            onToggleCollapsed={() => setDebugCollapsed((value) => !value)}
            onToggleTiming={() => setShowTimingAssist((value) => !value)}
          />
        </div>

        <div className="bottom-ui">
          <div className="energy-readout">
            <span>Energy</span>
            <strong>{state.player.energy}</strong>
          </div>

          <div className="pile-readout" aria-label="Card piles">
            <span>Draw</span>
            <strong>{state.drawPile.length}</strong>
            <span>Discard</span>
            <strong>{state.discard.length}</strong>
          </div>

          <div className="hand" aria-label="Card hand">
            {state.hand.map((card) => (
              <CombatCardView
                key={card.instanceId}
                card={card}
                mechanic={state.player.mechanic}
                selected={state.selectedCardId === card.instanceId}
                enemyIsVulnerablePreview={state.selectedCardId === card.instanceId && hoveredEnemyIsVulnerable}
                disabled={
                  state.phase !== "playerTurn" ||
                  state.player.energy < cardDefinitions[card.definitionId].cost ||
                  Boolean(getCardPlayBlockReason(cardDefinitions[card.definitionId], state.player.mechanic))
                }
                onBoundsChange={(rect) => setCardRects((rects) => ({ ...rects, [card.instanceId]: rect }))}
                onPlay={() => handleCardClick(card)}
              />
            ))}
          </div>

          <button
            className="end-turn-button"
            type="button"
            disabled={state.phase !== "playerTurn"}
            onClick={() => {
              playSfx("ui.confirm", { volume: 0.4 });
              dispatch({ type: "END_TURN" });
            }}
          >
            End Turn
          </button>
        </div>

        {(state.phase === "won" || state.phase === "lost") && (
          <div className="result-panel">
            <strong>{state.phase === "won" ? "Victory" : "Defeat"}</strong>
            <button
              type="button"
              onClick={() => dispatch({ type: "RESET_COMBAT", characterId: state.player.characterId, enemyIds: selectedEnemyIds })}
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => {
                setRoute("root");
                writeUrlSelection(
                  {
                    characterId: selectedCharacterId,
                    backgroundId: selectedBackgroundId,
                    enemyIds: selectedEnemyIds,
                  },
                  "root",
                  "push",
                );
              }}
            >
              Change Character
            </button>
          </div>
        )}
      </section>
    </main>
  );
}

function MusicToggle({
  expanded,
  playback,
  onToggle,
  onToggleExpanded,
}: {
  expanded: boolean;
  playback: MusicPlaybackState;
  onToggle: () => void;
  onToggleExpanded: () => void;
}) {
  const disabled = playback === "loading" || playback === "missing";
  const label =
    playback === "on"
      ? "Music On"
      : playback === "loading"
        ? "Loading"
        : playback === "missing"
          ? "Music Missing"
          : "Music Off";
  const menuLabel = expanded ? "Collapse music menu" : `Expand music menu (${label})`;
  const statusGlyph = playback === "on" ? "||" : playback === "loading" ? "..." : ">";

  return (
    <div className={`music-control ${expanded ? "is-expanded" : ""}`} aria-label="Soundtrack">
      <button
        className={`music-menu-button music-menu-button-${playback}`}
        type="button"
        aria-expanded={expanded}
        aria-label={menuLabel}
        onClick={onToggleExpanded}
        title={expanded ? "Collapse music menu" : `${soundtrack.title} by ${soundtrack.artist}`}
      >
        <span className="music-menu-note" aria-hidden="true">♪</span>
        <span className="music-menu-status" aria-hidden="true">{statusGlyph}</span>
      </button>
      {expanded && (
        <>
          <button
            className={`music-toggle music-toggle-${playback}`}
            type="button"
            disabled={disabled}
            onClick={onToggle}
            title={`${soundtrack.title} by ${soundtrack.artist}`}
          >
            <span className="music-toggle-icon" aria-hidden="true">
              {playback === "on" ? "||" : ">"}
            </span>
            <span>{label}</span>
          </button>
          <a href={soundtrack.sourceUrl} target="_blank" rel="noreferrer">
            {soundtrack.title} by {soundtrack.artist}
          </a>
        </>
      )}
    </div>
  );
}

function CharacterSelectScreen({
  selectedCharacterId,
  selectedEnemyIds,
  selectedBackgroundId,
  onSelect,
  onSelectEnemies,
  onSelectBackground,
  onStart,
}: {
  selectedCharacterId: CharacterId;
  selectedEnemyIds: EnemyDefinitionId[];
  selectedBackgroundId: string;
  onSelect: (characterId: CharacterId) => void;
  onSelectEnemies: (enemyIds: EnemyDefinitionId[]) => void;
  onSelectBackground: (backgroundId: string) => void;
  onStart: () => void;
}) {
  const normalizedEnemyIds = normalizeEnemySelection(selectedEnemyIds);
  const enemySelectionFull = normalizedEnemyIds.length >= maxScenarioEnemies;
  const selectedBackgroundIndex = Math.max(
    0,
    backgroundOptions.findIndex((background) => background.id === selectedBackgroundId),
  );
  const selectedBackground = backgroundOptions[selectedBackgroundIndex] ?? backgroundOptions[0];
  const enemyCounts = normalizedEnemyIds.reduce<Record<string, number>>((counts, enemyId) => {
    counts[enemyId] = (counts[enemyId] ?? 0) + 1;
    return counts;
  }, {});
  const selectRelativeBackground = (offset: number) => {
    const nextIndex = (selectedBackgroundIndex + offset + backgroundOptions.length) % backgroundOptions.length;
    onSelectBackground(backgroundOptions[nextIndex].id);
  };
  const addEnemy = (enemyId: EnemyDefinitionId) => {
    if (enemySelectionFull) {
      return;
    }

    onSelectEnemies([...normalizedEnemyIds, enemyId]);
  };
  const removeEnemyAt = (indexToRemove: number) => {
    const nextEnemyIds = normalizedEnemyIds.filter((_, index) => index !== indexToRemove);
    onSelectEnemies(normalizeEnemySelection(nextEnemyIds));
  };

  return (
    <section className="character-select" aria-label="Choose character">
      <div className="character-select-header">
        <span>Build Scenario</span>
        <button type="button" onClick={onStart}>
          Start
        </button>
      </div>

      <div className="character-options">
        {characterOrder.map((characterId) => {
          const character = characterDefinitions[characterId];
          const selected = selectedCharacterId === characterId;
          const mechanicLabel =
            character.mechanics.type === "perfection"
              ? `Perfection ${character.mechanics.maxPerfection}`
              : `${stanceRules[character.mechanics.startingStance].label} Stance`;

          return (
            <button
              className={`character-option ${selected ? "is-selected" : ""}`}
              key={character.id}
              type="button"
              onClick={() => onSelect(character.id)}
            >
              <span className="character-portrait">
                <img src={`${import.meta.env.BASE_URL}${character.image}`} alt="" />
              </span>
              <span className="character-option-copy">
                <strong>{character.name}</strong>
                <span>{character.description}</span>
                <span>
                  {character.maxHp} HP | {character.maxEnergy} Energy | {mechanicLabel}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <section className="enemy-selection" aria-label="Choose enemies">
        <div className="enemy-selection-header">
          <span>Enemies</span>
          <strong>{normalizedEnemyIds.length}/{maxScenarioEnemies}</strong>
        </div>

        <div className="enemy-options">
          {enemyOrder.map((enemyId) => {
            const enemy = enemyDefinitions[enemyId];
            const count = enemyCounts[enemyId] ?? 0;

            return (
              <button
                className={`enemy-option ${count > 0 ? "is-selected" : ""}`}
                key={enemy.id}
                type="button"
                disabled={enemySelectionFull}
                onClick={() => addEnemy(enemy.id)}
              >
                <span className="enemy-option-count" aria-label={`${count} selected`}>
                  {count}
                </span>
                <span className="enemy-option-copy">
                  <strong>{enemy.name}</strong>
                  <span>{enemy.maxHp} HP | {attackPatterns[enemy.attackId].name}</span>
                  <span>{enemy.description}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="selected-enemy-list" aria-label="Selected enemies">
          {normalizedEnemyIds.map((enemyId, index) => {
            const enemy = enemyDefinitions[enemyId];

            return (
              <button
                className="selected-enemy"
                key={`${enemyId}-${index}`}
                type="button"
                disabled={normalizedEnemyIds.length <= 1}
                onClick={() => removeEnemyAt(index)}
                aria-label={`Remove ${enemy.name}`}
              >
                <span>{index + 1}</span>
                <strong>{enemy.name}</strong>
              </button>
            );
          })}
        </div>
      </section>

      <section className="background-gallery" aria-label="Choose scene">
        <div className="background-gallery-header">
          <span>Scene</span>
          <strong>{selectedBackground.name}</strong>
        </div>

        <div className="background-gallery-stage">
          <button
            className="background-gallery-arrow"
            type="button"
            aria-label="Previous background"
            onClick={() => selectRelativeBackground(-1)}
          >
            &lsaquo;
          </button>

          <div className="background-preview">
            <img src={`${import.meta.env.BASE_URL}${selectedBackground.image}`} alt="" />
          </div>

          <button
            className="background-gallery-arrow"
            type="button"
            aria-label="Next background"
            onClick={() => selectRelativeBackground(1)}
          >
            &rsaquo;
          </button>
        </div>

        <div className="background-options" aria-label="Background options">
          {backgroundOptions.map((background) => {
            const selected = selectedBackgroundId === background.id;

            return (
              <button
                className={`background-option ${selected ? "is-selected" : ""}`}
                key={background.id}
                type="button"
                aria-pressed={selected}
                onClick={() => onSelectBackground(background.id)}
              >
                <img src={`${import.meta.env.BASE_URL}${background.image}`} alt="" />
                <span>{background.name}</span>
              </button>
            );
          })}
        </div>
      </section>
    </section>
  );
}

function CharacterMechanicHud({ mechanic }: { mechanic: CharacterMechanicState }) {
  if (mechanic.type === "perfection") {
    const rank = getPerfectionRank(mechanic);
    const bonusPercent = Math.round((perfectionRankRules[rank].damageDealt - 1) * 100);

    return (
      <div className="perfection-meter" aria-label="Perfection">
        <div className="meter-label">
          <span>Perfection</span>
          <strong>
            {rank} {bonusPercent > 0 ? `+${bonusPercent}%` : "No bonus"}
          </strong>
        </div>
        <div className="meter-track">
          <div className="meter-fill" style={{ width: `${(mechanic.perfection / mechanic.maxPerfection) * 100}%` }} />
        </div>
        <p>
          {mechanic.perfection}/{mechanic.maxPerfection}
        </p>
      </div>
    );
  }

  const stance = stanceRules[mechanic.stance];

  return (
    <div className="stance-meter" style={{ "--stance-color": stance.color } as CSSProperties} aria-label="Stance">
      <div className="meter-label">
        <span>Stance</span>
        <strong>{stance.label}</strong>
      </div>
      <p>{stance.helperText}</p>
    </div>
  );
}

function EnemyBattlefieldHud({
  enemy,
  bounds,
  active,
}: {
  enemy: EnemyCombatant;
  bounds: DOMRect | null;
  active: boolean;
}) {
  if (!bounds || enemy.hp <= 0) {
    return null;
  }

  const ratio = Math.max(0, Math.min(1, enemy.hp / enemy.maxHp));
  const activeStatuses = getActiveStatusEntries(enemy.statuses);

  return (
    <div
      className={`enemy-battlefield-hud ${active ? "is-active" : ""}`}
      style={{
        left: bounds.left + bounds.width / 2,
        top: bounds.top + bounds.height - 78,
      }}
      aria-label={`${enemy.name} HP ${enemy.hp} of ${enemy.maxHp}`}
    >
      <span className="enemy-battlefield-hud-name">{enemy.name}</span>
      <div className="enemy-battlefield-hud-track">
        <span className="enemy-battlefield-hud-value">{enemy.hp}/{enemy.maxHp}</span>
        <div className="enemy-battlefield-hud-fill" style={{ width: `${ratio * 100}%` }} />
      </div>
      {activeStatuses.length > 0 && (
        <StatusChips className="enemy-battlefield-status-row" label={`${enemy.name} statuses`} statuses={activeStatuses} />
      )}
    </div>
  );
}

function RelicHud({ relics }: { relics: PlayerRelic[] }) {
  if (relics.length === 0) {
    return null;
  }

  return (
    <div className="relic-hud" aria-label="Relics">
      {relics.map((relic) => {
        const definition = relicDefinitions[relic.id];
        const progressMax = relic.id === "steady-pulse" ? 3 : 0;

        return (
          <button
            className={`relic-chip relic-chip-${definition.rarity}`}
            key={relic.id}
            type="button"
            aria-label={`${definition.name}. ${definition.description}`}
          >
            <span className="relic-icon-shell" key={`${relic.id}-${relic.pulse}`}>
              <span className="relic-icon">{definition.icon}</span>
            </span>
            {progressMax > 0 && <span className="relic-progress">{relic.progress}/{progressMax}</span>}
            <span className="relic-tooltip" role="tooltip">
              <span className="relic-tooltip-title">{definition.name}</span>
              <span className={`relic-tooltip-rarity relic-tooltip-rarity-${definition.rarity}`}>{definition.rarity} relic</span>
              <span className="relic-tooltip-copy">{definition.description}</span>
              {progressMax > 0 && (
                <span className="relic-tooltip-progress">
                  Progress: {relic.progress}/{progressMax}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function TurnBanner({ label }: { label: string }) {
  return (
    <div className="turn-banner" aria-live="polite" aria-label={label}>
      <span>{label}</span>
    </div>
  );
}

function EnemyPhaseSummaryPanel({ summary }: { summary: EnemyPhaseSummary | null }) {
  if (!summary) {
    return null;
  }

  const defenses: string[] = [];
  if (summary.blockPrevented > 0) {
    defenses.push(`Block prevented ${summary.blockPrevented}`);
  }
  if (summary.recoverySaves > 0) {
    defenses.push(`Recovery saved ${summary.recoverySaves}`);
  }
  if (summary.riposteDamage > 0) {
    defenses.push(`Counter dealt ${summary.riposteDamage}`);
  }

  return (
    <aside className="summary-panel" aria-label="Enemy phase summary">
      <span>Last Enemy Phase</span>
      <div className="summary-panel-scroll">
        <strong>{summary.attackName}</strong>
        <p>
          {summary.parries} {summary.parries === 1 ? "parry" : "parries"}, {summary.dodges} dodge
          {summary.dodges === 1 ? "" : "s"}, {summary.hitsTaken} hit{summary.hitsTaken === 1 ? "" : "s"},{" "}
          {summary.failedReactions} mistake{summary.failedReactions === 1 ? "" : "s"}
        </p>
        <p>{summary.damageTaken} damage taken</p>
        {defenses.length > 0 && <p>{defenses.join(" | ")}</p>}
      </div>
    </aside>
  );
}

function EnemyAttackOverlay({
  enemyBounds,
  playerBounds,
  active,
  attackStartedAt,
  pattern,
}: {
  enemyBounds: DOMRect | null;
  playerBounds: DOMRect | null;
  active: boolean;
  attackStartedAt: number | null;
  pattern: AttackPattern;
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!active || attackStartedAt === null) {
      setElapsed(0);
      return;
    }

    let frame = 0;
    const tick = () => {
      setElapsed(performance.now() - attackStartedAt);
      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [active, attackStartedAt]);

  if (!enemyBounds || !playerBounds || !active) {
    return null;
  }

  const beamDurationMs = 360;
  const activeHitIndex = pattern.hits.findIndex((hit) => elapsed >= hit.atMs && elapsed <= hit.atMs + beamDurationMs);
  const activeHit = activeHitIndex >= 0 ? pattern.hits[activeHitIndex] : null;
  const nextHitIndex = pattern.hits.findIndex((hit) => elapsed < hit.atMs);
  const nextHit = nextHitIndex >= 0 ? pattern.hits[nextHitIndex] : null;
  const previousHit = nextHitIndex > 0 ? pattern.hits[nextHitIndex - 1] : null;
  const chargeStartMs = previousHit ? previousHit.atMs + beamDurationMs : 0;
  const chargeEndMs = nextHit?.atMs ?? pattern.hits[pattern.hits.length - 1].atMs;
  const chargeDurationMs = Math.max(1, chargeEndMs - chargeStartMs);
  const chargeProgress = nextHit ? Math.max(0, Math.min(1, (elapsed - chargeStartMs) / chargeDurationMs)) : 0;
  const msUntilNextHit = nextHit ? nextHit.atMs - elapsed : Number.POSITIVE_INFINITY;
  const chargePhase = activeHit ? "release" : msUntilNextHit <= 420 ? "shake" : "charge";
  const enemyCenterX = enemyBounds.left + enemyBounds.width * 0.5;
  const enemyCenterY = enemyBounds.top + enemyBounds.height * 0.36;
  const isOrbitalLaser = pattern.id === "orbital-laser";
  const singleStartX = enemyBounds.left + enemyBounds.width * 0.28;
  const singleStartY = enemyBounds.top + enemyBounds.height * 0.3;
  const orbitalRadius = Math.max(146, Math.min(210, Math.min(enemyBounds.width, enemyBounds.height) * 0.78));
  const orbitalOrbSize = 58;
  const orbitalOrbs = pattern.hits.map((hit, index) => {
    const turn = (index / pattern.hits.length) * Math.PI * 2 - Math.PI / 2;
    const lastHit = pattern.hits[index - 1];
    const orbChargeStart = lastHit ? lastHit.atMs + beamDurationMs : 0;
    const orbChargeDuration = Math.max(1, hit.atMs - orbChargeStart);
    const isActive = activeHitIndex === index;
    const isNext = nextHitIndex === index;
    const isSpent = elapsed > hit.atMs + beamDurationMs;
    const orbProgress = isActive ? 1 : isNext ? Math.max(0, Math.min(1, (elapsed - orbChargeStart) / orbChargeDuration)) : 0;
    const phase = isActive ? "release" : isNext && hit.atMs - elapsed <= 420 ? "shake" : "charge";

    return {
      hit,
      index,
      isSpent,
      phase,
      progress: orbProgress,
      x: enemyCenterX + Math.cos(turn) * orbitalRadius,
      y: enemyCenterY + Math.sin(turn) * orbitalRadius,
    };
  });
  const activeOrb = activeHitIndex >= 0 ? orbitalOrbs[activeHitIndex] : null;
  const startX = activeOrb?.x ?? singleStartX;
  const startY = activeOrb?.y ?? singleStartY;
  const endX = playerBounds.left + playerBounds.width * 0.66;
  const endY = playerBounds.top + playerBounds.height * 0.48;
  const midX = (startX + endX) / 2;
  const midY = (startY + endY) / 2;
  const length = Math.hypot(endX - startX, endY - startY);
  const angle = Math.atan2(endY - startY, endX - startX) * (180 / Math.PI);
  const orbSize = 96;
  const impactSize = Math.min(playerBounds.width, playerBounds.height) * 0.72;
  const beamKey = activeHit ? `${pattern.id}-${activeHitIndex}-${activeHit.atMs}` : "charging";

  return (
    <>
      {isOrbitalLaser ? (
        orbitalOrbs.map((orb) => (
          <div
            className={`enemy-attack-origin enemy-attack-origin-orbital is-${orb.phase} ${
              orb.isSpent ? "is-spent" : ""
            }`}
            key={`${pattern.id}-orb-${orb.index}`}
            style={{
              left: orb.x - orbitalOrbSize / 2,
              top: orb.y - orbitalOrbSize / 2,
              width: orbitalOrbSize,
              height: orbitalOrbSize,
              "--charge-progress": orb.progress,
              "--orb-index": orb.index,
            } as CSSProperties}
            aria-hidden="true"
          />
        ))
      ) : (
        <div
          className={`enemy-attack-origin is-${chargePhase}`}
          style={{
            left: startX - orbSize / 2,
            top: startY - orbSize / 2,
            width: orbSize,
            height: orbSize,
            "--charge-progress": chargeProgress,
          } as CSSProperties}
          aria-hidden="true"
        />
      )}
      {activeHit && (
        <>
          <div
            key={`beam-${beamKey}`}
            className="enemy-attack-vector"
            style={{
              left: midX,
              top: midY,
              width: length,
              transform: `translate(-50%, -50%) rotate(${angle}deg)`,
            }}
            aria-hidden="true"
          >
            <div className="enemy-attack-beam" />
          </div>
          <div
            key={`impact-${beamKey}`}
            className="enemy-attack-impact"
            style={{
              left: endX - impactSize / 2,
              top: endY - impactSize / 2,
              width: impactSize,
              height: impactSize,
            }}
            aria-hidden="true"
          />
        </>
      )}
    </>
  );
}

function ActorFeedbackOverlay({
  target,
  bounds,
  feedback,
}: {
  target: "player" | "enemy";
  bounds: DOMRect | null;
  feedback: ActorFeedback | null;
}) {
  if (!bounds || !feedback) {
    return null;
  }

  return (
    <div
      key={feedback.id}
      className={`actor-feedback actor-feedback-${target} actor-feedback-${feedback.tone}`}
      style={{
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
        height: bounds.height,
      }}
      aria-hidden="true"
    >
      <div className="actor-feedback-wash" />
      {feedback.tone === "damage" && (
        <>
          <div className="actor-feedback-slash actor-feedback-slash-main" />
          <div className="actor-feedback-slash actor-feedback-slash-secondary" />
          <div className="actor-feedback-spark" />
        </>
      )}
      {feedback.tone === "block" && (
        <div className="actor-feedback-shield">
          <div className="actor-feedback-shield-core" />
          <div className="actor-feedback-shield-rim" />
          <div className="actor-feedback-shield-shine" />
        </div>
      )}
      <span>{feedback.text}</span>
    </div>
  );
}

function DebugPanel({
  collapsed,
  currentAttack,
  disabled,
  attackStartedAt,
  inputMarker,
  log,
  lastEnemyPhaseSummary,
  showTimingAssist,
  onReset,
  onSetAttack,
  onToggleCollapsed,
  onToggleTiming,
}: {
  collapsed: boolean;
  currentAttack: AttackPattern;
  disabled: boolean;
  attackStartedAt: number | null;
  inputMarker: TimingInputMarker | null;
  log: string[];
  lastEnemyPhaseSummary: EnemyPhaseSummary | null;
  showTimingAssist: boolean;
  onReset: () => void;
  onSetAttack: (attackId: AttackId) => void;
  onToggleCollapsed: () => void;
  onToggleTiming: () => void;
}) {
  return (
    <aside className={`debug-panel ${collapsed ? "is-collapsed" : ""}`} aria-label="Debug controls">
      <div className="debug-panel-header">
        <span>Debug</span>
        <div className="debug-header-actions">
          <button type="button" onClick={onToggleCollapsed}>
            {collapsed ? "Show" : "Hide"}
          </button>
          <button type="button" onClick={onReset}>
            Reset
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          <div className="debug-attack-buttons" aria-label="Force next attack">
            {attackOrder.map((attackId) => (
              <button
                className={currentAttack.id === attackId ? "is-active" : ""}
                disabled={disabled}
                key={attackId}
                type="button"
                onClick={() => onSetAttack(attackId)}
              >
                {attackPatterns[attackId].name}
              </button>
            ))}
          </div>

          <label className="timing-toggle">
            <input checked={showTimingAssist} type="checkbox" onChange={onToggleTiming} />
            Timing assist
          </label>

          {showTimingAssist && (
            <div className="debug-timing-meter">
              <ReactionTimingBar attackStartedAt={attackStartedAt} inputMarker={inputMarker} pattern={currentAttack} />
            </div>
          )}

          <dl className="attack-stats">
            <div>
              <dt>Hits</dt>
              <dd>{currentAttack.hits.length}</dd>
            </div>
            <div>
              <dt>Damage</dt>
              <dd>{currentAttack.hits.map((hit) => hit.damage).join(" / ")}</dd>
            </div>
            <div>
              <dt>Parry</dt>
              <dd>{currentAttack.defense === "shield" ? "No" : `${currentAttack.normalParryWindowMs}ms`}</dd>
            </div>
            <div>
              <dt>Dodge</dt>
              <dd>{currentAttack.defense === "shield" ? "No" : `${currentAttack.dodgeWindowMs}ms`}</dd>
            </div>
          </dl>

          <EnemyPhaseSummaryPanel summary={lastEnemyPhaseSummary} />

          <aside className="log-panel" aria-label="Combat log">
            <div className="log-panel-scroll">
              {log.map((entry, index) => (
                <p key={`${entry}-${index}`}>{entry}</p>
              ))}
            </div>
          </aside>
        </>
      )}
    </aside>
  );
}

function ReactionTimingBar({
  attackStartedAt,
  inputMarker,
  pattern,
}: {
  attackStartedAt: number | null;
  inputMarker: TimingInputMarker | null;
  pattern: AttackPattern;
}) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (attackStartedAt === null) {
      setProgress(0);
      return;
    }

    let animationFrame = 0;
    const total = getAttackDuration(pattern);

    const update = () => {
      setProgress(Math.min(1, (performance.now() - attackStartedAt) / total));
      animationFrame = window.requestAnimationFrame(update);
    };

    animationFrame = window.requestAnimationFrame(update);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [attackStartedAt, pattern]);

  const totalMs = getAttackDuration(pattern);
  const perfectWidth = (pattern.perfectParryWindowMs * 2 / totalMs) * 100;
  const normalWidth = (pattern.normalParryWindowMs * 2 / totalMs) * 100;

  return (
    <div className="reaction-timing" aria-label="Reaction timing">
      {pattern.hits.map((hit) => {
        const impactPercent = (hit.atMs / totalMs) * 100;
        return (
          <span key={`${pattern.id}-${hit.label}`}>
            <span className="normal-window" style={{ left: `${impactPercent}%`, width: `${normalWidth}%` }} />
            <span className="perfect-window" style={{ left: `${impactPercent}%`, width: `${perfectWidth}%` }} />
            <span className="impact-marker" style={{ left: `${impactPercent}%` }} />
          </span>
        );
      })}
      {inputMarker && (
        <span
          key={inputMarker.id}
          className={`input-marker input-marker-${inputMarker.tone}`}
          style={{ left: `${inputMarker.percent}%` }}
        />
      )}
      <span className="timing-sweep" style={{ width: `${progress * 100}%` }} />
    </div>
  );
}

function Meter({
  label,
  value,
  max,
  block,
  statuses,
  tone,
}: {
  label: string;
  value: number;
  max: number;
  block?: number;
  statuses?: StatusCollection;
  tone: "red" | "gold" | "violet";
}) {
  const activeStatuses = getActiveStatusEntries(statuses);

  return (
    <div className={`meter meter-${tone}`}>
      <div className="meter-label">
        <span className="meter-vitals">
          <strong>
            {value}/{max}
          </strong>
          {block !== undefined && (
            <span className="block-readout" aria-label={`${block} block`}>
              <span className="block-shield" aria-hidden="true" />
              <span>{block}</span>
            </span>
          )}
        </span>
        <span>{label}</span>
      </div>
      <div className="meter-track">
        <div className="meter-fill" style={{ width: `${(value / max) * 100}%` }} />
      </div>
      {activeStatuses.length > 0 && (
        <StatusChips label={`${label} statuses`} statuses={activeStatuses} />
      )}
    </div>
  );
}

const getActiveStatusEntries = (statuses?: StatusCollection) =>
  statuses
    ? Object.values(statuses).filter((status): status is NonNullable<typeof status> => Boolean(status) && status.stacks > 0)
    : [];

function StatusChips({
  className,
  label,
  statuses,
}: {
  className?: string;
  label: string;
  statuses: ReturnType<typeof getActiveStatusEntries>;
}) {
  return (
    <div className={`status-row ${className ?? ""}`} aria-label={label}>
      {statuses.map((status) => {
        const definition = statusDisplayDefinitions[status.id];
        const title = `${definition.label}: ${definition.description}`;

        return (
          <span
            className={`status-chip status-chip-${definition.tone}`}
            key={status.id}
            aria-label={`${title} ${status.stacks} stack${status.stacks === 1 ? "" : "s"}`}
            tabIndex={0}
          >
            <span>{definition.shortLabel}</span>
            {status.stacks > 1 && <strong>{status.stacks}</strong>}
            <span className="card-keyword-tooltip status-tooltip" role="tooltip">
              <span className="card-keyword-tooltip-row">
                <strong>{definition.label}</strong>
                <span>{definition.description}</span>
              </span>
            </span>
          </span>
        );
      })}
    </div>
  );
}

function CombatCardView({
  card,
  mechanic,
  selected,
  enemyIsVulnerablePreview,
  disabled,
  onBoundsChange,
  onPlay,
}: {
  card: CombatCard;
  mechanic: CharacterMechanicState;
  selected: boolean;
  enemyIsVulnerablePreview: boolean;
  disabled: boolean;
  onBoundsChange: (rect: DOMRect) => void;
  onPlay: () => void;
}) {
  const definition = cardDefinitions[card.definitionId];
  const ref = useRef<HTMLButtonElement | null>(null);

  const updateBounds = useCallback(() => {
    if (ref.current) {
      onBoundsChange(ref.current.getBoundingClientRect());
    }
  }, [onBoundsChange]);

  return (
    <button
      ref={ref}
      className={`combat-card combat-card-${definition.pool} ${selected ? "is-selected" : ""}`}
      type="button"
      disabled={disabled}
      onMouseEnter={updateBounds}
      onFocus={updateBounds}
      onClick={() => {
        updateBounds();
        onPlay();
      }}
    >
      <CombatCardFace definition={definition} mechanic={mechanic} enemyIsVulnerablePreview={enemyIsVulnerablePreview} />
    </button>
  );
}

function FloatingTargetCard({
  card,
  mechanic,
  pointer,
}: {
  card: CombatCard;
  mechanic: CharacterMechanicState;
  pointer: PointerPoint;
}) {
  const definition = cardDefinitions[card.definitionId];

  return (
    <div
      className={`combat-card combat-card-${definition.pool} drag-card-preview`}
      style={{
        left: pointer.x,
        top: pointer.y,
      }}
      aria-hidden="true"
    >
      <CombatCardFace definition={definition} mechanic={mechanic} enemyIsVulnerablePreview={false} />
    </div>
  );
}

function CombatCardFace({
  definition,
  mechanic,
  enemyIsVulnerablePreview,
}: {
  definition: CardDefinition;
  mechanic: CharacterMechanicState;
  enemyIsVulnerablePreview: boolean;
}) {
  const keywords = getCardRuleKeywords(definition.rulesText);

  return (
    <>
      <span className="card-cost">{definition.cost}</span>
      <span className={`card-title ${definition.name.length > 10 ? "card-title-long" : ""}`} title={definition.name}>
        {definition.name}
      </span>
      <span className={`card-art card-art-${definition.id}`} aria-hidden="true">
        <span className="card-art-vignette" />
        <span className="card-art-mark card-art-mark-primary" />
        <span className="card-art-mark card-art-mark-secondary" />
        <span className="card-art-spark" />
      </span>
      <span className="card-kind">{definition.kind}</span>
      <span className="card-rules">
        <span className="card-rules-copy">{renderCardRulesText(definition, mechanic, enemyIsVulnerablePreview)}</span>
      </span>
      {keywords.length > 0 && (
        <span className="card-keyword-tooltip" role="tooltip">
          {keywords.map((keyword) => (
            <span className="card-keyword-tooltip-row" key={keyword.label}>
              <strong>{keyword.label}</strong>
              <span>{keyword.description}</span>
            </span>
          ))}
        </span>
      )}
    </>
  );
}
