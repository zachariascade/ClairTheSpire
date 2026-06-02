import Phaser from "phaser";
import {
  attackPatterns,
  getAttackDuration,
  type AttackHit,
  type AttackId,
  type AttackPattern,
} from "../game/combat/attackPatterns";
import type { CombatPhase, EnemyCombatant, ReactionResult } from "../game/combat/types";

type EffectTarget = "player" | "enemy";
type EffectTone = "good" | "bad" | "neutral" | "damage" | "block";
type ReactionInput = "parry" | "dodge" | "miss";
type TimingInputTone = "perfect" | "parry" | "dodge" | "miss";
type EnemySceneState = Pick<EnemyCombatant, "id" | "image" | "hp" | "maxHp">;
type EnemyActorTarget = {
  actor: Phaser.GameObjects.Container;
  home: { x: number; y: number };
};
type AttackTimelineStep = {
  atMs: number;
  run: (attacker: EnemyActorTarget) => void;
};

export type BattleSceneEvents = {
  onAttackComplete: () => void;
  onAttackImpact: (event: { hit: AttackHit; hitIndex: number }) => void;
  onAttackStarted: (startedAt: number) => void;
  onEnemyBoundsChange: (bounds: DOMRect) => void;
  onEnemyBoundsListChange: (bounds: Record<string, DOMRect>) => void;
  onEnemyTargetHover: (enemyId: string | null) => void;
  onEnemyTargetSelect: (enemyId: string) => void;
  onPlayerBoundsChange: (bounds: DOMRect) => void;
  onReactionResolved: (event: {
    hit: AttackHit;
    hitIndex: number;
    label: string;
    result: ReactionResult;
  }) => void;
  onReactionAttempt: (input: "parry" | "dodge") => boolean;
  onSceneReady: (scene: BattleScene) => void;
  onTimingInput: (event: { percent: number; tone: TimingInputTone }) => void;
};

type SceneData = BattleSceneEvents & {
  backgroundPath?: string;
  activeEnemyId?: string;
  enemies?: EnemySceneState[];
  playerSpritePath?: string;
};

