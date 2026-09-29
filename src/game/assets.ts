import { ImageSource, Rectangle, Texture } from 'pixi.js';

/**
 * Asset manifest + loader. Files are imported through `import.meta.glob` with `?url`, so only the
 * files listed here end up in the bundle (the raw assets/ folder is ~30 MB with vectors and retina art).
 *
 * Textures are fetched by hand (fetch → createImageBitmap) instead of through Pixi's Assets cache so that
 * a failed load leaves nothing behind and a retry really hits the network again. Successful textures are
 * cached at module level and reused by every match (no reload, no re-decode).
 */
const glob = (m: Record<string, string>) => m;

const shipUrls = glob(import.meta.glob<string>('../../assets/png/default/ships/ship_*.png', { eager: true, query: '?url', import: 'default' }));
const partUrls = glob(import.meta.glob<string>('../../assets/png/default/ship_parts/cannon_ball.png', { eager: true, query: '?url', import: 'default' }));
const effectUrls = glob(import.meta.glob<string>('../../assets/png/default/effects/*.png', { eager: true, query: '?url', import: 'default' }));

// Tiles and HUD art ship in two densities; ships/effects/projectiles are the same file in both.
const waterUrls = {
  1: glob(import.meta.glob<string>('../../assets/png/default/tiles/tile_73.png', { eager: true, query: '?url', import: 'default' })),
  2: glob(import.meta.glob<string>('../../assets/png/retina/tiles/tile_73.png', { eager: true, query: '?url', import: 'default' })),
};
const barUrls = {
  1: glob(import.meta.glob<string>('../../assets/png/default/ui/hud/enemy_health_*.png', { eager: true, query: '?url', import: 'default' })),
  2: glob(import.meta.glob<string>('../../assets/png/retina/ui/hud/enemy_health_*.png', { eager: true, query: '?url', import: 'default' })),
};
const sheetUrls = {
  1: glob(import.meta.glob<string>('../../assets/tilesheet/tiles_sheet.png', { eager: true, query: '?url', import: 'default' })),
  2: glob(import.meta.glob<string>('../../assets/tilesheet/tiles_sheet_retina.png', { eager: true, query: '?url', import: 'default' })),
};

const url = (map: Record<string, string>, file: string): string => {
  const hit = Object.entries(map).find(([path]) => path.endsWith(`/${file}`));
  if (!hit) throw new Error(`Asset not found in manifest: ${file}`);
  return hit[1];
};

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
  /** ships[colour][stage], stage 0 = intact. */
  ships: Record<ShipColor, Texture[]>;
  cannonBall: Texture;
  explosion: Texture[];
  fire: Texture[];
  water: Texture;
  islands: { sand: Texture; grass: Texture };
  /** In-world health bar art (draw order: frame, then fill clipped from the left to `fillRect`). */
  healthBar: { frame: Texture; green: Texture; red: Texture; fillRect: { x: number; y: number; w: number; h: number } };
}

export type LoadProgress = (fraction: number) => void;

const cache = new Map<string, Texture>();
const inflight = new Map<string, Promise<Texture>>();

/** Fetches one PNG into a texture. `resolution` 2 marks @2x art so its logical size stays the same. */
function loadTexture(src: string, resolution: 1 | 2): Promise<Texture> {
  const key = `${String(resolution)}:${src}`;
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  const pending = inflight.get(key);
  if (pending) return pending;

  const job = (async () => {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`HTTP ${String(res.status)} while loading ${src}`);
    const bitmap = await createImageBitmap(await res.blob());
    const texture = new Texture({ source: new ImageSource({ resource: bitmap, resolution }) });
    cache.set(key, texture);
    return texture;
  })().finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, job);
  return job;
}

/** Density of the art to load for this screen. Only 1x and 2x exist. */
export const pickDensity = (pixelRatio: number): 1 | 2 => (pixelRatio >= 1.5 ? 2 : 1);

/**
 * Loads every texture the combat scene needs. Rejects if ANY asset fails, so the UI can show an error and
 * offer a retry before combat starts. `onProgress` receives 0..1 as files finish.
 */
export async function loadGameAssets(onProgress: LoadProgress = () => undefined, pixelRatio = 1): Promise<GameTextures> {
  const d = pickDensity(pixelRatio);
  const shipFiles = Array.from({ length: SHIP_DAMAGE_STAGES * SHIP_COLORS.length }, (_, i) => `ship_${String(i + 1)}.png`);

  const jobs: { name: string; src: string; resolution: 1 | 2 }[] = [
    ...shipFiles.map((f) => ({ name: f, src: url(shipUrls, f), resolution: 1 as const })),
    { name: 'cannon_ball.png', src: url(partUrls, 'cannon_ball.png'), resolution: 1 },
    ...['explosion_1.png', 'explosion_2.png', 'explosion_3.png', 'fire_1.png', 'fire_2.png'].map((f) => ({ name: f, src: url(effectUrls, f), resolution: 1 as const })),
    { name: 'tile_73.png', src: url(waterUrls[d], 'tile_73.png'), resolution: d },
    { name: 'tiles_sheet', src: Object.values(sheetUrls[d])[0] ?? '', resolution: d },
    ...['enemy_health_frame.png', 'enemy_health_fill_green.png', 'enemy_health_fill_red.png'].map((f) => ({ name: f, src: url(barUrls[d], f), resolution: d })),
  ];

  let done = 0;
  const loaded = new Map<string, Texture>();
  await Promise.all(
    jobs.map(async ({ name, src, resolution }) => {
      loaded.set(name, await loadTexture(src, resolution));
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

  // Crop rectangles are in logical (1x) pixels; the density-2 sheet has resolution 2 so the same numbers apply.
  const sheet = get('tiles_sheet');
  const crop = (x: number, y: number, w: number, h: number) => new Texture({ source: sheet.source, frame: new Rectangle(x, y, w, h) });

  return {
    ships,
    cannonBall: get('cannon_ball.png'),
    explosion: ['explosion_1.png', 'explosion_2.png', 'explosion_3.png'].map(get),
    fire: ['fire_1.png', 'fire_2.png'].map(get),
    water: get('tile_73.png'),
    // Regions of tiles_sheet.png (64px tiles): plain sand blob and the grassy island.
    islands: { sand: crop(0, 0, 192, 192), grass: crop(320, 0, 256, 256) },
    // fill_rect from the `ui` metadata of enemy_health_frame in ui_sheet.json (logical pixels).
    healthBar: {
      frame: get('enemy_health_frame.png'),
      green: get('enemy_health_fill_green.png'),
      red: get('enemy_health_fill_red.png'),
      fillRect: { x: 24, y: 12, w: 112, h: 15 },
    },
  };
}
