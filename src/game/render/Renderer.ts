import { Container, Sprite, TilingSprite, type Application, type Texture } from 'pixi.js';
import { SHIP_ART_FORWARD, type GameTextures, type ShipColor } from '../assets';
import type { Simulation } from '../sim/Simulation';
import { PLAYER_ID, type SimEvent } from '../sim/types';
import { damageStage, flameCount, type DamageStage } from './damage';
import { Effects } from './Effects';
import { HealthBar, type BarSide } from './HealthBar';

/** How long a ship stays tinted after being hit (seconds). */
const HIT_FLASH = 0.16;
/** Camera shake when the player is hit: duration (s) and max offset (world units). */
const SHAKE_TIME = 0.22;
const SHAKE_SIZE = 5;
/** Players who ask the OS for less motion get no camera shake and no flame flicker (hits still flash and show impacts). */
const reducedMotion = (): boolean => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Health bars float this far above the ship's centre, beyond its radius. */
const BAR_GAP = 20;
/** Deck spots (ship-art pixels; the art faces +y) where fires break out as damage grows. */
const FLAME_SPOTS = [
  { x: -9, y: 10 },
  { x: 10, y: -14 },
] as const;
/** Flame frame swaps per second, and flame size relative to the art. */
const FLAME_FPS = 9;
const FLAME_SCALE = 1.05;

/**
 * Sprite + health bar for one ship. Sprite art swaps as health drops, fires break out on heavily damaged
 * hulls, and a red tint flashes on hits.
 */
class ShipView {
  readonly sprite: Sprite;
  readonly bar: HealthBar;
  private readonly flames: Sprite[];
  private stage: DamageStage | -1 = -1;
  private flash = 0;
  private flicker = 0;

  constructor(
    private readonly art: Texture[],
    private readonly thresholds: readonly [number, number, number],
    healthArt: GameTextures['healthBar'],
    side: BarSide,
    private readonly fireArt: Texture[],
    fireLayer: Container,
    /** False with prefers-reduced-motion: flames are drawn but do not flicker. */
    private readonly animate: boolean,
  ) {
    this.sprite = new Sprite(art[0]);
    this.sprite.anchor.set(0.5);
    this.bar = new HealthBar(healthArt, side);
    this.flames = FLAME_SPOTS.map(() => {
      const flame = new Sprite(fireArt[0]);
      flame.anchor.set(0.5, 0.85);
      flame.scale.set(FLAME_SCALE);
      flame.visible = false;
      fireLayer.addChild(flame);
      return flame;
    });
  }

  hit(): void {
    this.flash = HIT_FLASH;
  }

  update(x: number, y: number, angle: number, radius: number, healthFraction: number, dt: number): void {
    this.sprite.position.set(x, y);
    this.sprite.rotation = angle - SHIP_ART_FORWARD;

    const stage = damageStage(healthFraction, this.thresholds);
    if (stage !== this.stage) {
      this.stage = stage;
      const tex = this.art[stage];
      if (tex) this.sprite.texture = tex;
    }

    this.flash = Math.max(0, this.flash - dt);
    this.sprite.tint = this.flash > 0 ? 0xff7070 : 0xffffff;

    this.bar.view.position.set(x, y - radius - BAR_GAP);
    this.bar.set(healthFraction);
    this.updateFlames(x, y, stage, dt);
  }

  /** Flames stay upright on screen and ride on the hull; they flicker on wall time and freeze with dt = 0. */
  private updateFlames(x: number, y: number, stage: DamageStage, dt: number): void {
    const lit = flameCount(stage);
    if (this.animate) this.flicker += dt;
    const cos = Math.cos(this.sprite.rotation);
    const sin = Math.sin(this.sprite.rotation);
    this.flames.forEach((flame, i) => {
      const spot = FLAME_SPOTS[i];
      flame.visible = i < lit && spot !== undefined;
      if (!flame.visible || !spot) return;
      flame.position.set(x + spot.x * cos - spot.y * sin, y + spot.x * sin + spot.y * cos);
      const frame = this.fireArt[(Math.floor(this.flicker * FLAME_FPS) + i) % this.fireArt.length];
      if (frame) flame.texture = frame;
      flame.scale.set(FLAME_SCALE, this.animate ? FLAME_SCALE * (0.9 + 0.12 * Math.sin((this.flicker + i) * 13)) : FLAME_SCALE);
    });
  }

  destroy(): void {
    this.sprite.destroy();
    this.bar.destroy();
    for (const flame of this.flames) flame.destroy();
  }
}

/**
 * Mirrors simulation state into a Pixi scene. It only reads from the simulation and never mutates it.
 * The world is authored in arena units and scaled uniformly to fit the canvas (letterboxed).
 */
export class Renderer {
  private readonly world = new Container();
  private readonly shipLayer = new Container();
  private readonly fireLayer = new Container();
  private readonly ballLayer = new Container();
  private readonly barLayer = new Container();
  private readonly effects: Effects;
  private readonly textures: GameTextures;
  private readonly player: ShipView;
  /** One view per live enemy id; removed and destroyed when the enemy leaves the simulation. */
  private readonly enemyViews = new Map<number, ShipView>();
  /** Sprite pool for cannonballs: grown on demand, hidden when unused, destroyed with the world. */
  private readonly ballPool: Sprite[] = [];
  private shake = 0;
  private readonly calm = reducedMotion();
  private readonly shakeSize = this.calm ? 0 : SHAKE_SIZE;
  private baseX = 0;
  private baseY = 0;

