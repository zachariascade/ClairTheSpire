import Phaser from "phaser";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { AttackId } from "../game/combat/attackPatterns";
import type { CombatPhase } from "../game/combat/types";
import { BattleScene } from "../phaser/BattleScene";

export type PhaserBattlefieldHandle = {
  dodgePlayer: () => void;
  flashEnemy: () => void;
  flashPlayer: () => void;
  parryPlayer: () => void;
  playCardImpact: (label: string) => void;
  resetDefenseCooldowns: () => void;
  showFloatingText: (target: "player" | "enemy", text: string, tone?: "good" | "bad" | "neutral" | "damage" | "block") => void;
  showReactionLabel: (label: string, tone?: "good" | "bad" | "neutral") => void;
};

type PhaserBattlefieldProps = {
  phase: CombatPhase;
  attackId: AttackId;
  backgroundPath: string;
  playerSpritePath: string;
  onEnemyBoundsChange: (bounds: DOMRect) => void;
  onPlayerBoundsChange: (bounds: DOMRect) => void;
};

export const PhaserBattlefield = forwardRef<PhaserBattlefieldHandle, PhaserBattlefieldProps>(
  ({ phase, attackId, backgroundPath, playerSpritePath, onEnemyBoundsChange, onPlayerBoundsChange }, ref) => {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const gameRef = useRef<Phaser.Game | null>(null);
    const sceneRef = useRef<BattleScene | null>(null);
    const callbacksRef = useRef({ onEnemyBoundsChange, onPlayerBoundsChange });

    callbacksRef.current = { onEnemyBoundsChange, onPlayerBoundsChange };

    useImperativeHandle(ref, () => ({
      dodgePlayer: () => sceneRef.current?.dodgePlayer(),
      flashEnemy: () => sceneRef.current?.flashEnemy(),
      flashPlayer: () => sceneRef.current?.flashPlayer(),
      parryPlayer: () => sceneRef.current?.parryPlayer(),
      playCardImpact: (label: string) => sceneRef.current?.playCardImpact(label),
      resetDefenseCooldowns: () => sceneRef.current?.resetDefenseCooldowns(),
      showFloatingText: (target, text, tone) => sceneRef.current?.showFloatingText(target, text, tone),
      showReactionLabel: (label: string, tone?: "good" | "bad" | "neutral") => sceneRef.current?.showReactionLabel(label, tone),
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
        playerSpritePath,
        onEnemyBoundsChange: (bounds: DOMRect) => callbacksRef.current.onEnemyBoundsChange(bounds),
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
      scene.setPhase(phase);
    }, [attackId, phase]);

    return <div ref={hostRef} className="phaser-host" aria-label="Battlefield canvas" />;
  },
);

PhaserBattlefield.displayName = "PhaserBattlefield";
