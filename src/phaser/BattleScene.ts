import Phaser from "phaser";
import { attackPatterns, type AttackId, type AttackPattern } from "../game/combat/attackPatterns";
import type { CombatPhase } from "../game/combat/types";

type EffectTarget = "player" | "enemy";
type EffectTone = "good" | "bad" | "neutral" | "damage" | "block";

export type BattleSceneEvents = {
  onEnemyBoundsChange: (bounds: DOMRect) => void;
  onPlayerBoundsChange: (bounds: DOMRect) => void;
};

type SceneData = BattleSceneEvents;

const BATTLEFIELD_BACKGROUND_KEY = "castle-background";
const PLAYER_SPRITE_KEY = "gutz-player";
const ENEMY_SPRITE_KEY = "griffith-enemy";
const publicAssetPath = (filename: string) => `${import.meta.env.BASE_URL}${filename}`;
const BATTLEFIELD_BACKGROUND_PATH = publicAssetPath("castle-background.png");
const PLAYER_SPRITE_PATH = publicAssetPath("gutz.png");
const ENEMY_SPRITE_PATH = publicAssetPath("griffith.png");
const ACTOR_SPRITE_MAX_WIDTH = 220;
const ACTOR_SPRITE_MAX_HEIGHT = 300;
const ACTOR_BOUNDS_WIDTH = 210;
const ACTOR_BOUNDS_HEIGHT = 315;
const DEFENSE_ANIMATION_COOLDOWN_MS = 520;

export class BattleScene extends Phaser.Scene {
  private background?: Phaser.GameObjects.Image;
  private atmosphere?: Phaser.GameObjects.Rectangle;
  private enemy!: Phaser.GameObjects.Container;
  private player!: Phaser.GameObjects.Container;
  private weapon?: Phaser.GameObjects.Rectangle;
  private enemyHome = { x: 0, y: 0 };
  private playerHome = { x: 0, y: 0 };
  private attackCue?: Phaser.GameObjects.Text;
  private attackTell?: Phaser.GameObjects.Rectangle;
  private attackTimers: Phaser.Time.TimerEvent[] = [];
  private eventsBridge!: BattleSceneEvents;
  private phase: CombatPhase = "playerTurn";
  private attackId: AttackId = "quick-slash";
  private attackRunning = false;
  private parryReadyAt = 0;
  private dodgeReadyAt = 0;

  constructor() {
    super("BattleScene");
  }

  init(data: SceneData) {
    this.eventsBridge = data;
  }

  preload() {
    this.load.image(BATTLEFIELD_BACKGROUND_KEY, BATTLEFIELD_BACKGROUND_PATH);
    this.load.image(PLAYER_SPRITE_KEY, PLAYER_SPRITE_PATH);
    this.load.image(ENEMY_SPRITE_KEY, ENEMY_SPRITE_PATH);
  }

  create() {
    const { width, height } = this.scale;

    this.cameras.main.setBackgroundColor("#020914");
    this.setTextureSmoothing();

    this.background = this.add.image(width / 2, height / 2, BATTLEFIELD_BACKGROUND_KEY);
    this.background.setDepth(-20);
    this.fitBackgroundToCanvas();

    this.atmosphere = this.add.rectangle(width / 2, height / 2, width, height, 0x020914, 0.16);
    this.atmosphere.setDepth(-19);

    this.playerHome = { x: width * 0.25, y: height - 360 };
    this.enemyHome = { x: width * 0.75, y: height - 375 };

    this.player = this.createPlayerActor(this.playerHome.x, this.playerHome.y);
    this.enemy = this.createEnemyActor(this.enemyHome.x, this.enemyHome.y);

    this.input.keyboard?.on("keydown-A", () => this.parryPlayer());
    this.input.keyboard?.on("keydown-S", () => this.dodgePlayer());
    this.publishActorBounds();
    this.scale.on("resize", this.handleResize, this);
  }

