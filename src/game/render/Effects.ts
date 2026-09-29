import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import type { GameTextures } from '../assets';

interface Effect {
  node: Sprite | Graphics;
  age: number;
  life: number;
  /** Called every frame with progress 0..1. */
  tick: (progress: number) => void;
}

/**
 * Short-lived visual effects (muzzle flash, impacts, splashes, explosions). Every effect removes and
 * destroys its display object when it expires, and destroy() clears whatever is still running.
 */
export class Effects {
  private readonly layer = new Container();
  private effects: Effect[] = [];

  constructor(
    parent: Container,
    private readonly textures: GameTextures,
  ) {
    parent.addChild(this.layer);
  }

  private sprite(texture: Texture, x: number, y: number): Sprite {
    const s = new Sprite(texture);
    s.anchor.set(0.5);
    s.position.set(x, y);
    this.layer.addChild(s);
    return s;
  }

  /** Small flash at the cannon mouth. */
  muzzleFlash(x: number, y: number): void {
    const s = this.sprite(this.textures.explosion[2] ?? this.textures.cannonBall, x, y);
    s.scale.set(0.16);
    this.add({
      node: s,
      age: 0,
      life: 0.1,
      tick: (p) => {
        s.alpha = 1 - p;
        s.scale.set(0.16 + 0.12 * p);
      },
    });
  }

  /** Spark where a cannonball strikes a ship. */
  impact(x: number, y: number): void {
    const s = this.sprite(this.textures.explosion[1] ?? this.textures.cannonBall, x, y);
    s.rotation = Math.random() * Math.PI * 2;
    this.add({
      node: s,
      age: 0,
      life: 0.22,
      tick: (p) => {
        s.alpha = 1 - p * p;
        s.scale.set(0.35 + 0.35 * p);
      },
    });
  }

  /** Expanding ring where a cannonball hits an island. */
  splash(x: number, y: number): void {
    const g = new Graphics();
    g.position.set(x, y);
    this.layer.addChild(g);
    this.add({
      node: g,
      age: 0,
      life: 0.4,
      tick: (p) => {
        g.clear().circle(0, 0, 5 + 22 * p).stroke({ width: 3 * (1 - p) + 0.5, color: 0xe8f8ff, alpha: 1 - p });
      },
    });
  }

  /** Full explosion for a destroyed ship: three frames of art, growing and fading. */
  explosion(x: number, y: number): void {
    const frames = this.textures.explosion;
    const s = this.sprite(frames[0] ?? this.textures.cannonBall, x, y);
    this.add({
      node: s,
      age: 0,
      life: 0.7,
      tick: (p) => {
        const frame = frames[Math.min(frames.length - 1, Math.floor(p * frames.length))];
        if (frame) s.texture = frame;
        s.alpha = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
        s.scale.set(0.9 + 0.9 * p);
      },
    });
  }

  private add(e: Effect): void {
    e.tick(0);
    this.effects.push(e);
  }

  /** Advances all effects by `dt` seconds of wall time and removes finished ones. */
  update(dt: number): void {
    if (this.effects.length === 0) return;
    const alive: Effect[] = [];
    for (const e of this.effects) {
      e.age += dt;
      if (e.age >= e.life) {
        e.node.destroy();
      } else {
        e.tick(e.age / e.life);
        alive.push(e);
      }
    }
    this.effects = alive;
  }

  destroy(): void {
    this.effects = [];
    this.layer.destroy({ children: true });
  }
}
