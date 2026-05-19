import type { AgentId } from '@/lib/types';

export type ZoneId = AgentId;

export interface WorldPoint {
  x: number;
  y: number;
}

export interface ZoneBounds {
  id: ZoneId;
  center: WorldPoint;
  rect: { x: number; y: number; width: number; height: number };
}

export interface Poi {
  id: string;
  zone: ZoneId;
  x: number;
  y: number;
  label: string;
  actionTexture?: string;
  effect: 'apex-meditate' | 'apex-strike' | 'metheus-read' | 'metheus-telescope' | 'gale-cast' | 'gale-globe' | 'helper';
  effectX?: number;
  effectY?: number;
  helperOnly?: boolean;
}

export interface WorldProp {
  id: string;
  zone: ZoneId;
  key: string;
  src: string;
  x: number;
  y: number;
  renderX?: number;
  renderY?: number;
  width?: number;
  height?: number;
  depthY: number;
  layer: 'ground' | 'sorted';
  crop?: { x: number; y: number; width: number; height: number };
  scale?: number;
  assetStatus?: 'needed' | 'reused' | 'needs-regeneration' | 'generated' | 'placed' | 'verified';
  occludesActors?: boolean;
  colliders?: WorldPoint[][];
  glow?: {
    x: number;
    y: number;
    color: number;
    radius: number;
  };
}

export interface WorldCollider {
  id: string;
  zone: ZoneId;
  points: WorldPoint[];
}

export interface WorldTexture {
  key: string;
  src: string;
}

export interface WorldLayerAsset {
  key: string;
  src: string;
}