  setAttackId(attackId: AttackId) {
    this.attackId = attackId;
  }

  setPhase(phase: CombatPhase) {
    if (this.phase === phase && phase !== "enemyAttack") {
      return;
    }

    this.phase = phase;

    if (phase === "enemyAttack" && !this.attackRunning) {
      this.runAttack(attackPatterns[this.attackId]);
      return;
    }

    if (phase !== "enemyAttack" && this.attackRunning) {
      this.completeEnemyAttack();
    }
  }

  flashEnemy() {
    this.tweens.killTweensOf(this.enemy);
    this.enemy.setAlpha(1);
    this.enemy.setPosition(this.enemyHome.x, this.enemyHome.y);
    this.enemy.setScale(1);
    this.showActorWash("enemy", 0xf07a6a);
    this.showImpactBurst(this.enemy.x - 18, this.enemy.y - 64, 0xf07a6a);

    this.tweens.add({
      targets: this.enemy,
      x: this.enemyHome.x + 46,
      y: this.enemyHome.y - 8,
      scaleX: 1.2,
      scaleY: 0.88,
      alpha: 0.62,
      duration: 130,
      ease: "Quad.easeOut",
      onComplete: () => {
        this.tweens.add({
          targets: this.enemy,
          x: this.enemyHome.x,
          y: this.enemyHome.y,
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

  playCardImpact(label: string) {
    const card = this.add.rectangle(this.player.x + 42, this.player.y - 82, 48, 68, 0xf5cf72, 0.22);
    card.setStrokeStyle(2, 0xf5cf72, 0.92);
    card.setDepth(8);
    card.setAngle(-8);
    this.showFloatingText("enemy", label, "damage");

    this.tweens.add({
      targets: card,
      x: this.enemy.x - 18,
      y: this.enemy.y - 62,
      angle: 12,
      scale: 0.5,
      duration: 360,
      ease: "Cubic.easeIn",
      onComplete: () => {
        card.destroy();
        this.flashEnemy();
        this.showImpactBurst(this.enemy.x - 26, this.enemy.y - 62, 0xf5cf72);
      },
    });
  }

  showFloatingText(target: EffectTarget, text: string, tone: EffectTone = "neutral") {
    const actor = target === "enemy" ? this.enemy : this.player;
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

  private createEnemyActor(x: number, y: number) {
    if (!this.textures.exists(ENEMY_SPRITE_KEY)) {
      return this.createActor(x, y, 0x9d514c, "RIVAL");
    }

    const container = this.add.container(x, y);
    const shadow = this.add.ellipse(0, 62, 132, 24, 0x000000, 0.38);
    const sprite = this.add.image(0, 0, ENEMY_SPRITE_KEY);

    sprite.setOrigin(0.5, 0.72);
    sprite.setFlipX(true);
    this.fitSpriteToBox(sprite, ACTOR_SPRITE_MAX_WIDTH, ACTOR_SPRITE_MAX_HEIGHT);
    container.add([shadow, sprite]);
    return container;
  }

  private fitSpriteToBox(sprite: Phaser.GameObjects.Image, maxWidth: number, maxHeight: number) {
    const texture = sprite.texture.getSourceImage() as HTMLImageElement;
    const scale = Math.min(maxWidth / texture.width, maxHeight / texture.height);
    sprite.setScale(scale);
  }

  private runAttack(pattern: AttackPattern) {
    this.attackRunning = true;
    this.clearAttackTimers();

    this.attackCue?.destroy();
    this.attackCue = this.add.text(this.enemy.x, this.enemy.y - 168, pattern.name, {
      color: this.getAttackColor(pattern),
      fontFamily: "Arial, sans-serif",
      fontSize: "22px",
      fontStyle: "bold",
    }).setOrigin(0.5).setDepth(6).setAlpha(0.95);
    if (pattern.id === "quick-slash") {
      this.runQuickSlashVisual(pattern);
      return;
    }

    if (pattern.id === "heavy-overhead") {
      this.runHeavyOverheadVisual(pattern);
      return;
    }

    this.runThreeHitComboVisual(pattern);
  }

  private runQuickSlashVisual(pattern: AttackPattern) {
    this.resetEnemyPose();
    this.tweenWeapon({ angle: -42, duration: pattern.hits[0].atMs, ease: "Sine.easeOut" });

    this.tweens.add({
      targets: this.enemy,
      x: this.enemyHome.x - 58,
      scaleX: 1.08,
      duration: Math.max(120, pattern.hits[0].atMs - 80),
      ease: "Sine.easeInOut",
    });

    this.queueHitVisual(pattern.hits[0].atMs, 64, 100);
  }

  private runHeavyOverheadVisual(pattern: AttackPattern) {
    this.resetEnemyPose();
    this.enemy.setScale(1.06);
    this.tweenWeapon({
      angle: -86,
      scaleY: 1.18,
      duration: pattern.hits[0].atMs,
      ease: "Sine.easeInOut",
    });

    this.tweens.add({
      targets: this.enemy,
      y: this.enemyHome.y - 34,
      scaleY: 1.13,
      duration: Math.max(160, pattern.hits[0].atMs - 120),
      ease: "Sine.easeInOut",
    });

    this.queueHitVisual(pattern.hits[0].atMs, 86, 170);
  }

  private runThreeHitComboVisual(pattern: AttackPattern) {
    this.resetEnemyPose();
    const angles = [52, -56, 70];
    for (const [index, hit] of pattern.hits.entries()) {
      this.attackTimers.push(this.time.delayedCall(Math.max(0, hit.atMs - 220), () => {
        this.tweenWeapon({ angle: -angles[index], duration: 180, ease: "Sine.easeOut" });
        this.tweens.add({
          targets: this.enemy,
          x: this.enemyHome.x - (index % 2 === 0 ? 42 : 18),
          y: this.enemyHome.y + (index === 1 ? -14 : 0),
          duration: 140,
          ease: "Sine.easeOut",
        });
      }));
      this.queueHitVisual(hit.atMs, angles[index], index === 2 ? 140 : 80);
    }
  }

  private queueHitVisual(atMs: number, angle: number, shakeMs: number) {
    this.attackTimers.push(this.time.delayedCall(Math.max(0, atMs - 140), () => {
      this.pulseActor(this.enemy, 1.04, 95);
    }));

    this.attackTimers.push(this.time.delayedCall(atMs, () => {
      this.tweenWeapon({ angle, scaleY: 1, duration: 150, ease: "Quad.easeIn" });
      this.tweens.add({
        targets: this.enemy,
        x: this.enemyHome.x,
        y: this.enemyHome.y,
        scaleX: 1,
        scaleY: 1,
        duration: 150,
        ease: "Back.easeOut",
      });
      this.showImpactBurst(this.player.x + 20, this.player.y - 58, 0xf7dca2);
      this.cameras.main.shake(shakeMs, 0.004);
    }));
  }

  private completeEnemyAttack() {
    if (!this.attackRunning) {
      return;
    }

    this.attackRunning = false;
    this.clearAttackTimers();
    this.resetWeapon();
    this.resetEnemyPose();
    this.attackCue?.destroy();
    this.attackCue = undefined;
    this.attackTell?.destroy();
    this.attackTell = undefined;
  }

  private clearAttackTimers() {
    for (const timer of this.attackTimers) {
      timer.remove(false);
    }
    this.attackTimers = [];
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

  private resetEnemyPose() {
    this.tweens.killTweensOf(this.enemy);
    this.enemy.setPosition(this.enemyHome.x, this.enemyHome.y);
    this.enemy.setScale(1);
    this.enemy.setAlpha(1);
    this.publishActorBounds();
  }

  showReactionLabel(label: string, tone: "good" | "bad" | "neutral" = "neutral") {
    if (this.phase !== "enemyAttack" || !this.attackRunning) {
      return;
    }

    this.resetWeapon();
    this.attackCue?.setText(label);
    this.attackCue?.setColor(tone === "good" ? "#9fe2b1" : tone === "bad" ? "#f07a6a" : "#f7dca2");
    this.attackCue?.setScale(1.18);
    this.tweens.add({
      targets: this.attackCue,
      scale: 1,
      duration: 160,
      ease: "Back.easeOut",
    });
    this.attackTell?.setStrokeStyle(3, tone === "good" ? 0x9fe2b1 : tone === "bad" ? 0xf07a6a : 0xf7dca2, 0.8);
    this.showImpactBurst(this.player.x + 20, this.player.y - 60, tone === "good" ? 0x9fe2b1 : tone === "bad" ? 0xf07a6a : 0xf7dca2);
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

  private showAttackBeat(angle: number) {
    const slash = this.add.line(
      0,
      0,
      this.enemy.x - 34,
      this.enemy.y - 84,
      this.player.x + 28,
      this.player.y - 58,
      0xf7dca2,
      0.72,
    );
    slash.setOrigin(0, 0);
    slash.setLineWidth(7, 2);
    slash.setDepth(7);
    slash.setAngle(angle > 0 ? -8 : 8);

    const warningRing = this.add.circle(this.player.x + 18, this.player.y - 58, 18, 0xf7dca2, 0.08);
    warningRing.setStrokeStyle(3, 0xf7dca2, 0.8);
    warningRing.setDepth(8);

    this.tweens.add({
      targets: slash,
      alpha: 0,
      duration: 280,
      ease: "Quad.easeOut",
      onComplete: () => slash.destroy(),
    });
    this.tweens.add({
      targets: warningRing,
      scale: 1.9,
      alpha: 0,
      duration: 220,
      ease: "Quad.easeOut",
      onComplete: () => warningRing.destroy(),
    });
  }

  private showImpactBurst(x: number, y: number, color: number) {
    const burst = this.add.circle(x, y, 12, color, 0.12);
    burst.setStrokeStyle(3, color, 0.88);
    burst.setDepth(10);
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

  private createAttackTell(pattern: AttackPattern) {
    this.attackTell?.destroy();
    const color = pattern.id === "heavy-overhead" ? 0xf07a6a : pattern.id === "three-hit-combo" ? 0x8fa0de : 0xf5cf72;
    this.attackTell = this.add.rectangle(this.enemy.x, this.enemy.y - 15, 150, 230, color, 0.08);
    this.attackTell.setStrokeStyle(3, color, 0.56);
    this.attackTell.setDepth(4);
    this.tweens.add({
      targets: this.attackTell,
      alpha: 0.22,
      yoyo: true,
      repeat: -1,
      duration: pattern.id === "heavy-overhead" ? 520 : 260,
      ease: "Sine.easeInOut",
    });
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
    this.fitBackgroundToCanvas();
    this.fitAtmosphereToCanvas();
    this.publishActorBounds();
  }

  private fitBackgroundToCanvas() {
    if (!this.background) {
      return;
    }

    const { width, height } = this.scale;
    const texture = this.background.texture.getSourceImage() as HTMLImageElement;
    const scale = Math.max(width / texture.width, height / texture.height);

    this.background.setPosition(width / 2, height / 2);
    this.background.setScale(scale);
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
    this.textures.get(PLAYER_SPRITE_KEY).setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.textures.get(ENEMY_SPRITE_KEY).setFilter(Phaser.Textures.FilterMode.LINEAR);
  }

  private publishActorBounds() {
    const canvasBounds = this.game.canvas.getBoundingClientRect();
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
    this.eventsBridge.onPlayerBoundsChange(playerBounds);
  }
}
