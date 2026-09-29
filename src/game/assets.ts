import { Assets, Rectangle, Texture } from 'pixi.js';

/**
 * Asset manifest + loader. Files are imported through `import.meta.glob` with `?url`, so only the
 * files listed here end up in the bundle (the raw assets/ folder is ~30 MB with vectors and retina art).
 */
const url = <T extends string>(map: Record<string, T>, file: string): T => {
  const hit = Object.entries(map).find(([path]) => path.endsWith(`/${file}`));
  if (!hit) throw new Error(`Asset not found in manifest: ${file}`);
  return hit[1];
};

const shipUrls = import.meta.glob<string>('../../assets/png/default/ships/ship_*.png', {
  eager: true,
  query: '?url',
  import: 'default',
});
const partUrls = import.meta.glob<string>('../../assets/png/default/ship_parts/cannon_ball.png', {
  eager: true,
  query: '?url',
  import: 'default',
});
const effectUrls = import.meta.glob<string>('../../assets/png/default/effects/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
});
const tileUrls = import.meta.glob<string>('../../assets/png/default/tiles/tile_73.png', {
  eager: true,
  query: '?url',
  import: 'default',
});
const tileSheetUrls = import.meta.glob<string>('../../assets/tilesheet/tiles_sheet.png', {
  eager: true,
  query: '?url',
  import: 'default',
});

/**
 * The ship art faces DOWN (+y) at rotation 0. The simulation's heading 0 is +x, so a sprite must be
 * rotated by `heading - SHIP_ART_FORWARD` to point where the ship moves.
 */
export const SHIP_ART_FORWARD = Math.PI / 2;

export type ShipColor = 'white' | 'black' | 'red' | 'green' | 'blue' | 'yellow';
const SHIP_COLORS: ShipColor[] = ['white', 'black', 'red', 'green', 'blue', 'yellow'];
/** ship_1..6 are intact, 7..12 lightly damaged, 13..18 heavily damaged, 19..24 wrecks (same colour order). */
export const SHIP_DAMAGE_STAGES = 4;

export interface GameTextures {
  /** ships[stage][colour], stage 0 = intact. */
  ships: Record<ShipColor, Texture[]>;
  cannonBall: Texture;
  explosion: Texture[];
  fire: Texture[];
  water: Texture;
  islands: { sand: Texture; grass: Texture };
}

export type LoadProgress = (fraction: number) => void;

/** Loads every texture the combat scene needs. Rejects if ANY asset fails so the UI can offer a retry. */
export async function loadGameAssets(onProgress: LoadProgress = () => undefined): Promise<GameTextures> {
  const shipFiles = Array.from({ length: SHIP_DAMAGE_STAGES * SHIP_COLORS.length }, (_, i) => `ship_${String(i + 1)}.png`);
  const effectFiles = ['explosion_1.png', 'explosion_2.png', 'explosion_3.png', 'fire_1.png', 'fire_2.png'];

  const jobs: [string, string][] = [
    ...shipFiles.map((f): [string, string] => [f, url(shipUrls, f)]),
    ['cannon_ball.png', url(partUrls, 'cannon_ball.png')],
    ...effectFiles.map((f): [string, string] => [f, url(effectUrls, f)]),
    ['tile_73.png', url(tileUrls, 'tile_73.png')],
    ['tiles_sheet.png', url(tileSheetUrls, 'tiles_sheet.png')],
  ];

  let done = 0;
  const loaded = new Map<string, Texture>();
  await Promise.all(
    jobs.map(async ([name, src]) => {
      loaded.set(name, await Assets.load<Texture>(src));
      done += 1;
      onProgress(done / jobs.length);
    }),
  );

  const get = (name: string): Texture => {
    const tex = loaded.get(name);
    if (!tex) throw new Error(`Texture not loaded: ${name}`);
    return tex;
  };

  const ships = {} as Record<ShipColor, Texture[]>;
  SHIP_COLORS.forEach((color, c) => {
    ships[color] = Array.from({ length: SHIP_DAMAGE_STAGES }, (_, stage) => get(`ship_${String(stage * SHIP_COLORS.length + c + 1)}.png`));
  });

  const sheet = get('tiles_sheet.png');
  const crop = (x: number, y: number, w: number, h: number) => new Texture({ source: sheet.source, frame: new Rectangle(x, y, w, h) });

  return {
    ships,
    cannonBall: get('cannon_ball.png'),
    explosion: ['explosion_1.png', 'explosion_2.png', 'explosion_3.png'].map(get),
    fire: ['fire_1.png', 'fire_2.png'].map(get),
    water: get('tile_73.png'),
    // Regions of tiles_sheet.png (64px tiles): plain sand blob and the grassy island.
    islands: { sand: crop(0, 0, 192, 192), grass: crop(320, 0, 256, 256) },
  };
}
