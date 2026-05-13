import Phaser from "phaser";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { AttackId } from "../game/combat/attackPatterns";
import type { CombatPhase, EnemyCombatant } from "../game/combat/types";
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
  updateEnemyHud: (enemy: Pick<EnemyCombatant, "id" | "image" | "hp" | "maxHp">) => void;
};

type PhaserBattlefieldProps = {
  phase: CombatPhase;
  attackId: AttackId;
  backgroundPath: string;
  playerSpritePath: string;
  enemies: EnemyCombatant[];
  activeEnemyId: string;
  onEnemyBoundsChange: (bounds: DOMRect) => void;
  onEnemyBoundsListChange: (bounds: Record<string, DOMRect>) => void;
  onPlayerBoundsChange: (bounds: DOMRect) => void;
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
      onEnemyBoundsChange,
      onEnemyBoundsListChange,
      onPlayerBoundsChange,
    },
    ref,
  ) => {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const gameRef = useRef<Phaser.Game | null>(null);
    const sceneRef = useRef<BattleScene | null>(null);
    const callbacksRef = useRef({ onEnemyBoundsChange, onEnemyBoundsListChange, onPlayerBoundsChange });

    callbacksRef.current = { onEnemyBoundsChange, onEnemyBoundsListChange, onPlayerBoundsChange };

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
      updateEnemyHud: (enemy) => sceneRef.current?.updateEnemyHud(enemy),
    }));

    useEffect(() => {
      if (!hostRef.current || gameRef.current) {
        return;
      }

      const game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: hostRef.current,
        width: hostRef.current.clientWidth,
        height: hostRef.current.clientHeight,
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
        onEnemyBoundsChange: (bounds: DOMRect) => callbacksRef.current.onEnemyBoundsChange(bounds),
        onEnemyBoundsListChange: (bounds: Record<string, DOMRect>) => callbacksRef.current.onEnemyBoundsListChange(bounds),
        onPlayerBoundsChange: (bounds: DOMRect) => callbacksRef.current.onPlayerBoundsChange(bounds),
      });

      const scene = game.scene.getScene("BattleScene") as BattleScene;
      sceneRef.current = scene;

      return () => {
        game.destroy(true);
        gameRef.current = null;
        sceneRef.current = null;
      };
    }, [backgroundPath, playerSpritePath]);

    useEffect(() => {
      const scene = sceneRef.current;
      if (!scene) {
        return;
      }

      scene.setAttackId(attackId);

      if (phase === "enemyAttack") {
        scene.setEnemies(enemies, activeEnemyId);
        scene.setPhase(phase);
        return;
      }

      scene.setPhase(phase);
      scene.setEnemies(enemies, activeEnemyId);
    }, [activeEnemyId, attackId, enemies, phase]);

    return <div ref={hostRef} className="phaser-host" aria-label="Battlefield canvas" />;
  },
);

PhaserBattlefield.displayName = "PhaserBattlefield";
