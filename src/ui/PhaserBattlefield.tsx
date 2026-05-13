import Phaser from "phaser";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { AttackHit, AttackId } from "../game/combat/attackPatterns";
import type { CombatPhase, EnemyCombatant, ReactionResult } from "../game/combat/types";
import { BattleScene } from "../phaser/BattleScene";

export type PhaserBattlefieldHandle = {
  dodgePlayer: () => void;
  flashEnemy: (enemyId?: string) => void;
  focusEnemy: (enemyId: string) => void;
  flashPlayer: () => void;
  parryPlayer: () => void;
  playCardImpact: (label: string, enemyId?: string) => void;
  resetDefenseCooldowns: () => void;
  showFloatingText: (
    target: "player" | "enemy",
    text: string,
    tone?: "good" | "bad" | "neutral" | "damage" | "block",
    enemyId?: string,
  ) => void;
  showReactionLabel: (label: string, tone?: "good" | "bad" | "neutral") => void;
  setReactionTimingModifiers: (modifiers: { dodgeWindowBonusMs: number; parryWindowBonusMs: number }) => void;
  updateEnemyHud: (enemy: Pick<EnemyCombatant, "id" | "image" | "hp" | "maxHp">) => void;
};

type PhaserBattlefieldProps = {
  phase: CombatPhase;
  attackId: AttackId;
  backgroundPath: string;
  playerSpritePath: string;
  enemies: EnemyCombatant[];
  activeEnemyId: string;
  reactionTimingModifiers: { dodgeWindowBonusMs: number; parryWindowBonusMs: number };
  onAttackComplete: () => void;
  onAttackImpact: (event: { hit: AttackHit; hitIndex: number }) => void;
  onAttackStarted: (startedAt: number) => void;
  onEnemyBoundsChange: (bounds: DOMRect) => void;
  onEnemyBoundsListChange: (bounds: Record<string, DOMRect>) => void;
  onPlayerBoundsChange: (bounds: DOMRect) => void;
  onReactionResolved: (event: {
    hit: AttackHit;
    hitIndex: number;
    label: string;
    result: ReactionResult;
  }) => void;
  onTimingInput: (event: { percent: number; tone: "perfect" | "parry" | "dodge" | "miss" }) => void;
};