  constructor(
    private readonly app: Application,
    private readonly sim: Simulation,
    textures: GameTextures,
  ) {
    this.textures = textures;
    const { width, height } = sim.config.arena;

    const water = new TilingSprite({ texture: textures.water, width, height });
    this.world.addChild(water);

    for (const island of sim.islands) {
      const s = new Sprite(textures.islands[island.art]);
      s.anchor.set(0.5);
      // Art is a little larger than the collision circle so the beach edge is not clipped.
      s.width = island.radius * 2.3;
      s.height = island.radius * 2.3;
      s.position.set(island.x, island.y);
      this.world.addChild(s);
    }

    this.world.addChild(this.shipLayer, this.fireLayer, this.ballLayer);
    this.effects = new Effects(this.world, textures);
    this.world.addChild(this.barLayer);

    this.player = this.makeShip('blue', 'friend');
    app.stage.addChild(this.world);
    app.renderer.on('resize', this.layout);
    this.layout();
    this.update(0);
  }

  private makeShip(color: ShipColor, side: BarSide): ShipView {
    const view = new ShipView(
      this.textures.ships[color],
      this.sim.config.feedback.damageStageThresholds,
      this.textures.healthBar,
      side,
      this.textures.fire,
      this.fireLayer,
      !this.calm,
    );
    this.shipLayer.addChild(view.sprite);
    this.barLayer.addChild(view.bar.view);
    return view;
  }

  /** Fits the arena into the canvas, preserving aspect ratio. */
  private readonly layout = (): void => {
    const { width, height } = this.sim.config.arena;
    const scale = Math.min(this.app.screen.width / width, this.app.screen.height / height);
    this.world.scale.set(scale);
    this.baseX = (this.app.screen.width - width * scale) / 2;
    this.baseY = (this.app.screen.height - height * scale) / 2;
    this.world.position.set(this.baseX, this.baseY);
  };

  /** Turns simulation events into effects. Call once per frame with the drained events. */
  handleEvents(events: SimEvent[]): void {
    for (const ev of events) {
      switch (ev.type) {
        case 'shot':
          this.effects.muzzleFlash(ev.x, ev.y);
          break;
        case 'splash':
          this.effects.splash(ev.x, ev.y);
          break;
        case 'hit':
          this.effects.impact(ev.x, ev.y);
          if (ev.target === 'player') {
            this.player.hit();
            this.shake = SHAKE_TIME;
          } else {
            this.enemyViews.get(ev.targetId)?.hit();
          }
          break;
        case 'destroyed':
          this.effects.explosion(ev.x, ev.y);
          if (ev.targetId === PLAYER_ID) this.shake = SHAKE_TIME * 2;
          break;
      }
    }
  }

  /** `dt` is wall-clock seconds since the last frame; used only for cosmetic timers. */
  update(dt: number): void {
    const { player: p } = this.sim;
    this.player.update(p.x, p.y, p.angle, p.radius, p.health / p.maxHealth, dt);
    this.syncEnemies(dt);
    this.syncProjectiles();
    this.effects.update(dt);

    this.shake = Math.max(0, this.shake - dt);
    const amp = this.shake > 0 ? (this.shake / SHAKE_TIME) * this.shakeSize : 0;
    this.world.position.set(this.baseX + (Math.random() - 0.5) * 2 * amp, this.baseY + (Math.random() - 0.5) * 2 * amp);
  }

  private syncEnemies(dt: number): void {
    const live = new Set<number>();
    for (const e of this.sim.enemies) {
      live.add(e.id);
      let view = this.enemyViews.get(e.id);
      if (!view) {
        view = this.makeShip(e.kind === 'chaser' ? 'black' : 'red', 'foe');
        this.enemyViews.set(e.id, view);
      }
      view.update(e.x, e.y, e.angle, e.radius, e.health / e.maxHealth, dt);
    }
    for (const [id, view] of this.enemyViews) {
      if (live.has(id)) continue;
      view.destroy();
      this.enemyViews.delete(id);
    }
  }

  private syncProjectiles(): void {
    const balls = this.sim.projectiles;
    for (let i = 0; i < balls.length; i++) {
      let sprite = this.ballPool[i];
      if (!sprite) {
        sprite = new Sprite(this.textures.cannonBall);
        sprite.anchor.set(0.5);
        this.ballLayer.addChild(sprite);
        this.ballPool.push(sprite);
      }
      const b = balls[i];
      if (!b) continue;
      sprite.visible = true;
      sprite.position.set(b.x, b.y);
    }
    for (let i = balls.length; i < this.ballPool.length; i++) {
      const sprite = this.ballPool[i];
      if (sprite) sprite.visible = false;
    }
  }

  destroy(): void {
    this.app.renderer.off('resize', this.layout);
    this.app.stage.removeChild(this.world);
    // Textures are shared/cached by the asset loader, so only the display objects are destroyed here.
    this.world.destroy({ children: true });
    this.enemyViews.clear();
    this.ballPool.length = 0;
  }
}