const BATTLEFIELD_BACKGROUND_KEY = "battlefield-background";
const PLAYER_SPRITE_KEY = "gutz-player";
const FX_PARTICLE_KEY = "fx-particle";
const publicAssetPath = (filename: string) => `${import.meta.env.BASE_URL}${filename}`;
const getEnemySpriteKey = (image: string) => `enemy-sprite-${image}`;
const ACTOR_SPRITE_MAX_WIDTH = 220;
const ACTOR_SPRITE_MAX_HEIGHT = 300;
const ACTOR_BOUNDS_WIDTH = 210;
const ACTOR_BOUNDS_HEIGHT = 315;
const PLAYER_BOTTOM_OFFSET = 245;
const ENEMY_BOTTOM_OFFSET = 270;
const DEFENSE_ANIMATION_COOLDOWN_MS = 520;
const PLAYER_TURN_AFTER_ENEMY_PAUSE_MS = 750;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export class BattleScene extends Phaser.Scene {
  private background?: Phaser.GameObjects.Image;
  private atmosphere?: Phaser.GameObjects.Rectangle;
  private enemy!: Phaser.GameObjects.Container;
  private enemies: Phaser.GameObjects.Container[] = [];
  private enemyHealthHuds = new Map<string, Phaser.GameObjects.Container>();
  private player!: Phaser.GameObjects.Container;
  private weapon?: Phaser.GameObjects.Rectangle;
  private enemyHome = { x: 0, y: 0 };
  private enemyHomes: Array<{ x: number; y: number }> = [];
  private playerHome = { x: 0, y: 0 };
  private attackCue?: Phaser.GameObjects.Text;
  private attackResolutionTimers: Phaser.Time.TimerEvent[] = [];
  private attackVisualTimers: Phaser.Time.TimerEvent[] = [];
  private eventsBridge!: BattleSceneEvents;
  private backgroundPath = publicAssetPath("places/battlefield-background.png");
  private playerSpritePath = publicAssetPath("characters/gutz.png");
  private phase: CombatPhase = "playerTurn";
  private attackId: AttackId = "quick-slash";
  private enemyCount = 1;
  private activeEnemyId = "";
  private activeEnemyIndex = 0;
  private enemyStates: EnemySceneState[] = [];
  private sceneReady = false;
  private attackRunning = false;
  private attackStartedAt: number | null = null;
  private enemyTargetingEnabled = false;
  private hoveredEnemyTargetId: string | null = null;
  private reactionKeyHandler?: (event: KeyboardEvent) => void;
  private parryReadyAt = 0;
  private dodgeReadyAt = 0;
  private resolvedHitIndexes = new Set<number>();
  private parryWindowBonusMs = 0;
  private dodgeWindowBonusMs = 0;

  constructor() {
    super("BattleScene");
  }

  init(data: SceneData) {
    this.eventsBridge = data;
    this.backgroundPath = data.backgroundPath ?? publicAssetPath("places/battlefield-background.png");
    this.playerSpritePath = data.playerSpritePath ?? publicAssetPath("characters/gutz.png");
    this.configureEnemyFormation(data.enemies ?? [], data.activeEnemyId ?? "");
  }

  preload() {
    this.load.image(BATTLEFIELD_BACKGROUND_KEY, this.backgroundPath);
    this.load.image(PLAYER_SPRITE_KEY, this.playerSpritePath);

    for (const enemy of this.enemyStates) {
      const textureKey = getEnemySpriteKey(enemy.image);
      if (!this.textures.exists(textureKey)) {
        this.load.image(textureKey, publicAssetPath(enemy.image));
      }
    }
  }

  create() {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor("#020914");
    this.createParticleTexture();
    this.setTextureSmoothing();

    this.background = this.add.image(width / 2, height / 2, BATTLEFIELD_BACKGROUND_KEY);
    this.background.setDepth(-20);
    this.fitBackgroundToCanvas();

    this.atmosphere = this.add.rectangle(width / 2, height / 2, width, height, 0x020914, 0.16);
    this.atmosphere.setDepth(-19);

    this.playerHome = { x: width * 0.25, y: height - PLAYER_BOTTOM_OFFSET };
    this.enemyHomes = this.getEnemyHomes(this.enemyCount);
    this.enemyHome = this.enemyHomes[this.activeEnemyIndex] ?? this.enemyHomes[0];

    this.player = this.createPlayerActor(this.playerHome.x, this.playerHome.y);
    this.sceneReady = true;
    this.syncEnemyFormation();
    this.eventsBridge.onSceneReady(this);

    this.installReactionKeyHandler();
    this.publishActorBounds();
    this.scale.on("resize", this.handleResize, this);
  }

  setAttackId(attackId: AttackId) {
    this.attackId = attackId;
  }

  setEnemies(enemies: EnemySceneState[], activeEnemyId: string) {
    this.configureEnemyFormation(enemies, activeEnemyId);
    if (this.attackRunning) {
      return;
    }
    this.syncEnemyFormation();
  }

  focusEnemy(enemyId: string) {
    const nextIndex = this.enemyStates.findIndex((enemy) => enemy.id === enemyId);
    if (nextIndex < 0) {
      return;
    }

    this.activeEnemyId = enemyId;
    this.activeEnemyIndex = nextIndex;
    this.syncEnemyFormation();
  }

  updateEnemyHud(enemy: EnemySceneState) {
    const index = this.enemyStates.findIndex((candidate) => candidate.id === enemy.id);
    if (index < 0 || !this.enemies[index]) {
      return;
    }

    this.enemyStates = this.enemyStates.map((candidate) => (candidate.id === enemy.id ? enemy : candidate));
    this.syncEnemyHealthHud(enemy, index, index === this.activeEnemyIndex);
  }

  setPhase(phase: CombatPhase) {
    if (this.phase === phase && phase !== "enemyAttack") {
      return;
    }
    this.phase = phase;

    if (!this.sceneReady) {
      return;
    }

    if (phase === "enemyAttack" && !this.attackRunning) {
      this.runAttack(attackPatterns[this.attackId]);
      return;
    }

    if (phase !== "enemyAttack" && this.attackRunning) {
      this.completeEnemyAttack();
    }
  }

  resetDefenseCooldowns() {
    this.parryReadyAt = 0;
    this.dodgeReadyAt = 0;
  }

  attemptDodge() {
    this.handleReactionInput("dodge");
  }

  attemptParry() {
    this.handleReactionInput("parry");
  }

  setReactionTimingModifiers(modifiers: { dodgeWindowBonusMs: number; parryWindowBonusMs: number }) {
    this.dodgeWindowBonusMs = modifiers.dodgeWindowBonusMs;
    this.parryWindowBonusMs = modifiers.parryWindowBonusMs;
  }

  private installReactionKeyHandler() {
    this.reactionKeyHandler = (event: KeyboardEvent) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === "a") {
        this.handleReactionInput("parry");
        return;
      }

      if (key === "s") {
        this.handleReactionInput("dodge");
        return;
      }

      if (key === "d") {
        this.handleReactionInput("miss");
      }
    };

    window.addEventListener("keydown", this.reactionKeyHandler, { capture: true });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.removeReactionKeyHandler, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.removeReactionKeyHandler, this);
  }

  private removeReactionKeyHandler() {
    if (!this.reactionKeyHandler) {
      return;
    }

    window.removeEventListener("keydown", this.reactionKeyHandler, { capture: true });
    this.reactionKeyHandler = undefined;
  }

  setEnemyTargetingEnabled(enabled: boolean) {
    this.enemyTargetingEnabled = enabled;
    if (!enabled) {
      this.setHoveredEnemyTarget(null);
      this.input.setDefaultCursor("default");
      return;
    }

    this.syncHoveredEnemyTargetFromPointer();
  }

  flashEnemy(enemyId?: string) {
    const { actor, home } = this.getEnemyActorTarget(enemyId);

    this.tweens.killTweensOf(actor);
    actor.setAlpha(1);
    actor.setPosition(home.x, home.y);
    actor.setScale(1);
    this.showActorWash("enemy", 0xf07a6a);
    this.showImpactBurst(actor.x - 18, actor.y - 64, 0xf07a6a);
    this.emitSlashTrail(actor.x - 58, actor.y - 108, actor.x + 24, actor.y - 40, 0xf07a6a);

    this.tweens.add({
      targets: actor,
      x: home.x + 46,
      y: home.y - 8,
      scaleX: 1.2,
      scaleY: 0.88,
      alpha: 0.62,
      duration: 130,
      ease: "Quad.easeOut",
      onComplete: () => {
        this.tweens.add({
          targets: actor,
          x: home.x,
          y: home.y,
          scaleX: 1,
          scaleY: 1,
          alpha: 1,
          duration: 260,
          ease: "Back.easeOut",
          onComplete: () => this.publishActorBounds(),
        });
      },
    });
    this.cameras.main.shake(180, 0.008);
  }

  flashPlayer() {
    this.tweens.killTweensOf(this.player);
    this.player.setAlpha(1);
    this.player.setPosition(this.playerHome.x, this.playerHome.y);
    this.showActorWash("player", 0xf07a6a);
    this.emitParticleBurst(this.player.x + 14, this.player.y - 58, 0xf07a6a, {
      count: 24,
      gravityY: 420,
      lifespan: 380,
      scale: { start: 1.2, end: 0 },
      speed: { min: 90, max: 260 },
    });

    this.tweens.add({
      targets: this.player,
      x: this.playerHome.x - 18,
      alpha: 0.55,
      yoyo: true,
      repeat: 2,
      duration: 70,
      ease: "Quad.easeOut",
      onComplete: () => {
        this.player.alpha = 1;
        this.player.setPosition(this.playerHome.x, this.playerHome.y);
      },
    });
    this.cameras.main.shake(120, 0.005);
  }

  dodgePlayer() {
    const now = performance.now();
    if (now < this.dodgeReadyAt) {
      return;
    }
    this.dodgeReadyAt = now + DEFENSE_ANIMATION_COOLDOWN_MS;

    this.tweens.killTweensOf(this.player);
    this.player.setAlpha(1);
    this.player.setPosition(this.playerHome.x, this.playerHome.y);
    this.showDodgeAfterimage();
    this.emitDodgeDust(this.playerHome.x - 18, this.playerHome.y + 52);

    this.tweens.add({
      targets: this.player,
      x: this.playerHome.x - 150,
      y: this.playerHome.y + 10,
      alpha: 0.62,
      scaleX: 0.84,
      scaleY: 1.08,
      duration: 190,
      ease: "Quad.easeOut",
      onUpdate: () => this.publishActorBounds(),
      onComplete: () => {
        this.tweens.add({
          targets: this.player,
          x: this.playerHome.x,
          y: this.playerHome.y,
          alpha: 1,
          scaleX: 1,
          scaleY: 1,
          duration: 320,
          ease: "Back.easeOut",
          onUpdate: () => this.publishActorBounds(),
          onComplete: () => this.publishActorBounds(),
        });
      },
    });
  }

  parryPlayer() {
    const now = performance.now();
    if (now < this.parryReadyAt) {
      return;
    }
    this.parryReadyAt = now + DEFENSE_ANIMATION_COOLDOWN_MS;

    this.tweens.killTweensOf(this.player);
    this.player.setAlpha(1);
    this.player.setPosition(this.playerHome.x, this.playerHome.y);
    this.showParryAfterimage();
    this.emitGuardBurst(this.playerHome.x + 40, this.playerHome.y - 62, 0xfff3bd);

    this.tweens.add({
      targets: this.player,
      scaleX: -1,
      scaleY: 1.08,
      x: this.playerHome.x + 44,
      y: this.playerHome.y - 4,
      duration: 150,
      ease: "Quad.easeOut",
      onUpdate: () => this.publishActorBounds(),
      onComplete: () => {
        this.tweens.add({
          targets: this.player,
          scaleX: 1,
          scaleY: 1,
          x: this.playerHome.x,
          y: this.playerHome.y,
          duration: 260,
          ease: "Back.easeOut",
          onUpdate: () => this.publishActorBounds(),
          onComplete: () => this.publishActorBounds(),
        });
      },
    });
  }

  private showParryAfterimage() {
    if (!this.textures.exists(PLAYER_SPRITE_KEY)) {
      return;
    }

    const afterimage = this.add.image(this.playerHome.x, this.playerHome.y, PLAYER_SPRITE_KEY);
    afterimage.setOrigin(0.5, 0.72);
    this.fitSpriteToBox(afterimage, ACTOR_SPRITE_MAX_WIDTH, ACTOR_SPRITE_MAX_HEIGHT);
    afterimage.setFlipX(true);
    afterimage.setTint(0xfff3bd);
    afterimage.setAlpha(0.28);
    afterimage.setDepth(3);

    this.tweens.add({
      targets: afterimage,
      alpha: 0,
      x: this.playerHome.x + 42,
      duration: 360,
      ease: "Quad.easeOut",
      onComplete: () => afterimage.destroy(),
    });
  }

  private showDodgeAfterimage() {
    if (!this.textures.exists(PLAYER_SPRITE_KEY)) {
      return;
    }

    const afterimage = this.add.image(this.playerHome.x, this.playerHome.y, PLAYER_SPRITE_KEY);
    afterimage.setOrigin(0.5, 0.72);
    this.fitSpriteToBox(afterimage, ACTOR_SPRITE_MAX_WIDTH, ACTOR_SPRITE_MAX_HEIGHT);
    afterimage.setTint(0x9fe2ff);
    afterimage.setAlpha(0.34);
    afterimage.setDepth(3);

    this.tweens.add({
      targets: afterimage,
      alpha: 0,
      x: this.playerHome.x + 34,
      duration: 420,
      ease: "Quad.easeOut",
      onComplete: () => afterimage.destroy(),
    });
  }

  playCardImpact(label: string, enemyId?: string) {
    const { actor } = this.getEnemyActorTarget(enemyId);
    const card = this.add.rectangle(this.player.x + 42, this.player.y - 82, 48, 68, 0xf5cf72, 0.22);
    card.setStrokeStyle(2, 0xf5cf72, 0.92);
    card.setDepth(8);
    card.setAngle(-8);
    this.showFloatingText("enemy", label, "damage", enemyId);

    this.tweens.add({
      targets: card,
      x: actor.x - 18,
      y: actor.y - 62,
      angle: 12,
      scale: 0.5,
      duration: 360,
      ease: "Cubic.easeIn",
      onComplete: () => {
        card.destroy();
        this.flashEnemy(enemyId);
        this.showImpactBurst(actor.x - 26, actor.y - 62, 0xf5cf72);
        this.emitSlashTrail(this.player.x + 70, this.player.y - 96, actor.x - 30, actor.y - 58, 0xf5cf72);
      },
    });
  }

  showFloatingText(target: EffectTarget, text: string, tone: EffectTone = "neutral", enemyId?: string) {
    const actor = target === "enemy" ? this.getEnemyActorTarget(enemyId).actor : this.player;
    const color = this.getToneColor(tone);
    const label = this.add.text(actor.x, actor.y - 132, text, {
      color,
      fontFamily: "Arial, sans-serif",
      fontSize: tone === "damage" ? "26px" : "22px",
      fontStyle: "bold",
      stroke: "#101010",
      strokeThickness: 5,
    });

    label.setOrigin(0.5);
    label.setDepth(12);
    label.setAlpha(0);
    label.setScale(0.86);

    this.tweens.add({
      targets: label,
      y: label.y - 46,
      alpha: 1,
      scale: 1,
      duration: 120,
      ease: "Back.easeOut",
      onComplete: () => {
        this.tweens.add({
          targets: label,
          y: label.y - 24,
          alpha: 0,
          duration: 780,
          delay: 520,
          ease: "Sine.easeIn",
          onComplete: () => label.destroy(),
        });
      },
    });
  }

  private createActor(x: number, y: number, color: number, label: string) {
    const container = this.add.container(x, y);
    const shadow = this.add.ellipse(0, 62, 130, 22, 0x000000, 0.32);
    const body = this.add.rectangle(0, 0, 92, 132, color, 1);
    const head = this.add.circle(0, -82, 34, color, 1);
    const glow = this.add.circle(0, -86, 11, 0xf6e6a8, 0.9);
    const text = this.add.text(0, 95, label, {
      color: "#f7eed8",
      fontFamily: "Arial, sans-serif",
      fontSize: "18px",
      fontStyle: "bold",
    });
    text.setOrigin(0.5);
    body.setStrokeStyle(2, 0xf7eed8, 0.35);
    head.setStrokeStyle(2, 0xf7eed8, 0.35);
    container.add([shadow, body, head, glow, text]);
    return container;
  }

  private createPlayerActor(x: number, y: number) {
    if (!this.textures.exists(PLAYER_SPRITE_KEY)) {
      return this.createActor(x, y, 0x55788c, "YOU");
    }

    const container = this.add.container(x, y);
    const sprite = this.add.image(0, 0, PLAYER_SPRITE_KEY);

    sprite.setOrigin(0.5, 0.72);
    this.fitSpriteToBox(sprite, ACTOR_SPRITE_MAX_WIDTH, ACTOR_SPRITE_MAX_HEIGHT);
    container.add(sprite);
    return container;
  }

  private createEnemyActor(x: number, y: number, index = 0) {
    const textureKey = getEnemySpriteKey(this.enemyStates[index]?.image ?? "enemies/vesuvio.png");

    if (!this.textures.exists(textureKey)) {
      return this.createActor(x, y, 0x9d514c, "RIVAL");
    }

    const container = this.add.container(x, y);
    const sprite = this.add.image(0, 0, textureKey);

    sprite.setOrigin(0.5, 0.72);
    this.fitSpriteToBox(sprite, ACTOR_SPRITE_MAX_WIDTH, ACTOR_SPRITE_MAX_HEIGHT);
    container.add(sprite);
    return container;
  }

  private syncEnemyFormation() {
    if (!this.scale || !this.sceneReady) {
      return;
    }

    this.enemyHomes = this.getEnemyHomes(this.enemyCount);
    this.activeEnemyIndex = clamp(this.activeEnemyIndex, 0, this.enemyHomes.length - 1);

    while (this.enemies.length < this.enemyCount) {
      const index = this.enemies.length;
      const home = this.enemyHomes[index];
      const enemy = this.createEnemyActor(home.x, home.y, index);
      this.configureEnemyTargeting(enemy, index);
      this.enemies.push(enemy);
    }

    while (this.enemies.length > this.enemyCount) {
      this.enemies.pop()?.destroy();
    }

    this.enemies.forEach((enemy, index) => {
      const home = this.enemyHomes[index];
      this.tweens.killTweensOf(enemy);
      enemy.setPosition(home.x, home.y);
      enemy.setScale(1);
      enemy.setAlpha(1);
      enemy.setDepth(index === this.activeEnemyIndex ? 4 : 2);
      this.configureEnemyTargeting(enemy, index);
      this.syncEnemyHealthHud(this.enemyStates[index], index, index === this.activeEnemyIndex);
    });

    this.destroyStaleEnemyHealthHuds();

    this.enemy = this.enemies[this.activeEnemyIndex] ?? this.enemies[0];
    this.enemyHome = this.enemyHomes[this.activeEnemyIndex] ?? this.enemyHomes[0];
    this.publishActorBounds();
  }

  private configureEnemyFormation(enemies: EnemySceneState[], activeEnemyId: string) {
    this.enemyStates = enemies;
    this.enemyCount = Math.max(1, enemies.length);
    this.activeEnemyId = activeEnemyId || enemies[0]?.id || "";
    this.activeEnemyIndex = Math.max(0, enemies.findIndex((enemy) => enemy.id === this.activeEnemyId));
  }

  private syncEnemyHealthHud(enemy: EnemySceneState | undefined, index: number, isActive: boolean) {
    if (!enemy) {
      return;
    }

    const existing = this.enemyHealthHuds.get(enemy.id);
    if (existing) {
      existing.destroy(true);
      this.enemyHealthHuds.delete(enemy.id);
    }
  }

  private destroyStaleEnemyHealthHuds() {
    const livingIds = new Set(this.enemyStates.map((enemy) => enemy.id));

    for (const [enemyId, hud] of this.enemyHealthHuds) {
      if (!livingIds.has(enemyId)) {
        hud.destroy(true);
        this.enemyHealthHuds.delete(enemyId);
      }
    }
  }

  private configureEnemyTargeting(enemy: Phaser.GameObjects.Container, index: number) {
    enemy.removeAllListeners("pointerover");
    enemy.removeAllListeners("pointerout");
    enemy.removeAllListeners("pointerdown");

    const enemyId = this.enemyStates[index]?.id;
    if (!enemyId) {
      enemy.disableInteractive();
      return;
    }

    enemy.setInteractive(
      new Phaser.Geom.Rectangle(
        -ACTOR_BOUNDS_WIDTH / 2,
        -ACTOR_BOUNDS_HEIGHT / 2 - 10,
        ACTOR_BOUNDS_WIDTH,
        ACTOR_BOUNDS_HEIGHT,
      ),
      Phaser.Geom.Rectangle.Contains,
    );

    enemy.on("pointerover", () => {
      if (!this.canTargetEnemy(index)) {
        return;
      }

      this.input.setDefaultCursor("pointer");
      this.setHoveredEnemyTarget(enemyId);
    });

    enemy.on("pointerout", () => {
      if (this.hoveredEnemyTargetId === enemyId) {
        this.setHoveredEnemyTarget(null);
      }
      this.input.setDefaultCursor("default");
    });

    enemy.on("pointerdown", () => {
      if (!this.canTargetEnemy(index)) {
        return;
      }

      this.eventsBridge.onEnemyTargetSelect(enemyId);
    });
  }

  private canTargetEnemy(index: number) {
    return this.enemyTargetingEnabled && this.phase === "playerTurn" && (this.enemyStates[index]?.hp ?? 0) > 0;
  }

  private syncHoveredEnemyTargetFromPointer() {
    const pointer = this.input.activePointer;
    const hoveredIndex = this.enemies.findIndex((enemy, index) => {
      if (!this.canTargetEnemy(index)) {
        return false;
      }

      const localX = pointer.worldX - enemy.x;
      const localY = pointer.worldY - enemy.y;
      return (
        localX >= -ACTOR_BOUNDS_WIDTH / 2 &&
        localX <= ACTOR_BOUNDS_WIDTH / 2 &&
        localY >= -ACTOR_BOUNDS_HEIGHT / 2 - 10 &&
        localY <= ACTOR_BOUNDS_HEIGHT / 2 - 10
      );
    });

    const hoveredEnemyId = hoveredIndex >= 0 ? this.enemyStates[hoveredIndex]?.id ?? null : null;
    this.setHoveredEnemyTarget(hoveredEnemyId);
    this.input.setDefaultCursor(hoveredEnemyId ? "pointer" : "default");
  }

  private setHoveredEnemyTarget(enemyId: string | null) {
    if (this.hoveredEnemyTargetId === enemyId) {
      return;
    }

    this.hoveredEnemyTargetId = enemyId;
    this.eventsBridge.onEnemyTargetHover(enemyId);
  }

  private getEnemyActorTarget(enemyId?: string) {
    const targetEnemyId = enemyId ?? this.activeEnemyId;
    const index = targetEnemyId ? this.enemyStates.findIndex((enemy) => enemy.id === targetEnemyId) : this.activeEnemyIndex;
    const safeIndex = clamp(index < 0 ? this.activeEnemyIndex : index, 0, this.enemies.length - 1);

    return {
      actor: this.enemies[safeIndex] ?? this.enemy,
      home: this.enemyHomes[safeIndex] ?? this.enemyHome,
    };
  }

  private getEnemyHomes(count: number) {
    const { width, height } = this.scale;
    const baseY = height - ENEMY_BOTTOM_OFFSET;

    if (count === 1) {
      return [{ x: width * 0.75, y: baseY }];
    }

    const formationLeft = width * 0.48;
    const formationRight = width * 0.9;
    const slotWidth = (formationRight - formationLeft) / count;
    return Array.from({ length: count }, (_, index) => {
      return {
        x: formationLeft + slotWidth * (index + 0.5),
        y: baseY - (index % 2 === 1 ? 34 : 0),
      };
    });
  }

  private fitSpriteToBox(sprite: Phaser.GameObjects.Image, maxWidth: number, maxHeight: number) {
    const texture = sprite.texture.getSourceImage() as HTMLImageElement;
    const scale = Math.min(maxWidth / texture.width, maxHeight / texture.height);
    sprite.setScale(scale);
  }

  private createParticleTexture() {
    if (this.textures.exists(FX_PARTICLE_KEY)) {
      return;
    }

    const graphics = this.make.graphics({ x: 0, y: 0 }, false);
    graphics.fillStyle(0xffffff, 1);
    graphics.fillCircle(5, 5, 5);
    graphics.generateTexture(FX_PARTICLE_KEY, 10, 10);
    graphics.destroy();
  }

  private runAttack(pattern: AttackPattern) {
    this.attackRunning = true;
    this.attackStartedAt = performance.now();
    this.resolvedHitIndexes = new Set();
    this.clearAttackResolutionTimers();
    this.clearAttackVisualTimers();
    this.eventsBridge.onAttackStarted(this.attackStartedAt);
    const attacker = this.getEnemyActorTarget();
    this.enemy = attacker.actor;
    this.enemyHome = attacker.home;

    this.attackCue?.destroy();
    this.attackCue = this.add.text(attacker.actor.x, attacker.actor.y - 168, pattern.name, {
      color: this.getAttackColor(pattern),
      fontFamily: "Arial, sans-serif",
      fontSize: "22px",
      fontStyle: "bold",
    }).setOrigin(0.5).setDepth(6).setAlpha(0.95);
    if (pattern.id === "quick-slash") {
      this.runQuickSlashVisual(pattern, attacker);
      this.queueAttackResolution(pattern);
      return;
    }

    if (pattern.id === "heavy-overhead") {
      this.runHeavyOverheadVisual(pattern, attacker);
      this.queueAttackResolution(pattern);
      return;
    }

    if (pattern.id === "three-hit-combo") {
      this.runThreeHitComboVisual(pattern, attacker);
      this.queueAttackResolution(pattern);
      return;
    }

    if (pattern.id === "shield-breaker") {
      this.runShieldBreakerVisual(pattern, attacker);
      this.queueAttackResolution(pattern);
      return;
    }
    this.runOrbitalLaserVisual(pattern, attacker);
    this.queueAttackResolution(pattern);
  }

  private queueAttackResolution(pattern: AttackPattern) {
    for (const [index, hit] of pattern.hits.entries()) {
      this.attackResolutionTimers.push(this.time.delayedCall(hit.atMs, () => {
        this.eventsBridge.onAttackImpact({ hit, hitIndex: index });
      }));
      this.attackResolutionTimers.push(this.time.delayedCall(hit.atMs + pattern.dodgeWindowMs, () => {
        if (this.resolvedHitIndexes.has(index)) {
          return;
        }
        this.resolveHit(index, hit, "HIT_TAKEN", "Hit");
      }));
    }

    this.attackResolutionTimers.push(this.time.delayedCall(getAttackDuration(pattern) + PLAYER_TURN_AFTER_ENEMY_PAUSE_MS, () => {
      this.eventsBridge.onAttackComplete();
    }));
  }

  private handleReactionInput(input: ReactionInput) {
    if ((input === "parry" || input === "dodge") && !this.canSpendReactionInput(input)) {
      return;
    }

    if (input === "parry") {
      this.parryPlayer();
    }

    if (input === "dodge") {
      this.dodgePlayer();
    }

    this.resolveReactionInput(input);
  }

  private canSpendReactionInput(input: "parry" | "dodge") {
    if (this.phase !== "enemyAttack" || !this.attackRunning || this.attackStartedAt === null) {
      return false;
    }

    const pattern = attackPatterns[this.attackId];
    const hasPendingHit = pattern.hits.some((_, index) => !this.resolvedHitIndexes.has(index));

    return hasPendingHit && this.eventsBridge.onReactionAttempt(input);
  }

  private resolveReactionInput(input: ReactionInput) {
    if (this.phase !== "enemyAttack" || !this.attackRunning || this.attackStartedAt === null) {
      return;
    }

    const pattern = attackPatterns[this.attackId];
    const elapsed = performance.now() - this.attackStartedAt;
    const nextHit = pattern.hits
      .map((hit, index) => ({ hit, index, offset: Math.abs(elapsed - hit.atMs) }))
      .filter(({ index }) => !this.resolvedHitIndexes.has(index))
      .sort((a, b) => a.offset - b.offset)[0];

    if (!nextHit) {
      return;
    }

    const markerPercent = this.getAttackProgressPercent(pattern);

    if (pattern.defense === "shield") {
      this.eventsBridge.onTimingInput({ percent: markerPercent, tone: "miss" });
      this.showReactionLabel("Shield Only", "bad");
      return;
    }

    if (input === "miss") {
      this.eventsBridge.onTimingInput({ percent: markerPercent, tone: "miss" });
      this.resolveHit(nextHit.index, nextHit.hit, "REACTION_FAILED", "Miss");
      return;
    }

    if (input === "dodge") {
      const result =
        nextHit.offset <= pattern.dodgeWindowMs + this.dodgeWindowBonusMs ? "DODGE_SUCCESS" : "REACTION_FAILED";
      this.eventsBridge.onTimingInput({
        percent: markerPercent,
        tone: result === "DODGE_SUCCESS" ? "dodge" : "miss",
      });
      this.resolveHit(nextHit.index, nextHit.hit, result, result === "DODGE_SUCCESS" ? "Dodge" : "Early");
      return;
    }

    if (nextHit.offset <= pattern.perfectParryWindowMs + this.parryWindowBonusMs / 2) {
      this.eventsBridge.onTimingInput({ percent: markerPercent, tone: "perfect" });
      this.resolveHit(nextHit.index, nextHit.hit, "PARRY_PERFECT", "Perfect");
      return;
    }

    if (nextHit.offset <= pattern.normalParryWindowMs + this.parryWindowBonusMs) {
      this.eventsBridge.onTimingInput({ percent: markerPercent, tone: "parry" });
      this.resolveHit(nextHit.index, nextHit.hit, "PARRY_NORMAL", "Parry");
      return;
    }

    this.eventsBridge.onTimingInput({ percent: markerPercent, tone: "miss" });
    this.resolveHit(nextHit.index, nextHit.hit, "REACTION_FAILED", elapsed < nextHit.hit.atMs ? "Early" : "Late");
  }

  private resolveHit(hitIndex: number, hit: AttackHit, result: ReactionResult, label: string) {
    if (this.resolvedHitIndexes.has(hitIndex)) {
      return;
    }

    this.resolvedHitIndexes.add(hitIndex);
    this.eventsBridge.onReactionResolved({ hit, hitIndex, label, result });
  }

  private getAttackProgressPercent(pattern: AttackPattern) {
    if (this.attackStartedAt === null) {
      return 0;
    }

    return clamp(((performance.now() - this.attackStartedAt) / getAttackDuration(pattern)) * 100, 0, 100);
  }

  private playAttackTimeline(attacker: EnemyActorTarget, steps: AttackTimelineStep[]) {
    for (const step of steps) {
      if (step.atMs <= 0) {
        step.run(attacker);
        continue;
      }

      this.attackVisualTimers.push(this.time.delayedCall(step.atMs, () => step.run(attacker)));
    }
  }

  private createHitVisualSteps(atMs: number, angle: number, shakeMs: number): AttackTimelineStep[] {
    return [
      {
        atMs: Math.max(0, atMs - 140),
        run: (attacker) => {
          this.pulseActor(attacker.actor, 1.04, 95);
        },
      },
      {
        atMs,
        run: (attacker) => {
          this.tweenWeapon({ angle, scaleY: 1, duration: 150, ease: "Quad.easeIn" });
          this.tweens.add({
            targets: attacker.actor,
            x: attacker.home.x,
            y: attacker.home.y,
            scaleX: 1,
            scaleY: 1,
            duration: 150,
            ease: "Back.easeOut",
          });
          this.showImpactBurst(this.player.x + 20, this.player.y - 58, 0xf7dca2);
          this.emitSlashTrail(attacker.actor.x - 38, attacker.actor.y - 114, this.player.x + 28, this.player.y - 58, 0xf7dca2);
          this.cameras.main.shake(shakeMs, 0.004);
        },
      },
    ];
  }

  private runQuickSlashVisual(pattern: AttackPattern, attacker: EnemyActorTarget) {
    const hit = pattern.hits[0];
    this.playAttackTimeline(attacker, [
      {
        atMs: 0,
        run: (target) => {
          this.resetEnemyPose(target);
          this.tweenWeapon({ angle: -42, duration: hit.atMs, ease: "Sine.easeOut" });
          this.tweens.add({
            targets: target.actor,
            x: target.home.x - 58,
            scaleX: 1.08,
            duration: Math.max(120, hit.atMs - 80),
            ease: "Sine.easeInOut",
          });
        },
      },
      ...this.createHitVisualSteps(hit.atMs, 64, 100),
    ]);
  }

  private runHeavyOverheadVisual(pattern: AttackPattern, attacker: EnemyActorTarget) {
    const hit = pattern.hits[0];
    this.playAttackTimeline(attacker, [
      {
        atMs: 0,
        run: (target) => {
          this.resetEnemyPose(target);
          target.actor.setScale(1.06);
          this.tweenWeapon({
            angle: -86,
            scaleY: 1.18,
            duration: hit.atMs,
            ease: "Sine.easeInOut",
          });
          this.tweens.add({
            targets: target.actor,
            y: target.home.y - 34,
            scaleY: 1.13,
            duration: Math.max(160, hit.atMs - 120),
            ease: "Sine.easeInOut",
          });
        },
      },
      ...this.createHitVisualSteps(hit.atMs, 86, 170),
    ]);
  }

  private runThreeHitComboVisual(pattern: AttackPattern, attacker: EnemyActorTarget) {
    const angles = [52, -56, 70];
    const steps: AttackTimelineStep[] = [
      {
        atMs: 0,
        run: (target) => this.resetEnemyPose(target),
      },
    ];

    for (const [index, hit] of pattern.hits.entries()) {
      steps.push({
        atMs: Math.max(0, hit.atMs - 220),
        run: (target) => {
          this.tweenWeapon({ angle: -angles[index], duration: 180, ease: "Sine.easeOut" });
          this.tweens.add({
            targets: target.actor,
            x: target.home.x - (index % 2 === 0 ? 42 : 18),
            y: target.home.y + (index === 1 ? -14 : 0),
            duration: 140,
            ease: "Sine.easeOut",
          });
        },
      });
      steps.push(...this.createHitVisualSteps(hit.atMs, angles[index], index === 2 ? 140 : 80));
    }

    this.playAttackTimeline(attacker, steps);
  }

  private runOrbitalLaserVisual(pattern: AttackPattern, attacker: EnemyActorTarget) {
    const steps: AttackTimelineStep[] = [
      {
        atMs: 0,
        run: (target) => {
          this.resetEnemyPose(target);
          this.tweenWeapon({ angle: -18, scaleY: 0.92, duration: 260, ease: "Sine.easeOut" });
        },
      },
    ];

    for (const [index, hit] of pattern.hits.entries()) {
      steps.push({
        atMs: Math.max(0, hit.atMs - 280),
        run: (target) => {
          const turn = (index / pattern.hits.length) * Math.PI * 2 - Math.PI / 2;
          this.pulseActor(target.actor, 1.035, 120);
          this.showImpactBurst(
            target.home.x + Math.cos(turn) * 172,
            target.home.y - 78 + Math.sin(turn) * 172,
            0xf5cf72,
          );
        },
      });

      steps.push({
        atMs: hit.atMs,
        run: () => {
          this.showImpactBurst(this.player.x + 20, this.player.y - 58, 0xfff3bd);
          this.cameras.main.shake(index === pattern.hits.length - 1 ? 130 : 72, 0.0035);
        },
      });
    }

    this.playAttackTimeline(attacker, steps);
  }

  private runShieldBreakerVisual(pattern: AttackPattern, attacker: EnemyActorTarget) {
    const hit = pattern.hits[0];

    this.playAttackTimeline(attacker, [
      {
        atMs: 0,
        run: (target) => {
          this.resetEnemyPose(target);
          target.actor.setScale(1.04);
          this.tweenWeapon({
            angle: -104,
            scaleY: 1.28,
            duration: Math.max(220, hit.atMs - 220),
            ease: "Sine.easeInOut",
          });
          this.tweens.add({
            targets: target.actor,
            y: target.home.y - 22,
            scaleX: 1.1,
            scaleY: 1.12,
            duration: Math.max(180, hit.atMs - 180),
            ease: "Sine.easeInOut",
          });
        },
      },
      {
        atMs: Math.max(0, hit.atMs - 360),
        run: (target) => {
          this.showImpactBurst(target.home.x - 16, target.home.y - 112, 0x8fa0de);
          this.pulseActor(target.actor, 1.08, 160);
        },
      },
      {
        atMs: hit.atMs,
        run: (target) => {
          this.tweenWeapon({ angle: 92, scaleY: 1, duration: 160, ease: "Quad.easeIn" });
          this.tweens.add({
            targets: target.actor,
            x: target.home.x,
            y: target.home.y,
            scaleX: 1,
            scaleY: 1,
            duration: 170,
            ease: "Back.easeOut",
          });
          this.showImpactBurst(this.player.x + 20, this.player.y - 58, 0x8fa0de);
          this.emitGuardBurst(this.player.x + 20, this.player.y - 58, 0x8fa0de);
          this.cameras.main.shake(190, 0.005);
        },
      },
    ]);
  }

  private completeEnemyAttack() {
    if (!this.attackRunning) {
      return;
    }
    this.attackRunning = false;
    this.attackStartedAt = null;
    this.resolvedHitIndexes = new Set();
    this.clearAttackResolutionTimers();
    this.clearAttackVisualTimers();
    this.resetWeapon();
    this.resetEnemyPose();
    this.attackCue?.destroy();
    this.attackCue = undefined;
  }

  private clearAttackResolutionTimers() {
    for (const timer of this.attackResolutionTimers) {
      timer.remove(false);
    }
    this.attackResolutionTimers = [];
  }

  private clearAttackVisualTimers() {
    for (const timer of this.attackVisualTimers) {
      timer.remove(false);
    }
    this.attackVisualTimers = [];
  }

  private resetWeapon() {
    if (!this.weapon) {
      return;
    }
    this.tweens.killTweensOf(this.weapon);
    this.tweens.add({
      targets: this.weapon,
      angle: 0,
      scaleY: 1,
      duration: 160,
      ease: "Back.easeOut",
    });
  }

  private tweenWeapon(config: Omit<Phaser.Types.Tweens.TweenBuilderConfig, "targets">) {
    if (!this.weapon) {
      return;
    }
    this.tweens.add({
      targets: this.weapon,
      ...config,
    });
  }

  private resetEnemyPose(target: EnemyActorTarget = this.getEnemyActorTarget()) {
    this.tweens.killTweensOf(target.actor);
    target.actor.setPosition(target.home.x, target.home.y);
    target.actor.setScale(1);
    target.actor.setAlpha(1);
    this.publishActorBounds();
  }

  showReactionLabel(label: string, tone: "good" | "bad" | "neutral" = "neutral") {
    if (this.phase !== "enemyAttack" || !this.attackRunning) {
      return;
    }
    this.attackCue?.setText(label);
    this.attackCue?.setColor(tone === "good" ? "#9fe2b1" : tone === "bad" ? "#f07a6a" : "#f7dca2");
    this.attackCue?.setScale(1.18);
    this.tweens.add({
      targets: this.attackCue,
      scale: 1,
      duration: 160,
      ease: "Back.easeOut",
    });
    this.showImpactBurst(this.player.x + 20, this.player.y - 60, tone === "good" ? 0x9fe2b1 : tone === "bad" ? 0xf07a6a : 0xf7dca2);
    if (tone === "good") {
      this.emitGuardBurst(this.player.x + 20, this.player.y - 60, 0x9fe2b1);
    }
    this.time.delayedCall(220, () => {
      if (this.attackCue) {
        this.attackCue.setText(attackPatterns[this.attackId].name);
        this.attackCue.setColor(this.getAttackColor(attackPatterns[this.attackId]));
      }
    });
  }

  private pulseActor(actor: Phaser.GameObjects.Container, scale: number, duration: number) {
    this.tweens.add({
      targets: actor,
      scaleX: scale,
      scaleY: scale,
      yoyo: true,
      duration,
      ease: "Sine.easeOut",
    });
  }

  private showImpactBurst(x: number, y: number, color: number) {
    const burst = this.add.circle(x, y, 12, color, 0.12);
    burst.setStrokeStyle(3, color, 0.88);
    burst.setDepth(10);
    this.emitParticleBurst(x, y, color, {
      count: 30,
      gravityY: 300,
      lifespan: 420,
      scale: { start: 1.15, end: 0 },
      speed: { min: 110, max: 310 },
    });
    this.tweens.add({
      targets: burst,
      scale: 2.6,
      alpha: 0,
      duration: 260,
      ease: "Quad.easeOut",
      onComplete: () => burst.destroy(),
    });
  }

  private showActorWash(target: EffectTarget, color: number) {
    const actor = target === "enemy" ? this.enemy : this.player;
    const wash = this.add.rectangle(actor.x, actor.y - 30, 112, 164, color, 0.28);
    wash.setDepth(11);
    wash.setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: wash,
      alpha: 0,
      scaleX: 1.32,
      scaleY: 1.18,
      duration: 190,
      ease: "Quad.easeOut",
      onComplete: () => wash.destroy(),
    });
  }

  private emitParticleBurst(
    x: number,
    y: number,
    color: number,
    config: {
      count: number;
      gravityY?: number;
      lifespan: number;
      scale: { start: number; end: number };
      speed: { min: number; max: number };
    },
  ) {
    const emitter = this.add.particles(x, y, FX_PARTICLE_KEY, {
      alpha: { start: 0.95, end: 0 },
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
      gravityY: config.gravityY ?? 0,
      lifespan: config.lifespan,
      scale: config.scale,
      speed: config.speed,
      tint: color,
    });

    emitter.setDepth(13);
    emitter.explode(config.count, x, y);
    this.time.delayedCall(config.lifespan + 80, () => emitter.destroy());
  }

  private emitGuardBurst(x: number, y: number, color: number) {
    this.emitParticleBurst(x, y, color, {
      count: 36,
      lifespan: 360,
      scale: { start: 1.05, end: 0 },
      speed: { min: 150, max: 360 },
    });

    const ring = this.add.circle(x, y, 20, color, 0.06);
    ring.setStrokeStyle(3, color, 0.9);
    ring.setDepth(12);
    ring.setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: ring,
      alpha: 0,
      scale: 2.4,
      duration: 260,
      ease: "Quad.easeOut",
      onComplete: () => ring.destroy(),
    });
  }

  private emitDodgeDust(x: number, y: number) {
    const emitter = this.add.particles(x, y, FX_PARTICLE_KEY, {
      alpha: { start: 0.58, end: 0 },
      angle: { min: 185, max: 355 },
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
      gravityY: -40,
      lifespan: 520,
      scale: { start: 1.25, end: 0.1 },
      speed: { min: 40, max: 170 },
      tint: 0x9fe2ff,
    });

    emitter.setDepth(2);
    emitter.explode(34, x, y);
    this.time.delayedCall(620, () => emitter.destroy());
  }

  private emitSlashTrail(startX: number, startY: number, endX: number, endY: number, color: number) {
    const midpointX = (startX + endX) / 2;
    const midpointY = (startY + endY) / 2;
    const angle = Phaser.Math.RadToDeg(Math.atan2(endY - startY, endX - startX));
    const length = Math.hypot(endX - startX, endY - startY);
    const slash = this.add.rectangle(midpointX, midpointY, length, 9, color, 0.42);

    slash.setAngle(angle);
    slash.setDepth(12);
    slash.setBlendMode(Phaser.BlendModes.ADD);
    this.emitParticleBurst(endX, endY, color, {
      count: 18,
      gravityY: 180,
      lifespan: 320,
      scale: { start: 0.95, end: 0 },
      speed: { min: 90, max: 250 },
    });
    this.tweens.add({
      targets: slash,
      alpha: 0,
      scaleX: 0.28,
      duration: 180,
      ease: "Quad.easeOut",
      onComplete: () => slash.destroy(),
    });
  }

  private getToneColor(tone: EffectTone) {
    if (tone === "good") {
      return "#9fe2b1";
    }

    if (tone === "bad" || tone === "damage") {
      return "#f07a6a";
    }

    if (tone === "block") {
      return "#a8b8ff";
    }

    return "#f7dca2";
  }

  private getAttackColor(pattern: AttackPattern) {
    if (pattern.id === "heavy-overhead") {
      return "#f07a6a";
    }

    if (pattern.id === "three-hit-combo") {
      return "#a8b8ff";
    }

    return "#f7dca2";
  }

  private handleResize() {
    if (!this.sceneReady) {
      return;
    }

    const { width, height } = this.scale;

    this.playerHome = { x: width * 0.25, y: height - PLAYER_BOTTOM_OFFSET };
    this.enemyHomes = this.getEnemyHomes(this.enemyCount);
    this.enemyHome = this.enemyHomes[this.activeEnemyIndex] ?? this.enemyHomes[0];
    this.player.setPosition(this.playerHome.x, this.playerHome.y);
    this.enemies.forEach((enemy, index) => {
      const home = this.enemyHomes[index];
      enemy.setPosition(home.x, home.y);
      this.syncEnemyHealthHud(this.enemyStates[index], index, index === this.activeEnemyIndex);
    });
    this.fitBackgroundToCanvas();
    this.fitAtmosphereToCanvas();
    this.publishActorBounds();
  }

  private fitBackgroundToCanvas() {
    if (!this.background) {
      return;
    }

    const { width, height } = this.scale;

    this.background.setPosition(width / 2, height / 2);
    this.background.setDisplaySize(width, height);
  }

  private fitAtmosphereToCanvas() {
    if (!this.atmosphere) {
      return;
    }

    const { width, height } = this.scale;
    this.atmosphere.setPosition(width / 2, height / 2);
    this.atmosphere.setSize(width, height);
  }

  private setTextureSmoothing() {
    this.textures.get(BATTLEFIELD_BACKGROUND_KEY).setFilter(Phaser.Textures.FilterMode.LINEAR);
    if (this.textures.exists(PLAYER_SPRITE_KEY)) {
      this.textures.get(PLAYER_SPRITE_KEY).setFilter(Phaser.Textures.FilterMode.LINEAR);
    }
    for (const enemy of this.enemyStates) {
      const textureKey = getEnemySpriteKey(enemy.image);
      if (this.textures.exists(textureKey)) {
        this.textures.get(textureKey).setFilter(Phaser.Textures.FilterMode.LINEAR);
      }
    }
  }

  private publishActorBounds() {
    if (!this.sceneReady || !this.player || this.enemies.length === 0) {
      return;
    }

    const canvasBounds = this.game.canvas.getBoundingClientRect();
    const enemyBoundsById: Record<string, DOMRect> = {};

    this.enemies.forEach((enemy, index) => {
      const enemyId = this.enemyStates[index]?.id ?? `enemy-${index + 1}`;
      enemyBoundsById[enemyId] = new DOMRect(
        canvasBounds.left + enemy.x - ACTOR_BOUNDS_WIDTH / 2,
        canvasBounds.top + enemy.y - ACTOR_BOUNDS_HEIGHT / 2 - 10,
        ACTOR_BOUNDS_WIDTH,
        ACTOR_BOUNDS_HEIGHT,
      );
    });

    const enemyBounds = new DOMRect(
      canvasBounds.left + this.enemy.x - ACTOR_BOUNDS_WIDTH / 2,
      canvasBounds.top + this.enemy.y - ACTOR_BOUNDS_HEIGHT / 2 - 10,
      ACTOR_BOUNDS_WIDTH,
      ACTOR_BOUNDS_HEIGHT,
    );
    const playerBounds = new DOMRect(
      canvasBounds.left + this.player.x - ACTOR_BOUNDS_WIDTH / 2,
      canvasBounds.top + this.player.y - ACTOR_BOUNDS_HEIGHT / 2 - 10,
      ACTOR_BOUNDS_WIDTH,
      ACTOR_BOUNDS_HEIGHT,
    );
    this.eventsBridge.onEnemyBoundsChange(enemyBounds);
    this.eventsBridge.onEnemyBoundsListChange(enemyBoundsById);
    this.eventsBridge.onPlayerBoundsChange(playerBounds);
  }
}