export const PhaserBattlefield = forwardRef<PhaserBattlefieldHandle, PhaserBattlefieldProps>(
  (
    {
      phase,
      attackId,
      backgroundPath,
      playerSpritePath,
      enemies,
      activeEnemyId,
      reactionTimingModifiers,
      onAttackComplete,
      onAttackImpact,
      onAttackStarted,
      onEnemyBoundsChange,
      onEnemyBoundsListChange,
      onPlayerBoundsChange,
      onReactionResolved,
      onTimingInput,
    },
    ref,
  ) => {
    const [hostElement, setHostElement] = useState<HTMLDivElement | null>(null);
    const gameRef = useRef<Phaser.Game | null>(null);
    const sceneRef = useRef<BattleScene | null>(null);
    const previousPhaseRef = useRef<CombatPhase | null>(null);
    const [sceneReadyVersion, setSceneReadyVersion] = useState(0);
    const callbacksRef = useRef({
      onAttackComplete,
      onAttackImpact,
      onAttackStarted,
      onEnemyBoundsChange,
      onEnemyBoundsListChange,
      onPlayerBoundsChange,
      onReactionResolved,
      onTimingInput,
    });

    callbacksRef.current = {
      onAttackComplete,
      onAttackImpact,
      onAttackStarted,
      onEnemyBoundsChange,
      onEnemyBoundsListChange,
      onPlayerBoundsChange,
      onReactionResolved,
      onTimingInput,
    };

    useImperativeHandle(ref, () => ({
      dodgePlayer: () => sceneRef.current?.dodgePlayer(),
      flashEnemy: (enemyId?: string) => sceneRef.current?.flashEnemy(enemyId),
      focusEnemy: (enemyId: string) => sceneRef.current?.focusEnemy(enemyId),
      flashPlayer: () => sceneRef.current?.flashPlayer(),
      parryPlayer: () => sceneRef.current?.parryPlayer(),
      playCardImpact: (label: string, enemyId?: string) => sceneRef.current?.playCardImpact(label, enemyId),
      resetDefenseCooldowns: () => sceneRef.current?.resetDefenseCooldowns(),
      showFloatingText: (target, text, tone, enemyId) => sceneRef.current?.showFloatingText(target, text, tone, enemyId),
      showReactionLabel: (label: string, tone?: "good" | "bad" | "neutral") => sceneRef.current?.showReactionLabel(label, tone),
      setReactionTimingModifiers: (modifiers) => sceneRef.current?.setReactionTimingModifiers(modifiers),
      updateEnemyHud: (enemy) => sceneRef.current?.updateEnemyHud(enemy),
    }));

    const handleHostRef = useCallback((element: HTMLDivElement | null) => {
      setHostElement(element);
    }, []);

    useEffect(() => {
      if (!hostElement || gameRef.current) {
        return;
      }

      const game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: hostElement,
        width: Math.max(1, hostElement.clientWidth),
        height: Math.max(1, hostElement.clientHeight),
        backgroundColor: "#161616",
        antialias: true,
        antialiasGL: true,
        pixelArt: false,
        roundPixels: false,
        render: {
          antialias: true,
          antialiasGL: true,
          pixelArt: false,
          roundPixels: false,
          mipmapFilter: "LINEAR_MIPMAP_LINEAR",
        },
        scale: {
          mode: Phaser.Scale.RESIZE,
          autoCenter: Phaser.Scale.CENTER_BOTH,
        },
      });

      gameRef.current = game;

      game.scene.add("BattleScene", BattleScene, true, {
        backgroundPath,
        activeEnemyId,
        enemies,
        playerSpritePath,
        onAttackComplete: () => callbacksRef.current.onAttackComplete(),
        onAttackImpact: (event: { hit: AttackHit; hitIndex: number }) => callbacksRef.current.onAttackImpact(event),
        onAttackStarted: (startedAt: number) => callbacksRef.current.onAttackStarted(startedAt),
        onEnemyBoundsChange: (bounds: DOMRect) => callbacksRef.current.onEnemyBoundsChange(bounds),
        onEnemyBoundsListChange: (bounds: Record<string, DOMRect>) => callbacksRef.current.onEnemyBoundsListChange(bounds),
        onPlayerBoundsChange: (bounds: DOMRect) => callbacksRef.current.onPlayerBoundsChange(bounds),
        onReactionResolved: (event: {
          hit: AttackHit;
          hitIndex: number;
          label: string;
          result: ReactionResult;
        }) => callbacksRef.current.onReactionResolved(event),
        onSceneReady: (scene: BattleScene) => {
          sceneRef.current = scene;
          setSceneReadyVersion((version) => version + 1);
        },
        onTimingInput: (event: { percent: number; tone: "perfect" | "parry" | "dodge" | "miss" }) =>
          callbacksRef.current.onTimingInput(event),
      });

      const scene = game.scene.getScene("BattleScene") as BattleScene;
      if (scene) {
        sceneRef.current = scene;
        setSceneReadyVersion((version) => version + 1);
      }

      return () => {
        game.destroy(true);
        gameRef.current = null;
        sceneRef.current = null;
        previousPhaseRef.current = null;
      };
    }, [backgroundPath, hostElement, playerSpritePath]);

    useEffect(() => {
      const scene = sceneRef.current;
      if (!scene || previousPhaseRef.current === phase) {
        return;
      }

      previousPhaseRef.current = phase;

      if (phase === "enemyAttack") {
        scene.setAttackId(attackId);
        scene.setEnemies(enemies, activeEnemyId);
      }

      scene.setPhase(phase);
    }, [activeEnemyId, attackId, enemies, phase, sceneReadyVersion]);

    useEffect(() => {
      const scene = sceneRef.current;
      if (!scene || phase === "enemyAttack") {
        return;
      }

      scene.setAttackId(attackId);
      scene.setEnemies(enemies, activeEnemyId);
    }, [activeEnemyId, attackId, enemies, phase, sceneReadyVersion]);

    useEffect(() => {
      sceneRef.current?.setReactionTimingModifiers(reactionTimingModifiers);
    }, [reactionTimingModifiers, sceneReadyVersion]);

    return <div ref={handleHostRef} className="phaser-host" aria-label="Battlefield canvas" />;
  },
);

PhaserBattlefield.displayName = "PhaserBattlefield";
