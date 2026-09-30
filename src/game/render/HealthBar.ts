import { Container, Graphics, Sprite } from 'pixi.js';
import type { GameTextures } from '../assets';
import { gameConfig } from '../gameConfig';

/** Width of a bar in world units; height follows the art's aspect ratio. */
const BAR_WIDTH = 78;
/** At or below this fraction the fill turns red (same threshold as the HUD and the screen-reader warning). */
const RED_BELOW = gameConfig.feedback.lowHealthFraction;

/** `friend` bars are green and turn red when low; `foe` bars are always red, so sides read at a glance. */
export type BarSide = 'friend' | 'foe';

/**
 * Health indicator drawn above a ship, using the frame/fill art from the UI atlas. The fill is
 * revealed left-to-right through a mask (as the atlas metadata prescribes) rather than being stretched.
 */
export class HealthBar {
  readonly view = new Container();
  private readonly green: Sprite;
  private readonly red: Sprite;
  private readonly mask = new Graphics();
  private readonly fillRect: GameTextures['healthBar']['fillRect'];
  private fraction = -1;

  constructor(
    art: GameTextures['healthBar'],
    private readonly side: BarSide,
  ) {
    this.fillRect = art.fillRect;
    const frame = new Sprite(art.frame);
    this.green = new Sprite(art.green);
    this.red = new Sprite(art.red);
    this.view.addChild(frame, this.green, this.red, this.mask);
    this.green.mask = this.mask;
    this.red.mask = this.mask;
    const scale = BAR_WIDTH / art.frame.width;
    this.view.scale.set(scale);
    // Pivot at the bar's bottom-centre so the caller positions it just above a ship.
    this.view.pivot.set(art.frame.width / 2, art.frame.height);
  }

  /** Redraws only when the value actually changed. */
  set(fraction: number): void {
    const f = Math.min(1, Math.max(0, fraction));
    if (f === this.fraction) return;
    this.fraction = f;
    const { x, y, w, h } = this.fillRect;
    this.mask.clear().rect(x, y, w * f, h).fill(0xffffff);
    const low = this.side === 'foe' || f <= RED_BELOW;
    this.green.visible = !low;
    this.red.visible = low;
  }

  destroy(): void {
    // context: true — Pixi 8 only frees a Graphics' own context on a bare destroy(); with options it must be asked.
    this.view.destroy({ children: true, context: true });
  }
}