export interface WorldMapChunk extends WorldLayerAsset {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WorldMapData {
  worldSize: typeof WORLD_SIZE;
  groundLayer: WorldLayerAsset;
  referenceLayer: WorldLayerAsset;
  groundChunks: WorldMapChunk[];
  referenceChunks: WorldMapChunk[];
  zones: Record<ZoneId, ZoneBounds>;
  navMeshPolygons: Record<ZoneId, WorldPoint[][]>;
  pois: Poi[];
  props: WorldProp[];
  colliders: WorldCollider[];
  propTextures: WorldTexture[];
}

export const WORLD_SIZE = { width: 1536, height: 1024 };

export const GROUND_LAYER = {
  key: 'world-v2-ground',
  src: '/world-v2/layers/ground.png',
};

export const REFERENCE_LAYER = {
  key: 'world-v2-reference',
  src: '/world-v2/layers/reference.png',
};

export const GROUND_CHUNKS: WorldMapChunk[] = [
  {
    id: 'core',
    key: GROUND_LAYER.key,
    src: GROUND_LAYER.src,
    x: 0,
    y: 0,
    width: WORLD_SIZE.width,
    height: WORLD_SIZE.height,
  },
];

export const REFERENCE_CHUNKS: WorldMapChunk[] = [
  {
    id: 'core',
    key: REFERENCE_LAYER.key,
    src: REFERENCE_LAYER.src,
    x: 0,
    y: 0,
    width: WORLD_SIZE.width,
    height: WORLD_SIZE.height,
  },
];

export const DEV_TEST_EAST_EXPANSION_CHUNK: WorldMapChunk = {
  id: 'dev-east-expansion-test',
  key: 'world-v2-dev-east-expansion-test',
  src: '/world-v2/layers/dev-east-expansion-test.svg',
  x: WORLD_SIZE.width,
  y: 0,
  width: 384,
  height: WORLD_SIZE.height,
};

export const TILED_WORLD_MAP = {
  key: 'world-v2-authored-map',
  src: '/world-v2/maps/world-v2-apex-slice.tmj',
};

export const WORLD_OBJECT_MANIFEST = {
  key: 'world-v2-object-manifest',
  src: '/world-v2/maps/world-v2-object-manifest.json',
};

export const ZONES: Record<ZoneId, ZoneBounds> = {
  apex: {
    id: 'apex',
    center: { x: 352, y: 288 },
    rect: { x: 32, y: 36, width: 676, height: 430 },
  },
  metheus: {
    id: 'metheus',
    center: { x: 1168, y: 282 },
    rect: { x: 744, y: 32, width: 760, height: 470 },
  },
  gale: {
    id: 'gale',
    center: { x: 332, y: 735 },
    rect: { x: 24, y: 492, width: 640, height: 470 },
  },
};

export const NAV_MESH_POLYGONS: Record<ZoneId, WorldPoint[][]> = {
  apex: [
    rectPoly(82, 232, 432, 432),
    rectPoly(230, 156, 686, 338),
    rectPoly(328, 316, 704, 456),
    rectPoly(44, 268, 138, 430),
  ],
  metheus: [
    rectPoly(780, 238, 1484, 486),
    rectPoly(908, 112, 1484, 282),
    rectPoly(742, 330, 1002, 482),
  ],
  gale: [
    rectPoly(42, 526, 650, 938),
    rectPoly(138, 494, 558, 640),
    rectPoly(470, 638, 656, 940),
  ],
};

export const POIS: Poi[] = [
  { id: 'dojo-mat', zone: 'apex', x: 252, y: 328, label: 'Strike dummy', actionTexture: 'actor-apex-strike', effect: 'apex-strike' },
  { id: 'zen-garden', zone: 'apex', x: 592, y: 326, label: 'Meditate', actionTexture: 'actor-apex-meditate', effect: 'apex-meditate' },
  { id: 'petal-sweep', zone: 'apex', x: 438, y: 418, label: 'Sweep petals', actionTexture: 'actor-apex-helper-sweep', effect: 'helper', helperOnly: true },
  { id: 'water-carry', zone: 'apex', x: 366, y: 438, label: 'Carry water', actionTexture: 'actor-apex-helper-carry', effect: 'helper', helperOnly: true },
  { id: 'banner-check', zone: 'apex', x: 662, y: 308, label: 'Check banner', actionTexture: 'actor-apex-helper-idle', effect: 'helper', helperOnly: true },

  { id: 'observatory', zone: 'metheus', x: 966, y: 346, label: 'Inspect telescope', actionTexture: 'actor-metheus-telescope', effect: 'metheus-telescope', effectX: 982, effectY: 172 },
  { id: 'reading-table', zone: 'metheus', x: 1180, y: 414, label: 'Study scroll', actionTexture: 'actor-metheus-read', effect: 'metheus-read' },
  { id: 'book-stacks', zone: 'metheus', x: 1392, y: 408, label: 'Sort books', actionTexture: 'actor-metheus-helper-books', effect: 'helper', helperOnly: true },
  { id: 'scroll-delivery', zone: 'metheus', x: 1054, y: 450, label: 'Deliver scroll', actionTexture: 'actor-metheus-helper-scroll', effect: 'helper', helperOnly: true },
  { id: 'lantern-notes', zone: 'metheus', x: 1298, y: 462, label: 'Light desk', actionTexture: 'actor-metheus-helper-lantern', effect: 'helper', helperOnly: true },

  { id: 'storm-globe', zone: 'gale', x: 372, y: 884, label: 'Pulse globe', actionTexture: 'actor-gale-globe', effect: 'gale-globe', effectX: 334, effectY: 744 },
  { id: 'lightning-rods', zone: 'gale', x: 548, y: 708, label: 'Cast storm', actionTexture: 'actor-gale-cast', effect: 'gale-cast' },
  { id: 'rain-jars', zone: 'gale', x: 176, y: 870, label: 'Carry jars', actionTexture: 'actor-gale-helper-jar', effect: 'helper', helperOnly: true },
  { id: 'crystal-tune', zone: 'gale', x: 262, y: 626, label: 'Tune crystal', actionTexture: 'actor-gale-helper-crystal', effect: 'helper', helperOnly: true },
  { id: 'tool-check', zone: 'gale', x: 592, y: 846, label: 'Adjust tools', actionTexture: 'actor-gale-helper-tool', effect: 'helper', helperOnly: true },
];

export const WORLD_PROPS: WorldProp[] = [];

export const WORLD_COLLIDERS: WorldCollider[] = WORLD_PROPS.flatMap((propItem) => (
  propItem.colliders?.map((points, index) => ({
    id: `${propItem.id}-${index}`,
    zone: propItem.zone,
    points,
  })) ?? []
));

export const PROP_TEXTURES = Array.from(new Map(WORLD_PROPS.map((propItem) => [propItem.key, propItem.src])).entries())
  .map(([key, src]) => ({ key, src }));

export function propTextureKey(asset: string): string {
  return `world-v2-prop-${asset}`;
}

const AUTHORED_PROP_ASSETS = [
  'apex-dojo',
  'apex-training-platform',
  'apex-zen-garden',
  'apex-koi-pond',
  'cherry-tree-large',
  'cherry-tree-large-base',
  'cherry-tree-large-canopy',
  'cherry-tree-large-trunk',
  'cherry-tree-small',
  'cherry-tree-small-base',
  'cherry-tree-small-canopy',
  'cherry-tree-small-trunk',
  'low-fence',
  'bench',
  'lamp-post',
  'signpost',
  'pink-flowers',
  'purple-flowers',
  'yellow-flowers',
  'sunflowers',
  'grass-clump',
  'rock-small',
  'rock-tall',
  'rock-moss',
] as const;

export const AUTHORED_PROP_TEXTURES: WorldTexture[] = AUTHORED_PROP_ASSETS.map((asset) => ({
  key: propTextureKey(asset),
  src: `/world-v2/foreground/${asset}.png`,
}));

export const FALLBACK_WORLD_DATA: WorldMapData = {
  worldSize: worldSizeFromChunks([...GROUND_CHUNKS, ...REFERENCE_CHUNKS], WORLD_SIZE),
  groundLayer: GROUND_LAYER,
  referenceLayer: REFERENCE_LAYER,
  groundChunks: GROUND_CHUNKS,
  referenceChunks: REFERENCE_CHUNKS,
  zones: ZONES,
  navMeshPolygons: NAV_MESH_POLYGONS,
  pois: POIS,
  props: WORLD_PROPS,
  colliders: WORLD_COLLIDERS,
  propTextures: PROP_TEXTURES,
};

export const ACTOR_TEXTURES = [
  'apex-idle',
  'apex-meditate',
  'apex-strike',
  'apex-helper-idle',
  'apex-helper-carry',
  'apex-helper-sweep',
  'metheus-idle',
  'metheus-read',
  'metheus-telescope',
  'metheus-helper-books',
  'metheus-helper-scroll',
  'metheus-helper-lantern',
  'gale-idle',
  'gale-cast',
  'gale-globe',
  'gale-helper-crystal',
  'gale-helper-jar',
  'gale-helper-tool',
];

function rectPoly(x1: number, y1: number, x2: number, y2: number): WorldPoint[] {
  return [
    { x: x1, y: y1 },
    { x: x2, y: y1 },
    { x: x2, y: y2 },
    { x: x1, y: y2 },
  ];
}

export function worldSizeFromChunks(chunks: WorldMapChunk[], fallback: typeof WORLD_SIZE = WORLD_SIZE) {
  return chunks.reduce(
    (size, chunk) => ({
      width: Math.max(size.width, chunk.x + chunk.width),
      height: Math.max(size.height, chunk.y + chunk.height),
    }),
    { ...fallback },
  );
}
