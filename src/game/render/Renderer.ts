import { Container, Sprite, TilingSprite, type Application } from 'pixi.js';
import { SHIP_ART_FORWARD, type GameTextures } from '../assets';
import type { Simulation } from '../sim/Simulation';

/**
 * Mirrors simulation state into a Pixi scene. It only reads from the simulation and never mutates it.
 * The world is authored in arena units and scaled uniformly to fit the canvas (letterboxed).
 */
export class Renderer {
  private readonly world = new Container();
  private readonly playerSprite: Sprite;

  constructor(
    private readonly app: Application,
    private readonly sim: Simulation,
    textures: GameTextures,
  ) {
    const { width, height } = sim.config.arena;

    const water = new TilingSprite({ texture: textures.water, width, height });
    this.world.addChild(water);

    for (const island of sim.islands) {
      const s = new Sprite(textures.islands[island.art]);
      s.anchor.set(0.5);
      // Art is a little larger than the collision circle so the beach edge is walkable-looking, not clipped.
      s.width = island.radius * 2.3;
      s.height = island.radius * 2.3;
      s.position.set(island.x, island.y);
      this.world.addChild(s);
    }

    this.playerSprite = new Sprite(textures.ships.blue[0]);
    this.playerSprite.anchor.set(0.5);
    this.world.addChild(this.playerSprite);

    app.stage.addChild(this.world);
    app.renderer.on('resize', this.layout);
    this.layout();
    this.update();
  }

  /** Fits the arena into the canvas, preserving aspect ratio. */
  private readonly layout = (): void => {
    const { width, height } = this.sim.config.arena;
    const scale = Math.min(this.app.screen.width / width, this.app.screen.height / height);
    this.world.scale.set(scale);
    this.world.position.set((this.app.screen.width - width * scale) / 2, (this.app.screen.height - height * scale) / 2);
  };

  update(): void {
    const p = this.sim.player;
    this.playerSprite.position.set(p.x, p.y);
    this.playerSprite.rotation = p.angle - SHIP_ART_FORWARD;
  }

  destroy(): void {
    this.app.renderer.off('resize', this.layout);
    this.app.stage.removeChild(this.world);
    // Textures are shared/cached by the asset loader, so only the display objects are destroyed here.
    this.world.destroy({ children: true });
  }
}
