import { Container, Graphics, Sprite } from 'pixi.js';
import type { GameTextures } from '../assets';

/** Width of a bar in world units; height follows the art's aspect ratio. */
const BAR_WIDTH = 78;
/** Below this fraction the fill turns red. */
const RED_BELOW = 0.35;

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

  constructor(art: GameTextures['healthBar']) {
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
    const low = f < RED_BELOW;
    this.green.visible = !low;
    this.red.visible = low;
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }
}
