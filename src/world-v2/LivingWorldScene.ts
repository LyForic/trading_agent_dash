import NavMeshRuntime from 'navmesh';
import type { NavMesh as NavMeshInstance } from 'navmesh';
import Phaser from 'phaser';
import {
  AUTHORED_PROP_TEXTURES,
  ACTOR_TEXTURES,
  DEV_TEST_BACON_WEST_EXPANSION_CHUNK,
  DEV_TEST_EAST_EXPANSION_CHUNK,
  FALLBACK_WORLD_DATA,
  TILED_WORLD_MAP,
  WORLD_OBJECT_MANIFEST,
  type Poi,
  type WorldCollider,
  type WorldMapChunk,
  type WorldMapData,
  type WorldPoint,
  type ZoneId,
  worldBoundsFromChunks,
  worldSizeFromChunks,
} from './worldMapData';
import { buildWorldFromTiledMap } from './tiledMap';

type NavMeshConstructor = new (polygons: WorldPoint[][], meshShrinkAmount?: number) => NavMeshInstance;
type BuildPolysFromGridMap = (
  grid: number[][],
  tileWidth?: number,
  tileHeight?: number,
  isWalkableTest?: (value: number, x: number, y: number) => boolean,
  shrinkAmount?: number,
) => WorldPoint[][];
type NavMeshRuntimeShape = {
  NavMesh?: NavMeshConstructor;
  buildPolysFromGridMap?: BuildPolysFromGridMap;
};

const NAV_TILE_SIZE = 16;
const NAV_SHRINK = 3;
const NAV_COLLIDER_PADDING = 8;
const MANIFEST_NAV_SAMPLE_STEP = 18;
const MANIFEST_NAV_VERTEX_OFFSET = 10;
const MANIFEST_NAV_CORRIDOR_PADDING = 86;
const MAX_MANIFEST_NAV_CANDIDATES = 96;
const MAX_WALKABLE_ROUTE_VERTICES = 18;
const AGENT_DESTINATION_SPACING = 44;
const HELPER_DESTINATION_SPACING = 30;
const DESTINATION_SEARCH_RADII = [0, 24, 36, 50, 66, 84, 108] as const;
const MIN_WALK_SEGMENT_DURATION_MS = 180;
const DESKTOP_MAX_ZOOM = 2.05;
const MOBILE_MAX_ZOOM = 1.75;
const DESKTOP_FOCUS_ZOOM_BOOST = 0.42;
const MOBILE_FOCUS_ZOOM_BOOST = 0.28;
const WHEEL_ZOOM_SENSITIVITY = 0.0012;
const CAMERA_DRAG_THRESHOLD = 5;
const WALK_FRAME_WIDTH = 96;
const WALK_FRAME_HEIGHT = 112;
const WALK_FRAME_COUNT = 6;
const WALK_FRAME_DURATION_MS = 120;
const WALK_DIRECTIONS = ['down', 'left', 'right', 'up'] as const;
const ACTOR_WALK_SHEETS = [
  'apex-idle',
  'metheus-idle',
  'gale-idle',
  'apex-helper-idle',
  'apex-helper-carry',
  'apex-helper-sweep',
  'metheus-helper-books',
  'metheus-helper-scroll',
  'metheus-helper-lantern',
  'gale-helper-crystal',
  'gale-helper-jar',
  'gale-helper-tool',
] as const;
const ACTOR_WALK_SHEET_SLUGS = new Set<string>(ACTOR_WALK_SHEETS);
const NavMeshModule = NavMeshRuntime as unknown as NavMeshRuntimeShape;
const NavMeshCtor = (
  typeof NavMeshRuntime === 'function'
    ? NavMeshRuntime
    : NavMeshModule.NavMesh
) as NavMeshConstructor;
const buildPolysFromGridMap = NavMeshModule.buildPolysFromGridMap;

type ActorKind =
  | 'apex'
  | 'metheus'
  | 'gale'
  | 'bacon'
  | 'apex-helper'
  | 'metheus-helper'
  | 'gale-helper'
  | 'bacon-helper';
type WalkDirection = typeof WALK_DIRECTIONS[number];

interface LivingActor {
  id: string;
  kind: ActorKind;
  zone: ZoneId;
  idleTexture: string;
  actionTextures: string[];
  walkSheet: string | null;
  walkDirection: WalkDirection;
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Ellipse;
  speed: number;
  nextTaskAt: number;
  busy: boolean;
  walking: boolean;
  scale: number;
  currentScale: number;
  walkSeed: number;
  lastDepth: number;
}

interface DebugActorMarker {
  actor: LivingActor;
  dot: Phaser.GameObjects.Ellipse;
  label: Phaser.GameObjects.Text;
}

interface ExactNavEdge {
  to: number;
  cost: number;
}

interface DestinationReservation {
  zone: ZoneId;
  point: WorldPoint;
  spacing: number;
}

type ManifestRole = 'ground-baked' | 'walkable-ground' | 'blocking-ground' | 'occluder' | 'decor-cluster' | 'interactive';

interface WorldObjectManifest {
  source?: {
    imageSize?: { width: number; height: number };
  };
  objects?: ManifestObject[];
}

interface ManifestObject {
  id: string;
  zone: string;
  label?: string;
  role: ManifestRole;
  layerTarget: string;
  bbox: { x: number; y: number; width: number; height: number };
  depthY?: number;
  collision?: {
    kind?: string;
    bbox?: { x: number; y: number; width: number; height: number };
    points?: WorldPoint[];
  };
  occlusion?: {
    required?: boolean;
  };
  walkable?: {
    kind?: string;
    points?: WorldPoint[];
  };
}

interface ForegroundWorkspaceSprite {
  id: string;
  zone?: string;
  sprite: string;
  x: number;
  y: number;
  depthY: number;
  maskSource: string;
}

interface ForegroundWorkspaceIndex {
  sprites?: ForegroundWorkspaceSprite[];
}

const DEPTH = {
  ground: 0,
  groundDetail: 120,
  ambient: 420,
  debug: 720,
  actorBase: 900,
  effectBase: 2300,
  reference: 5200,
};

const TEXTURE_SCALE: Partial<Record<string, number>> = {
  'actor-metheus-telescope': 1.18,
  'actor-metheus-read': 1.08,
  'actor-gale-globe': 1.08,
  'actor-gale-cast': 1.04,
  'actor-apex-meditate': 1.04,
};
const DEFAULT_ACTOR_TEXTURE_BOTTOM_PADDING = 8;
const ACTOR_SHADOWS_ENABLED = false;
const ACTOR_FEET_PADDING_STORAGE_KEY = 'world-v2-actor-feet-padding-v2';

const AGENT_ACTOR_CONFIG: Array<{
  id: string;
  zone: ZoneId;
  kind: ActorKind;
  idleTexture: string;
  actionTextures: string[];
  x: number;
  y: number;
  speed: number;
  scale: number;
}> = [
  {
    id: 'apex',
    zone: 'apex',
    kind: 'apex',
    idleTexture: 'actor-apex-idle',
    actionTextures: ['actor-apex-meditate', 'actor-apex-strike'],
    x: 252,
    y: 342,
    speed: 48,
    scale: 0.58,
  },
  {
    id: 'metheus',
    zone: 'metheus',
    kind: 'metheus',
    idleTexture: 'actor-metheus-idle',
    actionTextures: ['actor-metheus-read', 'actor-metheus-telescope'],
    x: 926,
    y: 430,
    speed: 44,
    scale: 0.58,
  },
  {
    id: 'gale',
    zone: 'gale',
    kind: 'gale',
    idleTexture: 'actor-gale-idle',
    actionTextures: ['actor-gale-cast', 'actor-gale-globe'],
    x: 468,
    y: 884,
    speed: 44,
    scale: 0.58,
  },
];

const HELPER_CONFIG: Array<{ kind: ActorKind; zone: ZoneId; textures: string[]; count: number; scale: number; speed: number }> = [
  {
    kind: 'apex-helper',
    zone: 'apex',
    textures: ['actor-apex-helper-idle', 'actor-apex-helper-carry', 'actor-apex-helper-sweep'],
    count: 5,
    scale: 0.44,
    speed: 40,
  },
  {
    kind: 'metheus-helper',
    zone: 'metheus',
    textures: ['actor-metheus-helper-books', 'actor-metheus-helper-scroll', 'actor-metheus-helper-lantern'],
    count: 5,
    scale: 0.41,
    speed: 36,
  },
  {
    kind: 'gale-helper',
    zone: 'gale',
    textures: ['actor-gale-helper-crystal', 'actor-gale-helper-jar', 'actor-gale-helper-tool'],
    count: 5,
    scale: 0.41,
    speed: 36,
  },
];

const BACON_ACTOR_TEXTURES = [
  { key: 'actor-bacon-idle', src: '/world-v2/actors/bacon-idle.svg' },
  { key: 'actor-bacon-cook', src: '/world-v2/actors/bacon-cook.svg' },
  { key: 'actor-bacon-helper-idle', src: '/world-v2/actors/bacon-helper-idle.svg' },
  { key: 'actor-bacon-helper-basket', src: '/world-v2/actors/bacon-helper-basket.svg' },
  { key: 'actor-bacon-helper-stir', src: '/world-v2/actors/bacon-helper-stir.svg' },
] as const;

const BACON_AGENT_ACTOR_CONFIG: (typeof AGENT_ACTOR_CONFIG)[number] = {
  id: 'bacon',
  zone: 'bacon',
  kind: 'bacon',
  idleTexture: 'actor-bacon-idle',
  actionTextures: ['actor-bacon-cook'],
  x: -336,
  y: 724,
  speed: 38,
  scale: 0.58,
};

const BACON_HELPER_CONFIG: Array<{ kind: ActorKind; zone: ZoneId; textures: string[]; count: number; scale: number; speed: number }> = [
  {
    kind: 'bacon-helper',
    zone: 'bacon',
    textures: ['actor-bacon-helper-idle', 'actor-bacon-helper-basket', 'actor-bacon-helper-stir'],
    count: 5,
    scale: 0.39,
    speed: 34,
  },
];

const DEV_WORLD_TOOLS = import.meta.env.DEV;
const queryParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
const DEBUG_WORLD = DEV_WORLD_TOOLS && (queryParams?.has('debugWorld') ?? false);
const DEBUG_APEX_TEST = DEV_WORLD_TOOLS && (queryParams?.has('apexTest') ?? false);
const DEBUG_TREE_TEST = DEV_WORLD_TOOLS && (queryParams?.has('treeTest') ?? false);
const DEBUG_MANIFEST_WORLD = DEV_WORLD_TOOLS && (queryParams?.has('manifestWorld') ?? false);
const MANIFEST_ROLE_FILTER = DEV_WORLD_TOOLS ? queryParams?.get('manifestRole') as ManifestRole | null : null;
const MANIFEST_RUNTIME = manifestRuntimeFromQuery(queryParams);
const DEV_CHUNK_TEST = DEV_WORLD_TOOLS && (queryParams?.has('chunkTest') ?? false);
const DEV_BACON_CHUNK_TEST = DEV_WORLD_TOOLS && (queryParams?.has('baconChunkTest') ?? false);
const ACTIVE_DEV_TEST_CHUNKS: WorldMapChunk[] = [
  ...(DEV_CHUNK_TEST ? [DEV_TEST_EAST_EXPANSION_CHUNK] : []),
  ...(DEV_BACON_CHUNK_TEST ? [DEV_TEST_BACON_WEST_EXPANSION_CHUNK] : []),
];
const ACTOR_TUNING = DEV_WORLD_TOOLS && (queryParams?.has('actorTuning') ?? false);
const DEBUG_ISOLATED_TEST = DEBUG_APEX_TEST || DEBUG_TREE_TEST || DEBUG_MANIFEST_WORLD;
const REFERENCE_WORLD = DEV_WORLD_TOOLS && (queryParams?.has('referenceWorld') ?? false);
const GROUND_ONLY_PREVIEW = DEV_WORLD_TOOLS && (queryParams?.has('groundOnly') ?? false);
const REFERENCE_OPACITY = queryParams?.has('referenceSolid') ? 0.82 : 0.42;
const GROUND_PREVIEW_ZONES = ['apex', 'center', 'gale', 'metheus'] as const;
const GROUND_PREVIEW_FILES = {
  generated: 'generated-ground-preview-full.png',
  approved: 'approved-ground-preview-full.png',
  label: 'label-driven-ground-preview-full.png',
  inpaint: 'reference-inpaint-ground-preview-full.png',
  preserved: 'reference-preserved-current-ground-preview-full.png',
} as const;
const GROUND_PREVIEW_ZONE = groundPreviewZoneFromQuery(queryParams?.get('groundZone'));
const GROUND_PREVIEW_VARIANT = DEV_WORLD_TOOLS ? groundPreviewVariantFromQuery(queryParams) : null;
const FOREGROUND_WORKSPACE_PREVIEW = DEV_WORLD_TOOLS && (queryParams?.has('foregroundWorkspace') ?? false);
const GENERATED_GROUND_PREVIEW_ASSET = {
  key: `world-v2-${GROUND_PREVIEW_VARIANT ?? 'generated'}-ground-preview-${GROUND_PREVIEW_ZONE}`,
  src: DEV_WORLD_TOOLS
    ? `/world-v2/source/${GROUND_PREVIEW_ZONE}-ground-workspace/${GROUND_PREVIEW_FILES[GROUND_PREVIEW_VARIANT ?? 'generated']}`
    : '',
};
const FOREGROUND_WORKSPACE_INDEX_ASSET = {
  key: `world-v2-foreground-workspace-index-${GROUND_PREVIEW_ZONE}`,
  src: DEV_WORLD_TOOLS ? `/world-v2/source/${GROUND_PREVIEW_ZONE}-foreground-workspace/sprite-index.json` : '',
};
const MANIFEST_RUNTIME_INDEX_ASSET = {
  key: 'world-v2-manifest-runtime-index',
  src: '/world-v2/runtime/manifest/sprite-index.json',
};
const DEBUG_DEPTH_CHECKPOINTS = [
  { key: '1', label: 'behind canopy', x: 650, y: 174 },
  { key: '2', label: 'behind trunk', x: 668, y: 222 },
  { key: '3', label: 'front of trunk', x: 668, y: 300 },
  { key: '4', label: 'behind rock', x: 724, y: 384 },
  { key: '5', label: 'front of rock', x: 724, y: 422 },
  { key: '6', label: 'behind fence', x: 242, y: 436 },
  { key: '7', label: 'front of fence', x: 242, y: 470 },
  { key: '8', label: 'behind bench', x: 602, y: 508 },
  { key: '9', label: 'front of bench', x: 602, y: 552 },
  { key: '0', label: 'behind small cherry', x: 708, y: 104 },
  { key: '-', label: 'front of small cherry', x: 708, y: 170 },
] as const;

function groundPreviewZoneFromQuery(zone: string | null | undefined) {
  if (GROUND_PREVIEW_ZONES.includes(zone as (typeof GROUND_PREVIEW_ZONES)[number])) {
    return zone as (typeof GROUND_PREVIEW_ZONES)[number];
  }
  return 'apex';
}

function groundPreviewVariantFromQuery(params: URLSearchParams | null) {
  if (!params) return null;
  if (params.has('approvedGround')) return 'approved';
  if (params.has('labelGround')) return 'label';
  if (params.has('inpaintGround')) return 'inpaint';
  if (params.has('preservedGround')) return 'preserved';
  if (params.has('generatedGround')) return 'generated';
  return null;
}

function manifestRuntimeFromQuery(params: URLSearchParams | null) {
  if (!params) return true;
  if (params.has('manifestRuntime')) return true;
  if (!DEV_WORLD_TOOLS) return true;
  if (params.has('legacyWorld')) return false;
  if (params.has('manifestWorld') || params.has('apexTest') || params.has('treeTest')) return false;
  if (params.has('foregroundWorkspace') || params.has('groundOnly')) return false;
  return groundPreviewVariantFromQuery(params) === null;
}

function actorTuningNumber(queryKey: string, storageKey: string, fallback: number) {
  const queryValue = queryParams?.get(queryKey);
  if (queryValue !== null && queryValue !== undefined) {
    const parsedQueryValue = Number(queryValue);
    if (Number.isFinite(parsedQueryValue)) return parsedQueryValue;
  }

  if (ACTOR_TUNING && typeof window !== 'undefined') {
    const storedValue = window.localStorage.getItem(storageKey);
    if (storedValue !== null) {
      const parsedStoredValue = Number(storedValue);
      if (Number.isFinite(parsedStoredValue)) return parsedStoredValue;
    }
  }

  return fallback;
}

export class LivingWorldScene extends Phaser.Scene {
  private actors: LivingActor[] = [];
  private props: Phaser.GameObjects.Image[] = [];
  private zoneNavMeshes = new Map<ZoneId, NavMeshInstance>();
  private zoneNavPolygons = new Map<ZoneId, WorldPoint[][]>();
  private worldData: WorldMapData = FALLBACK_WORLD_DATA;
  private manifestRuntimeWalkableZones = new Set<ZoneId>();
  private zoneColliderCache = new Map<ZoneId, WorldCollider[]>();
  private destinationReservations = new Map<string, DestinationReservation>();
  private debugActorMarkers: DebugActorMarker[] = [];
  private debugProbeGraphics: Phaser.GameObjects.Graphics | null = null;
  private debugProbeLabel: Phaser.GameObjects.Text | null = null;
  private actorTuningLabel: Phaser.GameObjects.Text | null = null;
  private actorTasksStartedThisFrame = 0;
  private actorTextureBottomPadding = actorTuningNumber(
    'actorFeetPadding',
    ACTOR_FEET_PADDING_STORAGE_KEY,
    DEFAULT_ACTOR_TEXTURE_BOTTOM_PADDING,
  );
  private homeZoom = 0.66;
  private readonly focusedZoomDesktop = 1.18;
  private readonly focusedZoomMobile = 0.92;
  private focusedZone: ZoneId | null = null;
  private sceneReady = false;
  private pendingFocusAgent: ZoneId | null | undefined;
  private cameraMode: 'home' | 'focused' | 'manual' = 'home';
  private activeCameraPointers = new Map<number, { x: number; y: number }>();
  private cameraDrag: {
    pointerId: number;
    startX: number;
    startY: number;
    startScrollX: number;
    startScrollY: number;
  } | null = null;
  private cameraPinch: {
    startDistance: number;
    startZoom: number;
    worldPoint: WorldPoint;
  } | null = null;
  private cameraInteractionMoved = false;

  constructor() {
    super('LivingWorldScene');
  }

  preload() {
    this.load.json(TILED_WORLD_MAP.key, TILED_WORLD_MAP.src);
    if (DEBUG_MANIFEST_WORLD || MANIFEST_RUNTIME) this.load.json(WORLD_OBJECT_MANIFEST.key, WORLD_OBJECT_MANIFEST.src);
    if (FOREGROUND_WORKSPACE_PREVIEW) this.load.json(FOREGROUND_WORKSPACE_INDEX_ASSET.key, FOREGROUND_WORKSPACE_INDEX_ASSET.src);
    if (MANIFEST_RUNTIME) this.load.json(MANIFEST_RUNTIME_INDEX_ASSET.key, MANIFEST_RUNTIME_INDEX_ASSET.src);
    this.preloadWorldLayerChunks();
    if (GROUND_PREVIEW_VARIANT) {
      this.load.image(GENERATED_GROUND_PREVIEW_ASSET.key, GENERATED_GROUND_PREVIEW_ASSET.src);
    }
    if (!MANIFEST_RUNTIME) {
      for (const texture of AUTHORED_PROP_TEXTURES) {
        this.load.image(texture.key, texture.src);
      }
    }
    for (const key of ACTOR_TEXTURES) {
      this.load.image(`actor-${key}`, `/world-v2/actors/${key}.png`);
    }
    if (DEV_BACON_CHUNK_TEST) {
      for (const texture of BACON_ACTOR_TEXTURES) {
        this.load.image(texture.key, texture.src);
      }
    }
    for (const slug of ACTOR_WALK_SHEETS) {
      this.load.spritesheet(`actor-${slug}-walk`, `/world-v2/actors/walk/${slug}-walk.png`, {
        frameWidth: WALK_FRAME_WIDTH,
        frameHeight: WALK_FRAME_HEIGHT,
      });
    }
  }

  create() {
    this.worldData = this.loadAuthoredWorldData();
    if (MANIFEST_RUNTIME) {
      this.worldData = this.applyManifestRuntimeData(this.worldData);
    }
    if (ACTIVE_DEV_TEST_CHUNKS.length > 0) {
      this.worldData = this.applyDevChunkTestData(this.worldData);
    }
    this.zoneNavPolygons = new Map(
      (Object.keys(this.worldData.zones) as ZoneId[]).map((zone) => [zone, this.buildZoneNavPolygons(zone)]),
    );
    this.zoneNavMeshes = new Map(
      (Array.from(this.zoneNavPolygons.entries()) as Array<[ZoneId, WorldPoint[][]]>)
        .map(([zone, polygons]) => [zone, new NavMeshCtor(polygons, 8)]),
    );

    this.cameras.main.removeBounds();
    this.createBaseLayer();
    if (DEBUG_MANIFEST_WORLD) {
      this.createManifestOverlay();
    } else {
      if (!DEBUG_ISOLATED_TEST && !GROUND_ONLY_PREVIEW) this.createAmbientLife();
      if (!GROUND_ONLY_PREVIEW) {
        if (MANIFEST_RUNTIME) {
          this.createManifestRuntimeOcclusionSprites();
        } else {
          this.createWorldProps();
          if (FOREGROUND_WORKSPACE_PREVIEW) this.createForegroundWorkspaceProps();
        }
        this.createActors();
      }
      if (DEBUG_WORLD) this.createDebugOverlay();
      if (DEBUG_WORLD || DEBUG_ISOLATED_TEST) this.enableDebugClickToMove();
      if (ACTOR_TUNING) this.createActorTuningControls();
      if (DEBUG_ISOLATED_TEST && !GROUND_ONLY_PREVIEW) this.placeDebugActorAt(DEBUG_DEPTH_CHECKPOINTS[2]);
      if (REFERENCE_WORLD) this.createReferenceOverlay();
    }
    this.enableCameraControls();
    this.sceneReady = true;
    if (this.pendingFocusAgent !== undefined) {
      const pendingFocusAgent = this.pendingFocusAgent;
      this.pendingFocusAgent = undefined;
      this.focusAgent(pendingFocusAgent);
    } else {
      this.updateCameraHome(true);
    }
    this.scale.on('resize', this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', this.handleResize, this);
      this.input.off(Phaser.Input.Events.POINTER_DOWN, this.handleCameraPointerDown, this);
      this.input.off(Phaser.Input.Events.POINTER_MOVE, this.handleCameraPointerMove, this);
      this.input.off(Phaser.Input.Events.POINTER_UP, this.handleCameraPointerUp, this);
      this.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.handleCameraPointerUp, this);
      this.input.off(Phaser.Input.Events.POINTER_WHEEL, this.handleCameraWheel, this);
      this.input.keyboard?.off('keydown', this.handleDebugCheckpointKey, this);
      this.input.keyboard?.off('keydown', this.handleActorTuningKey, this);
      for (const mesh of this.zoneNavMeshes.values()) mesh.destroy();
    });
  }

  private preloadWorldLayerChunks() {
    const chunkTextures = new Map<string, string>();
    for (const chunk of [...FALLBACK_WORLD_DATA.groundChunks, ...FALLBACK_WORLD_DATA.referenceChunks]) {
      chunkTextures.set(chunk.key, chunk.src);
    }
    for (const chunk of ACTIVE_DEV_TEST_CHUNKS) {
      chunkTextures.set(chunk.key, chunk.src);
    }
    for (const [key, src] of chunkTextures.entries()) {
      this.load.image(key, src);
    }
  }

  update(time: number) {
    this.actorTasksStartedThisFrame = 0;
    for (const actor of this.actors) {
      if (!actor.container.visible) continue;
      const depth = DEPTH.actorBase + Math.round(actor.container.y);
      if (depth !== actor.lastDepth) {
        actor.container.setDepth(depth);
        actor.lastDepth = depth;
      }
      if (actor.walking) this.applyWalkCycle(actor, time);
      if (!actor.busy && time >= actor.nextTaskAt) {
        if (this.actorTasksStartedThisFrame < 1) {
          this.actorTasksStartedThisFrame += 1;
          this.assignTask(actor);
        } else {
          actor.nextTaskAt = time + Phaser.Math.Between(70, 180);
        }
      }
    }
    if (DEBUG_WORLD) this.updateDebugActorMarkers();
  }

  focusAgent(agentId: ZoneId | null) {
    if (!this.sceneReady) {
      this.pendingFocusAgent = agentId;
      return;
    }

    this.stopCameraMotion();
    this.focusedZone = agentId;
    this.applyFocusVisibility();
    if (!agentId) {
      this.cameraMode = 'home';
      this.updateCameraHome(false);
      return;
    }
    const zone = this.worldData.zones[agentId];
    const zoom = this.focusZoom();
    const targetCenter = this.clampedCameraCenterFor(zone.center, zoom);
    this.cameraMode = 'focused';
    const camera = this.cameras.main;
    camera.pan(targetCenter.x, targetCenter.y, 850, 'Sine.easeInOut');
    camera.zoomTo(zoom, 850, 'Sine.easeInOut');
    this.time.delayedCall(875, () => this.clampCameraToWorld());
  }

  private handleResize() {
    this.refreshCameraAfterResize();
    this.time.delayedCall(80, () => this.refreshCameraAfterResize());
  }

  private refreshCameraAfterResize() {
    const currentCenter = this.currentCameraCenter();
    this.syncCameraViewport();

    if (this.cameraMode === 'focused' && this.focusedZone) {
      const zone = this.worldData.zones[this.focusedZone];
      const zoom = this.focusZoom();
      const targetCenter = this.clampedCameraCenterFor(zone.center, zoom);
      this.cameras.main.setZoom(zoom);
      this.centerCameraOn(targetCenter.x, targetCenter.y);
      return;
    }
    if (this.cameraMode === 'home') {
      this.updateCameraHome(true);
      return;
    }

    const zoom = this.clampZoom(this.cameras.main.zoom);
    this.cameras.main.setZoom(zoom);
    this.centerCameraOn(currentCenter.x, currentCenter.y);
  }

  private updateCameraHome(instant: boolean) {
    this.syncCameraViewport();
    const { width } = this.cameraViewportSize();
    this.stopCameraMotion();
    if (DEBUG_MANIFEST_WORLD) {
      const zoom = width < 700 ? 0.84 : 1.12;
      this.cameras.main.setZoom(zoom);
      this.cameras.main.setScroll(0, 0);
      return;
    }
    if (DEBUG_TREE_TEST) {
      const zoom = width < 700 ? 1.03 : 1.42;
      if (instant) {
        this.cameras.main.centerOn(650, 320);
        this.cameras.main.setZoom(zoom);
        return;
      }
      this.cameras.main.pan(650, 320, 450, 'Sine.easeInOut');
      this.cameras.main.zoomTo(zoom, 450, 'Sine.easeInOut');
      return;
    }
    if (DEBUG_APEX_TEST) {
      const zoom = width < 700 ? 0.84 : 1.12;
      if (instant) {
        this.cameras.main.centerOn(460, 376);
        this.cameras.main.setZoom(zoom);
        return;
      }
      this.cameras.main.pan(460, 376, 450, 'Sine.easeInOut');
      this.cameras.main.zoomTo(zoom, 450, 'Sine.easeInOut');
      return;
    }
    this.homeZoom = this.cameraZoomBounds().min;
    const camera = this.cameras.main;
    const homeCenter = this.worldBoundsCenter();
    if (instant) {
      this.applyCameraZoom(this.homeZoom);
      this.centerCameraOn(homeCenter.x, homeCenter.y);
      return;
    }
    camera.pan(homeCenter.x, homeCenter.y, 850, 'Sine.easeInOut');
    camera.zoomTo(this.homeZoom, 850, 'Sine.easeInOut');
    this.time.delayedCall(875, () => this.clampCameraToWorld());
  }

  private cameraZoomBounds() {
    const { width, height } = this.cameraViewportSize();
    const min = Math.max(width / this.worldData.worldBounds.width, height / this.worldData.worldBounds.height);
    const mobile = width < 700;
    const maxBase = mobile ? MOBILE_MAX_ZOOM : DESKTOP_MAX_ZOOM;
    return {
      min,
      max: Math.max(maxBase, min + (mobile ? 0.72 : 0.95)),
    };
  }

  private clampZoom(zoom: number) {
    const bounds = this.cameraZoomBounds();
    return Phaser.Math.Clamp(zoom, bounds.min, bounds.max);
  }

  private focusZoom() {
    const bounds = this.cameraZoomBounds();
    const mobile = this.cameraViewportSize().width < 700;
    const base = mobile ? this.focusedZoomMobile : this.focusedZoomDesktop;
    const boosted = bounds.min + (mobile ? MOBILE_FOCUS_ZOOM_BOOST : DESKTOP_FOCUS_ZOOM_BOOST);
    return Phaser.Math.Clamp(Math.max(base, boosted), bounds.min, bounds.max);
  }

  private applyCameraZoom(zoom: number) {
    this.stopCameraMotion();
    this.cameras.main.setZoom(this.clampZoom(zoom));
    this.clampCameraToWorld();
  }

  private centerCameraOn(x: number, y: number) {
    this.stopCameraMotion();
    const targetCenter = this.clampedCameraCenterFor({ x, y });
    this.cameras.main.centerOn(targetCenter.x, targetCenter.y);
    this.clampCameraToWorld();
  }

  private clampedCameraCenterFor(center: WorldPoint, zoom = this.cameras.main.zoom) {
    const bounds = this.worldData.worldBounds;
    const { width, height } = this.cameraViewportSize();
    const viewWidth = width / zoom;
    const viewHeight = height / zoom;
    const minX = bounds.x + (viewWidth / 2);
    const maxX = bounds.x + bounds.width - (viewWidth / 2);
    const minY = bounds.y + (viewHeight / 2);
    const maxY = bounds.y + bounds.height - (viewHeight / 2);

    return {
      x: maxX <= minX ? bounds.x + (bounds.width / 2) : Phaser.Math.Clamp(center.x, minX, maxX),
      y: maxY <= minY ? bounds.y + (bounds.height / 2) : Phaser.Math.Clamp(center.y, minY, maxY),
    };
  }

  private clampCameraToWorld() {
    const camera = this.cameras.main;
    const bounds = this.worldData.worldBounds;
    const { width, height } = this.cameraViewportSize();
    const originX = width * camera.originX;
    const originY = height * camera.originY;
    const minScrollX = bounds.x + (originX / camera.zoom) - originX;
    const minScrollY = bounds.y + (originY / camera.zoom) - originY;
    const maxScrollX = bounds.x + bounds.width - originX - ((width - originX) / camera.zoom);
    const maxScrollY = bounds.y + bounds.height - originY - ((height - originY) / camera.zoom);
    camera.setScroll(
      maxScrollX <= minScrollX
        ? bounds.x + (bounds.width / 2) - originX
        : Phaser.Math.Clamp(camera.scrollX, minScrollX, maxScrollX),
      maxScrollY <= minScrollY
        ? bounds.y + (bounds.height / 2) - originY
        : Phaser.Math.Clamp(camera.scrollY, minScrollY, maxScrollY),
    );
  }

  private worldBoundsCenter() {
    const bounds = this.worldData.worldBounds;
    return {
      x: bounds.x + (bounds.width / 2),
      y: bounds.y + (bounds.height / 2),
    };
  }

  private syncCameraViewport() {
    const { width, height } = this.cameraViewportSize();
    this.cameras.main.setViewport(0, 0, width, height);
  }

  private cameraViewportSize() {
    return {
      width: Math.max(1, this.scale.gameSize.width || this.scale.width),
      height: Math.max(1, this.scale.gameSize.height || this.scale.height),
    };
  }

  private currentCameraCenter() {
    const camera = this.cameras.main;
    const { width, height } = this.cameraViewportSize();
    const center = camera.getWorldPoint(width * camera.originX, height * camera.originY);
    return { x: center.x, y: center.y };
  }

  private enableCameraControls() {
    if (DEBUG_MANIFEST_WORLD) return;
    this.input.addPointer(2);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.handleCameraPointerDown, this);
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.handleCameraPointerMove, this);
    this.input.on(Phaser.Input.Events.POINTER_UP, this.handleCameraPointerUp, this);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.handleCameraPointerUp, this);
    this.input.on(Phaser.Input.Events.POINTER_WHEEL, this.handleCameraWheel, this);
  }

  private handleCameraPointerDown(pointer: Phaser.Input.Pointer) {
    if (pointer.button !== 0) return;
    const pointerId = pointer.id;
    const point = this.screenPointFromPointer(pointer);
    this.stopCameraMotion();
    this.cameraMode = 'manual';
    this.cameraInteractionMoved = false;
    this.activeCameraPointers.set(pointerId, point);
    if (this.activeCameraPointers.size >= 2) {
      this.beginCameraPinch();
      return;
    }

    this.cameraPinch = null;
    this.cameraDrag = {
      pointerId,
      startX: point.x,
      startY: point.y,
      startScrollX: this.cameras.main.scrollX,
      startScrollY: this.cameras.main.scrollY,
    };
  }

  private handleCameraPointerMove(pointer: Phaser.Input.Pointer) {
    const pointerId = pointer.id;
    if (!this.activeCameraPointers.has(pointerId)) return;
    const point = this.screenPointFromPointer(pointer);
    this.activeCameraPointers.set(pointerId, point);

    if (this.activeCameraPointers.size >= 2) {
      this.updateCameraPinch();
      return;
    }

    if (!this.cameraDrag || this.cameraDrag.pointerId !== pointerId) return;
    const deltaX = point.x - this.cameraDrag.startX;
    const deltaY = point.y - this.cameraDrag.startY;
    if (Math.hypot(deltaX, deltaY) > CAMERA_DRAG_THRESHOLD) this.cameraInteractionMoved = true;

    const camera = this.cameras.main;
    camera.setScroll(
      this.cameraDrag.startScrollX - (deltaX / camera.zoom),
      this.cameraDrag.startScrollY - (deltaY / camera.zoom),
    );
    this.clampCameraToWorld();
  }

  private handleCameraPointerUp(pointer: Phaser.Input.Pointer) {
    this.activeCameraPointers.delete(pointer.id);
    this.cameraDrag = null;
    this.cameraPinch = null;

    const remainingPointer = Array.from(this.activeCameraPointers.entries())[0];
    if (remainingPointer) {
      const [pointerId, point] = remainingPointer;
      this.cameraDrag = {
        pointerId,
        startX: point.x,
        startY: point.y,
        startScrollX: this.cameras.main.scrollX,
        startScrollY: this.cameras.main.scrollY,
      };
    }
  }

  private handleCameraWheel(
    pointer: Phaser.Input.Pointer,
    _gameObjects: Phaser.GameObjects.GameObject[],
    _deltaX: number,
    deltaY: number,
  ) {
    this.stopCameraMotion();
    this.cameraMode = 'manual';
    const point = this.screenPointFromPointer(pointer);
    const factor = Math.exp(-deltaY * WHEEL_ZOOM_SENSITIVITY);
    this.zoomCameraAtScreenPoint(this.cameras.main.zoom * factor, point.x, point.y);
  }

  private beginCameraPinch() {
    const points = Array.from(this.activeCameraPointers.values());
    if (points.length < 2) return;
    const [first, second] = points;
    const screenPoint = {
      x: (first.x + second.x) / 2,
      y: (first.y + second.y) / 2,
    };
    const worldPoint = this.screenPointToWorld(screenPoint.x, screenPoint.y);
    this.cameraPinch = {
      startDistance: Math.max(1, pointDistance(first, second)),
      startZoom: this.cameras.main.zoom,
      worldPoint,
    };
    this.cameraDrag = null;
  }

  private updateCameraPinch() {
    const points = Array.from(this.activeCameraPointers.values());
    if (points.length < 2) return;
    if (!this.cameraPinch) this.beginCameraPinch();
    if (!this.cameraPinch) return;

    const [first, second] = points;
    const distance = Math.max(1, pointDistance(first, second));
    const screenPoint = {
      x: (first.x + second.x) / 2,
      y: (first.y + second.y) / 2,
    };
    if (Math.abs(distance - this.cameraPinch.startDistance) > CAMERA_DRAG_THRESHOLD) {
      this.cameraInteractionMoved = true;
    }

    const zoom = this.cameraPinch.startZoom * (distance / this.cameraPinch.startDistance);
    this.zoomCameraAtScreenPoint(zoom, screenPoint.x, screenPoint.y, this.cameraPinch.worldPoint);
  }

  private zoomCameraAtScreenPoint(zoom: number, screenX: number, screenY: number, fixedWorldPoint?: WorldPoint) {
    const camera = this.cameras.main;
    const { width, height } = this.cameraViewportSize();
    const originX = width * camera.originX;
    const originY = height * camera.originY;
    const worldPoint = fixedWorldPoint ?? this.screenPointToWorld(screenX, screenY);
    camera.setZoom(this.clampZoom(zoom));
    camera.setScroll(
      worldPoint.x - ((screenX - originX) / camera.zoom) - originX,
      worldPoint.y - ((screenY - originY) / camera.zoom) - originY,
    );
    this.clampCameraToWorld();
  }

  private screenPointToWorld(screenX: number, screenY: number): WorldPoint {
    const point = this.cameras.main.getWorldPoint(screenX, screenY);
    return { x: point.x, y: point.y };
  }

  private screenPointFromPointer(pointer: Phaser.Input.Pointer): WorldPoint {
    const event = pointer.event;
    if (event instanceof MouseEvent || event instanceof WheelEvent) {
      this.scale.updateBounds();
      return {
        x: this.scale.transformX(event.pageX),
        y: this.scale.transformY(event.pageY),
      };
    }
    return { x: pointer.x, y: pointer.y };
  }

  private stopCameraMotion() {
    const camera = this.cameras.main;
    camera.panEffect.reset();
    camera.zoomEffect.reset();
  }

  private createWorldProps() {
    for (const prop of this.worldData.props) {
      if (DEBUG_TREE_TEST && !isTreeTestProp(prop.id)) continue;
      const renderX = prop.renderX ?? prop.x;
      const renderY = prop.renderY ?? prop.y;
      const image = this.add.image(renderX, renderY, prop.key)
        .setOrigin(0, 0)
        .setScale(prop.scale ?? 1)
        .setDepth(prop.layer === 'ground' ? DEPTH.groundDetail : DEPTH.actorBase + prop.depthY)
        .setData('zone', prop.zone);
      if (prop.crop) {
        image.setCrop(prop.crop.x, prop.crop.y, prop.crop.width, prop.crop.height);
      }
      this.props.push(image);

      if (prop.glow) {
        const glow = this.add.circle(prop.glow.x, prop.glow.y, prop.glow.radius, prop.glow.color, 0.16)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(DEPTH.ambient + prop.glow.y / 10)
          .setData('zone', prop.zone);
        this.props.push(glow as unknown as Phaser.GameObjects.Image);
        this.tweens.add({
          targets: glow,
          alpha: { from: 0.09, to: 0.26 },
          scale: { from: 0.92, to: 1.12 },
          duration: Phaser.Math.Between(1000, 1800),
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      }
    }
  }

  private createForegroundWorkspaceProps() {
    const workspace = this.cache.json.get(FOREGROUND_WORKSPACE_INDEX_ASSET.key) as ForegroundWorkspaceIndex | undefined;
    const sprites = workspace?.sprites ?? [];
    if (sprites.length === 0) return;

    const pendingSprites = sprites.filter((sprite) => !this.textures.exists(foregroundWorkspaceTextureKey(sprite.id)));
    if (pendingSprites.length === 0) {
      this.addForegroundWorkspaceSprites(sprites);
      return;
    }

    for (const sprite of pendingSprites) {
      this.load.image(foregroundWorkspaceTextureKey(sprite.id), sprite.sprite);
    }
    this.load.once('complete', () => this.addForegroundWorkspaceSprites(sprites));
    this.load.start();
  }

  private addForegroundWorkspaceSprites(sprites: ForegroundWorkspaceSprite[]) {
    for (const sprite of sprites) {
      const key = foregroundWorkspaceTextureKey(sprite.id);
      if (!this.textures.exists(key)) continue;

      const image = this.add.image(sprite.x, sprite.y, key)
        .setOrigin(0, 0)
        .setDepth(DEPTH.actorBase + sprite.depthY)
        .setData('zone', GROUND_PREVIEW_ZONE)
        .setData('maskSource', sprite.maskSource);
      this.props.push(image);
    }
    this.applyFocusVisibility();
  }

  private createManifestRuntimeOcclusionSprites() {
    const workspace = this.cache.json.get(MANIFEST_RUNTIME_INDEX_ASSET.key) as ForegroundWorkspaceIndex | undefined;
    const sprites = workspace?.sprites ?? [];
    if (sprites.length === 0) return;

    const pendingSprites = sprites.filter((sprite) => !this.textures.exists(manifestRuntimeTextureKey(sprite.id)));
    if (pendingSprites.length === 0) {
      this.addManifestRuntimeOcclusionSprites(sprites);
      return;
    }

    for (const sprite of pendingSprites) {
      this.load.image(manifestRuntimeTextureKey(sprite.id), sprite.sprite);
    }
    this.load.once('complete', () => this.addManifestRuntimeOcclusionSprites(sprites));
    this.load.start();
  }

  private addManifestRuntimeOcclusionSprites(sprites: ForegroundWorkspaceSprite[]) {
    for (const sprite of sprites) {
      const key = manifestRuntimeTextureKey(sprite.id);
      if (!this.textures.exists(key)) continue;

      const image = this.add.image(sprite.x, sprite.y, key)
        .setOrigin(0, 0)
        .setDepth(DEPTH.actorBase + sprite.depthY)
        .setData('zone', sprite.zone ?? 'center')
        .setData('maskSource', sprite.maskSource);
      this.props.push(image);
    }
    this.applyFocusVisibility();
  }

  private createBaseLayer() {
    if (DEBUG_MANIFEST_WORLD || MANIFEST_RUNTIME) {
      this.createWorldLayerChunks(this.worldData.referenceChunks, DEPTH.ground);
      return;
    }

    if (GROUND_PREVIEW_VARIANT) {
      this.add.image(0, 0, GENERATED_GROUND_PREVIEW_ASSET.key)
        .setOrigin(0, 0)
        .setDepth(DEPTH.ground);
      return;
    }

    this.createWorldLayerChunks(this.worldData.groundChunks, DEPTH.ground);
  }

  private createWorldLayerChunks(chunks: WorldMapChunk[], depth: number, alpha = 1) {
    for (const chunk of chunks) {
      if (!this.textures.exists(chunk.key)) {
        console.warn(`[LivingWorldScene] Missing world chunk texture "${chunk.key}" (${chunk.src})`);
        continue;
      }

      const image = this.add.image(chunk.x, chunk.y, chunk.key)
        .setOrigin(0, 0)
        .setDepth(depth)
        .setAlpha(alpha)
        .setData('chunkId', chunk.id);

      if (chunk.width > 0 && chunk.height > 0) {
        image.setDisplaySize(chunk.width, chunk.height);
      }
    }
  }

  private createActors() {
    const activeAgentConfigs = DEV_BACON_CHUNK_TEST
      ? [...AGENT_ACTOR_CONFIG, BACON_AGENT_ACTOR_CONFIG]
      : AGENT_ACTOR_CONFIG;
    const agentConfigs = DEBUG_ISOLATED_TEST
      ? AGENT_ACTOR_CONFIG.filter((config) => config.id === 'apex')
      : activeAgentConfigs;
    for (const config of agentConfigs) {
      this.actors.push(this.createActor(config));
    }

    if (DEBUG_ISOLATED_TEST) {
      this.applyFocusVisibility();
      return;
    }

    const helperConfigs = DEV_BACON_CHUNK_TEST
      ? [...HELPER_CONFIG, ...BACON_HELPER_CONFIG]
      : HELPER_CONFIG;
    for (const helper of helperConfigs) {
      for (let i = 0; i < helper.count; i += 1) {
        const point = this.randomNavPoint(helper.zone);
        const texture = helper.textures[i % helper.textures.length];
        this.actors.push(this.createActor({
          id: `${helper.kind}-${i}`,
          zone: helper.zone,
          kind: helper.kind,
          idleTexture: texture,
          actionTextures: helper.textures,
          x: point.x,
          y: point.y,
          speed: helper.speed,
          scale: helper.scale,
        }));
      }
    }
    this.applyFocusVisibility();
  }

  private createReferenceOverlay() {
    this.createWorldLayerChunks(this.worldData.referenceChunks, DEPTH.reference, REFERENCE_OPACITY);
  }

  private applyFocusVisibility() {
    for (const actor of this.actors) {
      actor.container.setVisible(this.focusedZone === null || actor.zone === this.focusedZone);
    }
    for (const prop of this.props) {
      const zone = prop.getData('zone') as string | undefined;
      prop.setVisible(this.focusedZone === null || zone === this.focusedZone || zone === 'center');
    }
  }

  private createActor(config: {
    id: string;
    zone: ZoneId;
    kind: ActorKind;
    idleTexture: string;
    actionTextures: string[];
    x: number;
    y: number;
    speed: number;
    scale: number;
  }): LivingActor {
    const spawn = this.safeActorSpawnPoint(config.zone, { x: config.x, y: config.y });
    const shadow = this.add.ellipse(0, 0, 36, 13, 0x21170f, 0.3)
      .setVisible(ACTOR_SHADOWS_ENABLED);
    const sprite = this.add.image(0, 0, config.idleTexture)
      .setOrigin(0.5, 1)
      .setScale(config.scale);
    sprite.y = this.actorSpriteYOffsetForScale(config.scale);
    const container = this.add.container(spawn.x, spawn.y, [shadow, sprite])
      .setDepth(DEPTH.actorBase + spawn.y);
    return {
      id: config.id,
      kind: config.kind,
      zone: config.zone,
      idleTexture: config.idleTexture,
      actionTextures: config.actionTextures,
      walkSheet: actorWalkSheetForTexture(config.idleTexture),
      walkDirection: 'down',
      container,
      sprite,
      shadow,
      speed: config.speed,
      scale: config.scale,
      currentScale: config.scale,
      walkSeed: Math.random() * Math.PI * 2,
      lastDepth: DEPTH.actorBase + Math.round(spawn.y),
      nextTaskAt: this.time.now + Phaser.Math.Between(500, 4200),
      busy: false,
      walking: false,
    };
  }

  private assignTask(actor: LivingActor) {
    actor.busy = true;
    const isHelper = actor.kind.endsWith('helper');
    const zonePois = this.worldData.pois.filter((poi) => {
      if (poi.zone !== actor.zone) return false;
      return isHelper ? poi.helperOnly === true : poi.helperOnly !== true;
    });
    const usePoi = zonePois.length > 0 && Math.random() < (isHelper ? 0.62 : 0.76);
    const poi = usePoi ? Phaser.Utils.Array.GetRandom(zonePois) : null;
    const desiredPoint = poi ? { x: poi.x, y: poi.y } : this.randomNavPoint(actor.zone);
    const point = this.spreadDestinationForActor(actor, desiredPoint);
    this.reserveDestination(actor, point);
    const path = this.pathTo(actor.zone, { x: actor.container.x, y: actor.container.y }, point);
    if (!path) {
      this.destinationReservations.delete(actor.id);
      this.idleThen(actor, this.time.now, Phaser.Math.Between(700, 1600));
      return;
    }
    this.setActorTexture(actor, actor.idleTexture);
    this.moveAlongPath(actor, path, () => {
      if (poi) {
        this.performAction(actor, poi);
      } else {
        const delay = actor.kind.endsWith('helper')
          ? Phaser.Math.Between(1400, 3600)
          : Phaser.Math.Between(800, 2200);
        this.idleThen(actor, this.time.now, delay);
      }
    });
  }

  private performAction(actor: LivingActor, poi: Poi) {
    actor.walking = false;
    this.resetActorPose(actor);
    if (poi.actionTexture && this.textures.exists(poi.actionTexture)) {
      this.setActorTexture(actor, poi.actionTexture);
    } else if (actor.actionTextures.length > 0) {
      this.setActorTexture(actor, Phaser.Utils.Array.GetRandom(actor.actionTextures));
    }
    this.triggerEffect(poi);
    const duration = actor.kind.endsWith('helper')
      ? Phaser.Math.Between(2600, 5600)
      : Phaser.Math.Between(2100, 4300);
    this.tweens.add({
      targets: actor.sprite,
      scaleX: actor.currentScale * 1.045,
      scaleY: actor.currentScale * 1.045,
      duration: 520,
      yoyo: true,
      repeat: Math.floor(duration / 1040),
      ease: 'Sine.easeInOut',
    });
    this.time.delayedCall(duration, () => {
      this.setActorTexture(actor, actor.idleTexture);
      this.resetActorPose(actor);
      this.idleThen(actor, this.time.now, Phaser.Math.Between(450, 1400));
    });
  }

  private idleThen(actor: LivingActor, time: number, delay: number) {
    actor.busy = false;
    actor.nextTaskAt = time + delay;
  }

  private pathTo(zone: ZoneId, from: WorldPoint, to: WorldPoint) {
    if (this.manifestRuntimeWalkableZones.has(zone)) {
      return this.exactManifestPathTo(zone, from, to);
    }

    const mesh = this.zoneNavMeshes.get(zone);
    if (!mesh || !mesh.isPointInMesh(from) || !mesh.isPointInMesh(to)) return null;
    const route = mesh.findPath(from, to);
    if (!route || route.length === 0) return null;
    return route.map((point) => new Phaser.Math.Vector2(point.x, point.y));
  }

  private randomNavPoint(zone: ZoneId): WorldPoint {
    const polygons = this.zoneNavPolygons.get(zone) ?? this.worldData.navMeshPolygons[zone];
    const polygon = Phaser.Utils.Array.GetRandom(polygons);
    const bounds = polygonBounds(polygon);
    for (let i = 0; i < 80; i += 1) {
      const point = {
        x: Phaser.Math.Between(bounds.minX + 12, bounds.maxX - 12),
        y: Phaser.Math.Between(bounds.minY + 12, bounds.maxY - 12),
      };
      if (this.manifestRuntimeWalkableZones.has(zone)) {
        if (this.isExactManifestWalkablePoint(zone, point)) return point;
      } else if (pointInPolygon(point, polygon)) {
        return point;
      }
    }
    const fallback = {
      x: (bounds.minX + bounds.maxX) / 2,
      y: (bounds.minY + bounds.maxY) / 2,
    };
    return this.isActorPointWalkable(zone, fallback)
      ? fallback
      : this.nearestWalkablePoint(zone, fallback) ?? fallback;
  }

  private spreadDestinationForActor(actor: LivingActor, desiredPoint: WorldPoint) {
    const fallback = this.nearestWalkablePoint(actor.zone, desiredPoint) ?? this.randomNavPoint(actor.zone);
    let bestWalkablePoint = fallback;
    const angleOffset = actor.walkSeed;

    for (const radius of DESTINATION_SEARCH_RADII) {
      const steps = radius === 0 ? 1 : Math.max(8, Math.ceil((Math.PI * 2 * radius) / 24));
      for (let index = 0; index < steps; index += 1) {
        const angle = angleOffset + ((Math.PI * 2 * index) / steps);
        const point = radius === 0
          ? desiredPoint
          : {
              x: desiredPoint.x + Math.cos(angle) * radius,
              y: desiredPoint.y + Math.sin(angle) * radius,
            };
        if (!this.isActorPointWalkable(actor.zone, point)) continue;
        bestWalkablePoint = point;
        if (this.isDestinationAvailableForActor(actor, point)) return point;
      }
    }

    return this.isDestinationAvailableForActor(actor, bestWalkablePoint)
      ? bestWalkablePoint
      : this.randomSpacedNavPoint(actor) ?? bestWalkablePoint;
  }

  private randomSpacedNavPoint(actor: LivingActor) {
    for (let attempt = 0; attempt < 32; attempt += 1) {
      const point = this.randomNavPoint(actor.zone);
      if (this.isDestinationAvailableForActor(actor, point)) return point;
    }
    return null;
  }

  private reserveDestination(actor: LivingActor, point: WorldPoint) {
    this.destinationReservations.set(actor.id, {
      zone: actor.zone,
      point,
      spacing: this.destinationSpacingForActor(actor),
    });
  }

  private isDestinationAvailableForActor(actor: LivingActor, point: WorldPoint) {
    const spacing = this.destinationSpacingForActor(actor);

    for (const otherActor of this.actors) {
      if (otherActor.id === actor.id || otherActor.zone !== actor.zone) continue;
      const otherSpacing = this.destinationSpacingForActor(otherActor);
      const minimumDistance = Math.max(spacing, otherSpacing);
      if (pointDistance(point, { x: otherActor.container.x, y: otherActor.container.y }) < minimumDistance) {
        return false;
      }
    }

    for (const [actorId, reservation] of this.destinationReservations.entries()) {
      if (actorId === actor.id || reservation.zone !== actor.zone) continue;
      const minimumDistance = Math.max(spacing, reservation.spacing);
      if (pointDistance(point, reservation.point) < minimumDistance) return false;
    }

    return true;
  }

  private destinationSpacingForActor(actor: Pick<LivingActor, 'kind'>) {
    return actor.kind.endsWith('helper') ? HELPER_DESTINATION_SPACING : AGENT_DESTINATION_SPACING;
  }

  private safeActorSpawnPoint(zone: ZoneId, preferred: WorldPoint) {
    if (this.isActorPointWalkable(zone, preferred)) return preferred;
    return this.nearestWalkablePoint(zone, preferred) ?? this.randomNavPoint(zone);
  }

  private nearestWalkablePoint(zone: ZoneId, origin: WorldPoint) {
    let bestPoint: WorldPoint | null = null;
    let bestDistance = Infinity;
    const consider = (point: WorldPoint) => {
      if (!this.isActorPointWalkable(zone, point)) return;
      const distance = pointDistance(origin, point);
      if (distance >= bestDistance) return;
      bestPoint = point;
      bestDistance = distance;
    };

    for (let radius = 12; radius <= 260; radius += 12) {
      const steps = Math.max(10, Math.ceil((Math.PI * 2 * radius) / 18));
      for (let index = 0; index < steps; index += 1) {
        const angle = (Math.PI * 2 * index) / steps;
        consider({
          x: origin.x + Math.cos(angle) * radius,
          y: origin.y + Math.sin(angle) * radius,
        });
      }
      if (bestPoint) return bestPoint;
    }

    for (const polygon of this.worldData.navMeshPolygons[zone] ?? []) {
      const bounds = polygonBounds(polygon);
      consider({
        x: (bounds.minX + bounds.maxX) / 2,
        y: (bounds.minY + bounds.maxY) / 2,
      });
      for (const vertex of sparsePolygonVertices(polygon, 24)) {
        consider(vertex);
      }
    }

    return bestPoint;
  }

  private isActorPointWalkable(zone: ZoneId, point: WorldPoint) {
    if (this.manifestRuntimeWalkableZones.has(zone)) {
      return this.isExactManifestWalkablePoint(zone, point);
    }
    return this.zoneNavMeshes.get(zone)?.isPointInMesh(point) ?? false;
  }

  private moveAlongPath(actor: LivingActor, path: Phaser.Math.Vector2[], onComplete: () => void) {
    actor.walking = true;
    const walkNext = (index: number) => {
      const target = path[index];
      if (!target) {
        actor.walking = false;
        this.setActorTexture(actor, actor.idleTexture);
        this.resetActorPose(actor);
        onComplete();
        return;
      }
      const distance = Phaser.Math.Distance.Between(actor.container.x, actor.container.y, target.x, target.y);
      if (distance < 4) {
        walkNext(index + 1);
        return;
      }
      this.setActorWalkDirection(actor, target);
      const duration = Math.max(MIN_WALK_SEGMENT_DURATION_MS, (distance / actor.speed) * 1000);
      this.tweens.add({
        targets: actor.container,
        x: target.x,
        y: target.y,
        duration,
        ease: 'Linear',
        onComplete: () => walkNext(index + 1),
      });
    };
    walkNext(0);
  }

  private buildZoneNavPolygons(zone: ZoneId): WorldPoint[][] {
    if (this.manifestRuntimeWalkableZones.has(zone)) {
      return this.worldData.navMeshPolygons[zone].filter((polygon) => polygon.length >= 3);
    }

    const rect = navBoundsForZone(this.worldData.navMeshPolygons[zone], this.worldData.zones[zone].rect, this.worldData.worldBounds);
    const cols = Math.ceil(rect.width / NAV_TILE_SIZE);
    const rows = Math.ceil(rect.height / NAV_TILE_SIZE);
    const grid = Array.from({ length: rows }, (_, row) => (
      Array.from({ length: cols }, (_, col) => {
        const point = {
          x: rect.x + col * NAV_TILE_SIZE + NAV_TILE_SIZE / 2,
          y: rect.y + row * NAV_TILE_SIZE + NAV_TILE_SIZE / 2,
        };
        return this.isWalkableNavPoint(zone, point) ? 1 : 0;
      })
    ));

    const localPolygons = buildPolysFromGridMap
      ? buildPolysFromGridMap(grid, NAV_TILE_SIZE, NAV_TILE_SIZE, (value) => value === 1, NAV_SHRINK)
      : cellsToPolygons(grid, NAV_TILE_SIZE);

    return localPolygons
      .map((polygon) => polygon.map((point) => ({ x: point.x + rect.x, y: point.y + rect.y })))
      .filter((polygon) => polygon.length >= 3);
  }

  private isWalkableNavPoint(zone: ZoneId, point: WorldPoint) {
    const insideZonePath = this.worldData.navMeshPolygons[zone].some((polygon) => pointInPolygon(point, polygon));
    if (!insideZonePath) return false;
    return !this.worldData.colliders.some((collider) => (
      collider.zone === zone && pointNearPolygon(point, collider.points, NAV_COLLIDER_PADDING)
    ));
  }

  private exactManifestPathTo(zone: ZoneId, from: WorldPoint, to: WorldPoint) {
    if (!this.isExactManifestWalkablePoint(zone, from) || !this.isExactManifestWalkablePoint(zone, to)) return null;
    if (this.isExactManifestWalkableSegment(zone, from, to)) {
      return [from, to].map((point) => new Phaser.Math.Vector2(point.x, point.y));
    }

    const candidates = this.exactManifestPathCandidates(zone, from, to);
    const route = shortestVisibilityPath(candidates, (start, end) => (
      this.isExactManifestWalkableSegment(zone, start, end)
    ));
    return route?.map((point) => new Phaser.Math.Vector2(point.x, point.y)) ?? null;
  }

  private exactManifestPathCandidates(zone: ZoneId, from: WorldPoint, to: WorldPoint) {
    const points: WorldPoint[] = [from, to];
    for (const polygon of this.worldData.navMeshPolygons[zone] ?? []) {
      points.push(...sparsePolygonVertices(polygon, MAX_WALKABLE_ROUTE_VERTICES));
    }

    const routeColliders = this.collidersForZone(zone)
      .map((collider) => ({
        collider,
        distance: distancePolygonToSegment(collider.points, from, to),
        intersects: segmentIntersectsPolygon(from, to, collider.points),
      }))
      .filter((candidate) => candidate.intersects || candidate.distance <= MANIFEST_NAV_CORRIDOR_PADDING)
      .sort((left, right) => (
        Number(right.intersects) - Number(left.intersects)
        || left.distance - right.distance
      ));

    for (const { collider } of routeColliders) {
      if (points.length >= MAX_MANIFEST_NAV_CANDIDATES) break;
      points.push(...offsetPolygonVertexCandidates(collider.points, MANIFEST_NAV_VERTEX_OFFSET));
    }

    return uniquePoints(points)
      .slice(0, MAX_MANIFEST_NAV_CANDIDATES)
      .filter((point, index) => index < 2 || this.isExactManifestWalkablePoint(zone, point));
  }

  private collidersForZone(zone: ZoneId) {
    const cached = this.zoneColliderCache.get(zone);
    if (cached) return cached;
    const colliders = this.worldData.colliders.filter((candidate) => candidate.zone === zone);
    this.zoneColliderCache.set(zone, colliders);
    return colliders;
  }

  private isInsideManifestWalkableZone(zone: ZoneId, point: WorldPoint) {
    return (this.worldData.navMeshPolygons[zone] ?? [])
      .some((polygon) => pointInOrOnPolygon(point, polygon));
  }

  private isExactManifestWalkablePoint(zone: ZoneId, point: WorldPoint) {
    if (!this.isInsideManifestWalkableZone(zone, point)) return false;

    return !this.collidersForZone(zone).some((collider) => (
      pointInOrOnPolygon(point, collider.points)
    ));
  }

  private isExactManifestWalkableSegment(zone: ZoneId, start: WorldPoint, end: WorldPoint) {
    if (!this.isExactManifestWalkablePoint(zone, start) || !this.isExactManifestWalkablePoint(zone, end)) return false;

    const distance = Phaser.Math.Distance.Between(start.x, start.y, end.x, end.y);
    const samples = Math.max(1, Math.ceil(distance / MANIFEST_NAV_SAMPLE_STEP));
    for (let sample = 1; sample < samples; sample += 1) {
      const t = sample / samples;
      if (!this.isInsideManifestWalkableZone(zone, {
        x: start.x + ((end.x - start.x) * t),
        y: start.y + ((end.y - start.y) * t),
      })) {
        return false;
      }
    }

    return !this.collidersForZone(zone).some((collider) => (
      segmentIntersectsPolygon(start, end, collider.points)
    ));
  }

  private setActorTexture(actor: LivingActor, texture: string) {
    actor.sprite.setTexture(texture);
    actor.sprite.setFlipX(false);
    actor.currentScale = actor.scale * (TEXTURE_SCALE[texture] ?? 1);
    actor.sprite.setScale(actor.currentScale);
    actor.sprite.y = this.actorSpriteYOffset(actor);
  }

  private applyWalkCycle(actor: LivingActor, time: number) {
    if (this.applyDirectionalWalkFrame(actor, time)) return;

    const step = Math.sin(time / 86 + actor.walkSeed);
    const lift = Math.abs(step);
    actor.sprite.y = this.actorSpriteYOffset(actor) - (lift * 5);
    actor.sprite.rotation = step * 0.055;
    actor.sprite.scaleX = actor.currentScale * (1 + lift * 0.035);
    actor.sprite.scaleY = actor.currentScale * (1 - lift * 0.035);
    actor.shadow.scaleX = 1 + lift * 0.12;
    actor.shadow.scaleY = 1 - lift * 0.08;
    actor.shadow.alpha = 0.22 + (1 - lift) * 0.08;
  }

  private setActorWalkDirection(actor: LivingActor, target: WorldPoint) {
    const dx = target.x - actor.container.x;
    const dy = target.y - actor.container.y;
    if (Math.abs(dx) > Math.abs(dy)) {
      actor.walkDirection = dx < 0 ? 'left' : 'right';
    } else {
      actor.walkDirection = dy < 0 ? 'up' : 'down';
    }

    if (!actor.walkSheet || !this.textures.exists(actor.walkSheet)) {
      actor.sprite.setFlipX(dx < 0);
      return;
    }
    actor.sprite.setFlipX(false);
  }

  private applyDirectionalWalkFrame(actor: LivingActor, time: number) {
    if (!actor.walkSheet || !this.textures.exists(actor.walkSheet)) return false;

    const directionIndex = WALK_DIRECTIONS.indexOf(actor.walkDirection);
    const frameOffset = Math.max(0, directionIndex) * WALK_FRAME_COUNT;
    const phase = Math.floor(((time / WALK_FRAME_DURATION_MS) + (actor.walkSeed * 2)) % WALK_FRAME_COUNT);
    const frame = frameOffset + phase;

    if (actor.sprite.texture.key !== actor.walkSheet) {
      actor.sprite.setTexture(actor.walkSheet, frame);
    } else {
      actor.sprite.setFrame(frame);
    }

    actor.currentScale = actor.scale;
    actor.sprite.setScale(actor.currentScale);
    actor.sprite.y = this.actorSpriteYOffset(actor);
    actor.sprite.rotation = 0;
    actor.shadow.setScale(1);
    actor.shadow.alpha = 0.3;
    return true;
  }

  private resetActorPose(actor: LivingActor) {
    actor.sprite.y = this.actorSpriteYOffset(actor);
    actor.sprite.rotation = 0;
    actor.sprite.setScale(actor.currentScale);
    actor.shadow.setScale(1);
    actor.shadow.alpha = 0.3;
  }

  private actorSpriteYOffset(actor: LivingActor) {
    return this.actorSpriteYOffsetForScale(actor.currentScale);
  }

  private actorSpriteYOffsetForScale(scale: number) {
    return this.actorTextureBottomPadding * scale;
  }

  private triggerEffect(poi: Poi) {
    const x = poi.effectX ?? poi.x;
    const y = poi.effectY ?? poi.y;
    if (poi.effect === 'apex-strike') {
      this.slashBurst(x + 8, y - 54, 0xfff3b0);
      this.cameraMicroShake();
      return;
    }
    if (poi.effect === 'apex-meditate') {
      this.ringPulse(x, y - 30, 0xf2a8be, 58);
      this.spawnPetalSpiral(x, y - 38);
      return;
    }
    if (poi.effect === 'metheus-read') {
      this.noteFloat(x, y - 46);
      this.ringPulse(x, y - 34, 0xf0c16d, 46);
      return;
    }
    if (poi.effect === 'metheus-telescope') {
      this.starTwinkle(x + 22, y - 70);
      this.ringPulse(x, y - 44, 0xb9d5ff, 52);
      return;
    }
    if (poi.effect === 'gale-cast') {
      this.lightningArc(x, y - 62);
      this.ringPulse(x, y - 34, 0x7edcff, 62);
      return;
    }
    if (poi.effect === 'gale-globe') {
      this.globePulse(x, y - 30);
      return;
    }
    if (poi.effect === 'bacon-cook') {
      this.ovenFlare(x, y);
      return;
    }
    if (poi.effect === 'bacon-harvest') {
      this.harvestPop(x, y);
      return;
    }
    this.helperSpark(x, y - 28);
  }

  private createAmbientLife() {
    this.createPetalField();
    this.createWeatherSparks();
    this.createBookMotes();
    this.createLanternFlicker();
  }

  private createPetalField() {
    for (let i = 0; i < 18; i += 1) {
      const petal = this.add.ellipse(
        Phaser.Math.Between(40, 770),
        Phaser.Math.Between(38, 470),
        Phaser.Math.Between(4, 8),
        3,
        0xffb4cf,
        Phaser.Math.FloatBetween(0.34, 0.7),
      ).setDepth(DEPTH.ambient);
      this.loopDrift(petal, Phaser.Math.Between(4600, 9000), 0xffb4cf);
    }
  }

  private createWeatherSparks() {
    for (let i = 0; i < 12; i += 1) {
      const spark = this.add.circle(
        Phaser.Math.Between(65, 680),
        Phaser.Math.Between(620, 980),
        Phaser.Math.FloatBetween(1.5, 3.5),
        0x65e5ff,
        Phaser.Math.FloatBetween(0.35, 0.82),
      ).setDepth(DEPTH.ambient + 70);
      this.loopDrift(spark, Phaser.Math.Between(2600, 6200), 0x65e5ff);
    }
  }

  private createBookMotes() {
    for (let i = 0; i < 12; i += 1) {
      const mote = this.add.rectangle(
        Phaser.Math.Between(820, 1450),
        Phaser.Math.Between(85, 430),
        Phaser.Math.Between(3, 6),
        Phaser.Math.Between(3, 7),
        0xf2d28b,
        Phaser.Math.FloatBetween(0.28, 0.6),
      ).setDepth(DEPTH.ambient + 10);
      this.loopDrift(mote, Phaser.Math.Between(3800, 7800), 0xf2d28b);
    }
  }

  private createLanternFlicker() {
    const lamps = [
      { x: 315, y: 225 },
      { x: 590, y: 300 },
      { x: 845, y: 365 },
      { x: 1210, y: 245 },
      { x: 520, y: 820 },
    ];
    for (const lamp of lamps) {
      const glow = this.add.circle(lamp.x, lamp.y, 22, 0xffca73, 0.12)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(DEPTH.ambient + lamp.y / 10);
      this.tweens.add({
        targets: glow,
        alpha: { from: 0.06, to: 0.22 },
        scale: { from: 0.92, to: 1.12 },
        duration: Phaser.Math.Between(900, 1600),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
  }

  private loopDrift(obj: Phaser.GameObjects.Shape, duration: number, color: number) {
    const origin = { x: obj.x, y: obj.y };
    const drift = () => {
      obj.setPosition(origin.x, origin.y);
      obj.setAlpha(Phaser.Math.FloatBetween(0.25, 0.75));
      obj.setFillStyle(color, obj.alpha);
      this.tweens.add({
        targets: obj,
        x: origin.x + Phaser.Math.Between(-32, 54),
        y: origin.y + Phaser.Math.Between(-42, 36),
        alpha: 0,
        rotation: Phaser.Math.FloatBetween(-2, 2),
        duration,
        delay: Phaser.Math.Between(0, 2600),
        ease: 'Sine.easeInOut',
        onComplete: drift,
      });
    };
    drift();
  }

  private ringPulse(x: number, y: number, color: number, size: number) {
    const ring = this.add.ellipse(x, y, size, size * 0.46, color, 0.24)
      .setStrokeStyle(2, color, 0.65)
      .setDepth(DEPTH.effectBase + y);
    this.tweens.add({
      targets: ring,
      alpha: 0,
      scaleX: 1.9,
      scaleY: 1.6,
      duration: 760,
      ease: 'Sine.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  private slashBurst(x: number, y: number, color: number) {
    for (let i = 0; i < 4; i += 1) {
      const lineObj = this.add.rectangle(x, y + i * 7, 48 - i * 7, 3, color, 0.86)
        .setRotation(Phaser.Math.DegToRad(-22 + i * 9))
        .setDepth(DEPTH.effectBase + y);
      this.tweens.add({
        targets: lineObj,
        alpha: 0,
        x: x + 36,
        duration: 380,
        ease: 'Cubic.easeOut',
        onComplete: () => lineObj.destroy(),
      });
    }
  }

  private lightningArc(x: number, y: number) {
    for (let i = 0; i < 5; i += 1) {
      const bolt = this.add.line(
        x,
        y,
        0,
        0,
        Phaser.Math.Between(-32, 32),
        Phaser.Math.Between(-18, 34),
        0xb7efff,
        0.95,
      ).setOrigin(0, 0).setLineWidth(2).setDepth(DEPTH.effectBase + y);
      this.tweens.add({
        targets: bolt,
        alpha: 0,
        duration: Phaser.Math.Between(160, 280),
        delay: i * 60,
        onComplete: () => bolt.destroy(),
      });
    }
  }

  private globePulse(x: number, y: number) {
    for (let i = 0; i < 3; i += 1) {
      this.time.delayedCall(i * 180, () => this.ringPulse(x, y, 0x65e5ff, 70 + i * 18));
    }
    this.lightningArc(x + 8, y - 16);
  }

  private noteFloat(x: number, y: number) {
    for (let i = 0; i < 4; i += 1) {
      const note = this.add.rectangle(x + Phaser.Math.Between(-20, 20), y, 10, 13, 0xf1d08a, 0.9)
        .setStrokeStyle(1, 0x6f4a24, 0.6)
        .setDepth(DEPTH.effectBase + y);
      this.tweens.add({
        targets: note,
        y: y - Phaser.Math.Between(24, 52),
        x: note.x + Phaser.Math.Between(-16, 16),
        alpha: 0,
        rotation: Phaser.Math.FloatBetween(-0.5, 0.5),
        duration: Phaser.Math.Between(800, 1300),
        ease: 'Sine.easeOut',
        onComplete: () => note.destroy(),
      });
    }
  }

  private starTwinkle(x: number, y: number) {
    for (let i = 0; i < 7; i += 1) {
      const star = this.add.star(
        x + Phaser.Math.Between(-36, 36),
        y + Phaser.Math.Between(-24, 24),
        4,
        2,
        7,
        0xd9e8ff,
        0.92,
      ).setDepth(DEPTH.effectBase + y);
      this.tweens.add({
        targets: star,
        alpha: 0,
        scale: 1.8,
        duration: Phaser.Math.Between(420, 820),
        delay: i * 70,
        onComplete: () => star.destroy(),
      });
    }
  }

  private helperSpark(x: number, y: number) {
    const dot = this.add.circle(x, y, 5, 0xffe0a3, 0.82).setDepth(DEPTH.effectBase + y);
    this.tweens.add({
      targets: dot,
      alpha: 0,
      y: y - 22,
      scale: 1.6,
      duration: 620,
      ease: 'Sine.easeOut',
      onComplete: () => dot.destroy(),
    });
  }

  private ovenFlare(x: number, y: number) {
    this.ringPulse(x, y - 20, 0xffb35c, 64);
    for (let i = 0; i < 7; i += 1) {
      const ember = this.add.circle(
        x + Phaser.Math.Between(-28, 28),
        y + Phaser.Math.Between(-30, 18),
        Phaser.Math.Between(3, 6),
        Phaser.Math.RND.pick([0xffd27a, 0xff8a4a, 0xffefae]),
        0.82,
      ).setDepth(DEPTH.effectBase + y);
      this.tweens.add({
        targets: ember,
        y: ember.y - Phaser.Math.Between(24, 58),
        x: ember.x + Phaser.Math.Between(-16, 16),
        alpha: 0,
        scale: 1.7,
        duration: Phaser.Math.Between(560, 980),
        ease: 'Sine.easeOut',
        onComplete: () => ember.destroy(),
      });
    }
  }

  private harvestPop(x: number, y: number) {
    for (let i = 0; i < 6; i += 1) {
      const veggie = this.add.ellipse(
        x + Phaser.Math.Between(-22, 22),
        y - 18,
        Phaser.Math.Between(8, 13),
        Phaser.Math.Between(6, 10),
        Phaser.Math.RND.pick([0x83c75d, 0xf0c34f, 0xe85a47, 0xf07b35]),
        0.86,
      ).setDepth(DEPTH.effectBase + y);
      this.tweens.add({
        targets: veggie,
        y: y - Phaser.Math.Between(42, 72),
        alpha: 0,
        rotation: Phaser.Math.FloatBetween(-0.8, 0.8),
        duration: Phaser.Math.Between(700, 1120),
        ease: 'Sine.easeOut',
        onComplete: () => veggie.destroy(),
      });
    }
  }

  private spawnPetalSpiral(x: number, y: number) {
    for (let i = 0; i < 9; i += 1) {
      const petal = this.add.ellipse(x, y, 7, 4, 0xffa9c8, 0.78)
        .setRotation(Phaser.Math.FloatBetween(0, Math.PI))
        .setDepth(DEPTH.effectBase + y);
      this.tweens.add({
        targets: petal,
        x: x + Math.cos(i) * Phaser.Math.Between(34, 74),
        y: y + Math.sin(i * 1.7) * Phaser.Math.Between(18, 58),
        alpha: 0,
        rotation: petal.rotation + Phaser.Math.FloatBetween(1, 4),
        duration: Phaser.Math.Between(900, 1500),
        ease: 'Sine.easeOut',
        onComplete: () => petal.destroy(),
      });
    }
  }

  private createDebugOverlay() {
    const graphics = this.add.graphics().setDepth(DEPTH.debug);
    this.add.text(372, 18, [
      'DEBUG WORLD',
      'cyan = walkable/nav input',
      'red = blocked/collision',
      'white = prop baseline/depthY',
      'blue = ground prop bounds',
      'green dot = actor feet/depth',
      'click map = move Apex probe',
      '0-9/- = depth checkpoints',
    ].join('\n'), {
      color: '#ffffff',
      fontFamily: 'monospace',
      fontSize: '13px',
      backgroundColor: 'rgba(0,0,0,0.68)',
      padding: { left: 8, right: 8, top: 6, bottom: 6 },
    }).setDepth(DEPTH.debug + 10)
      .setScrollFactor(0);

    for (const [zone, polygons] of this.zoneNavPolygons.entries()) {
      const color = zone === 'apex' ? 0x39e8ff : zone === 'metheus' ? 0xffd36b : 0x79e8ff;
      graphics.lineStyle(2, color, 0.95);
      graphics.fillStyle(color, 0.12);
      for (const polygon of polygons) {
        graphics.beginPath();
        graphics.moveTo(polygon[0].x, polygon[0].y);
        for (const point of polygon.slice(1)) graphics.lineTo(point.x, point.y);
        graphics.closePath();
        graphics.fillPath();
        graphics.strokePath();
      }
    }

    for (const collider of this.worldData.colliders) {
      graphics.lineStyle(3, 0xff3030, 0.95);
      graphics.fillStyle(0xff3030, 0.24);
      graphics.beginPath();
      graphics.moveTo(collider.points[0].x, collider.points[0].y);
      for (const point of collider.points.slice(1)) graphics.lineTo(point.x, point.y);
      graphics.closePath();
      graphics.fillPath();
      graphics.strokePath();
      const bounds = polygonBounds(collider.points);
      this.add.text(bounds.minX, bounds.minY - 13, collider.id, {
        color: '#ff4f4f',
        fontFamily: 'monospace',
        fontSize: '10px',
        backgroundColor: 'rgba(0,0,0,0.52)',
        padding: { left: 2, right: 2, top: 1, bottom: 1 },
      }).setDepth(DEPTH.debug + 2)
        .setData('zone', collider.zone);
    }

    for (const prop of this.worldData.props) {
      const renderX = prop.renderX ?? prop.x;
      const renderY = prop.renderY ?? prop.y;
      const scale = prop.scale ?? 1;
      const renderWidth = (prop.crop?.width ?? prop.width ?? 0) * scale;
      const renderHeight = (prop.crop?.height ?? prop.height ?? 0) * scale;
      if (prop.layer === 'ground') {
        if (renderWidth && renderHeight) {
          graphics.lineStyle(1, 0x72a7ff, 0.26);
          graphics.strokeRect(renderX, renderY, renderWidth, renderHeight);
        }
        continue;
      }
      const label = this.add.text(renderX, prop.depthY - 14, prop.id, {
        color: '#ffffff',
        fontFamily: 'monospace',
        fontSize: '10px',
        backgroundColor: 'rgba(0,0,0,0.45)',
        padding: { left: 2, right: 2, top: 1, bottom: 1 },
      }).setDepth(DEPTH.debug + 1);
      label.setData('zone', prop.zone);
      graphics.lineStyle(1, 0xffffff, 0.55);
      graphics.lineBetween(renderX, prop.depthY, renderX + (renderWidth ?? 86), prop.depthY);
      graphics.fillStyle(0xffffff, 0.6);
      graphics.fillCircle(renderX, renderY, 3);
    }
    this.drawDebugDepthCheckpoints(graphics);
    this.createDebugActorMarkers();
  }

  private createManifestOverlay() {
    const manifest = this.cache.json.get(WORLD_OBJECT_MANIFEST.key) as WorldObjectManifest | undefined;
    const objects = manifest?.objects?.filter((object) => (
      !MANIFEST_ROLE_FILTER || object.role === MANIFEST_ROLE_FILTER
    )) ?? [];
    const graphics = this.add.graphics().setDepth(DEPTH.debug);

    for (const object of objects) {
      const color = manifestRoleColor(object.role);
      graphics.lineStyle(2, color, 0.95);
      graphics.fillStyle(color, 0.08);
      graphics.fillRect(object.bbox.x, object.bbox.y, object.bbox.width, object.bbox.height);
      graphics.strokeRect(object.bbox.x, object.bbox.y, object.bbox.width, object.bbox.height);
      if (object.depthY !== undefined) {
        graphics.lineStyle(1, color, 0.8);
        graphics.lineBetween(object.bbox.x, object.depthY, object.bbox.x + object.bbox.width, object.depthY);
      }
      this.add.text(object.bbox.x + 3, object.bbox.y + 3, manifestLabel(object), {
        color: '#ffffff',
        fontFamily: 'monospace',
        fontSize: '8px',
        lineSpacing: 1,
        backgroundColor: 'rgba(0,0,0,0.58)',
        padding: { left: 2, right: 2, top: 1, bottom: 1 },
      }).setDepth(DEPTH.debug + 1)
        .setData('manifestRole', object.role);
    }

    this.add.text(18, 18, [
      'MANIFEST WORLD',
      `objects: ${objects.length}`,
      `filter: ${MANIFEST_ROLE_FILTER ?? 'all'}`,
      'cyan = ground-baked',
      'teal = walkable-ground',
      'red = blocking-ground',
      'yellow = occluder',
      'green = decor-cluster',
      'purple = interactive',
      '?manifestRole=occluder filters roles',
    ].join('\n'), {
      color: '#ffffff',
      fontFamily: 'monospace',
      fontSize: '13px',
      backgroundColor: 'rgba(0,0,0,0.68)',
      padding: { left: 8, right: 8, top: 6, bottom: 6 },
    }).setDepth(DEPTH.debug + 10)
      .setScrollFactor(0);
  }

  private drawDebugDepthCheckpoints(graphics: Phaser.GameObjects.Graphics) {
    for (const checkpoint of DEBUG_DEPTH_CHECKPOINTS) {
      graphics.lineStyle(2, 0xfff07a, 0.95);
      graphics.fillStyle(0xfff07a, 0.22);
      graphics.strokeCircle(checkpoint.x, checkpoint.y, 12);
      graphics.fillCircle(checkpoint.x, checkpoint.y, 5);
      this.add.text(checkpoint.x + 10, checkpoint.y - 18, `${checkpoint.key}: ${checkpoint.label}`, {
        color: '#fff07a',
        fontFamily: 'monospace',
        fontSize: '10px',
        backgroundColor: 'rgba(0,0,0,0.5)',
        padding: { left: 2, right: 2, top: 1, bottom: 1 },
      }).setDepth(DEPTH.debug + 2)
        .setData('zone', 'apex');
    }
  }

  private cameraMicroShake() {
    this.cameras.main.shake(120, 0.0015);
  }

  private loadAuthoredWorldData(): WorldMapData {
    const raw = this.cache.json.get(TILED_WORLD_MAP.key) as unknown;
    if (!raw) return FALLBACK_WORLD_DATA;
    try {
      return buildWorldFromTiledMap(raw, FALLBACK_WORLD_DATA);
    } catch (error) {
      console.warn('[LivingWorldScene] Falling back to static world map data:', error);
      return FALLBACK_WORLD_DATA;
    }
  }

  private applyManifestRuntimeData(worldData: WorldMapData): WorldMapData {
    this.zoneColliderCache.clear();
    const manifest = this.cache.json.get(WORLD_OBJECT_MANIFEST.key) as WorldObjectManifest | undefined;
    const objects = manifest?.objects ?? [];
    if (objects.length === 0) {
      this.manifestRuntimeWalkableZones.clear();
      return worldData;
    }

    const manifestColliders = objects
      .map(manifestObjectToCollider)
      .filter((collider): collider is WorldCollider => collider !== null);
    const colliderZones = new Set(manifestColliders.map((collider) => collider.zone));
    const manifestWalkablePolygons = manifestObjectsToWalkablePolygons(objects);
    this.manifestRuntimeWalkableZones = new Set(Object.keys(manifestWalkablePolygons) as ZoneId[]);
    const manifestPois = objects
      .map(manifestObjectToPoi)
      .filter((poi): poi is Poi => poi !== null);
    const manifestPoiIds = new Set(manifestPois.map((poi) => poi.id));

    return {
      ...worldData,
      navMeshPolygons: {
        ...worldData.navMeshPolygons,
        ...manifestWalkablePolygons,
      },
      colliders: [
        ...worldData.colliders.filter((collider) => !colliderZones.has(collider.zone)),
        ...manifestColliders,
      ],
      pois: [
        ...worldData.pois.filter((poi) => !manifestPoiIds.has(poi.id)),
        ...manifestPois,
      ],
    };
  }

  private applyDevChunkTestData(worldData: WorldMapData): WorldMapData {
    const appendChunk = (chunks: WorldMapChunk[]) => (
      ACTIVE_DEV_TEST_CHUNKS.reduce(
        (nextChunks, devChunk) => (
          nextChunks.some((chunk) => chunk.id === devChunk.id)
            ? nextChunks
            : [...nextChunks, devChunk]
        ),
        chunks,
      )
    );
    const groundChunks = appendChunk(worldData.groundChunks);
    const referenceChunks = appendChunk(worldData.referenceChunks);

    return {
      ...worldData,
      groundChunks,
      referenceChunks,
      worldSize: worldSizeFromChunks([...groundChunks, ...referenceChunks], worldData.worldSize),
      worldBounds: worldBoundsFromChunks([...groundChunks, ...referenceChunks], worldData.worldBounds),
    };
  }

  private createDebugActorMarkers() {
    this.debugActorMarkers = this.actors.map((actor) => {
      const dot = this.add.ellipse(actor.container.x, actor.container.y, 10, 5, 0x43ff8f, 0.92)
        .setDepth(DEPTH.debug + 2)
        .setData('zone', actor.zone);
      const label = this.add.text(actor.container.x + 8, actor.container.y - 12, '', {
        color: '#43ff8f',
        fontFamily: 'monospace',
        fontSize: '10px',
        backgroundColor: 'rgba(0,0,0,0.52)',
        padding: { left: 2, right: 2, top: 1, bottom: 1 },
      }).setDepth(DEPTH.debug + 3)
        .setData('zone', actor.zone);
      return { actor, dot, label };
    });
    this.updateDebugActorMarkers();
  }

  private updateDebugActorMarkers() {
    for (const marker of this.debugActorMarkers) {
      const visible = this.focusedZone === null || marker.actor.zone === this.focusedZone;
      marker.dot.setVisible(visible);
      marker.label.setVisible(visible);
      marker.dot.setPosition(marker.actor.container.x, marker.actor.container.y);
      marker.label
        .setPosition(marker.actor.container.x + 8, marker.actor.container.y - 12)
        .setText(`${marker.actor.id} y=${Math.round(marker.actor.container.y)}`);
    }
  }

  private enableDebugClickToMove() {
    if (DEBUG_WORLD) {
      this.debugProbeGraphics = this.add.graphics().setDepth(DEPTH.debug + 4);
      this.debugProbeLabel = this.add.text(372, 118, 'Apex probe: click a walkable point', {
        color: '#43ff8f',
        fontFamily: 'monospace',
        fontSize: '12px',
        backgroundColor: 'rgba(0,0,0,0.62)',
        padding: { left: 6, right: 6, top: 4, bottom: 4 },
      }).setDepth(DEPTH.debug + 10)
        .setScrollFactor(0);
    }

    this.input.on(Phaser.Input.Events.POINTER_UP, (pointer: Phaser.Input.Pointer) => {
      if (this.cameraInteractionMoved) return;
      const target = pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
      this.moveDebugActorTo({ x: target.x, y: target.y });
    });
    this.input.keyboard?.on('keydown', this.handleDebugCheckpointKey, this);
  }

  private createActorTuningControls() {
    this.actorTuningLabel = this.add.text(18, 160, '', {
      color: '#ffffff',
      fontFamily: 'monospace',
      fontSize: '12px',
      backgroundColor: 'rgba(0,0,0,0.68)',
      padding: { left: 8, right: 8, top: 6, bottom: 6 },
    }).setDepth(DEPTH.debug + 11)
      .setScrollFactor(0);
    this.input.keyboard?.on('keydown', this.handleActorTuningKey, this);
    this.applyActorTuning();
  }

  private handleActorTuningKey(event: KeyboardEvent) {
    const step = event.shiftKey ? 5 : 1;
    let handled = true;

    if (event.key === '[') {
      this.actorTextureBottomPadding -= step;
    } else if (event.key === ']') {
      this.actorTextureBottomPadding += step;
    } else if (event.key.toLowerCase() === 'r') {
      this.actorTextureBottomPadding = DEFAULT_ACTOR_TEXTURE_BOTTOM_PADDING;
    } else {
      handled = false;
    }

    if (!handled) return;
    event.preventDefault();
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ACTOR_FEET_PADDING_STORAGE_KEY, String(this.actorTextureBottomPadding));
    }
    this.applyActorTuning();
  }

  private applyActorTuning() {
    for (const actor of this.actors) {
      if (!actor.walking) {
        actor.sprite.y = this.actorSpriteYOffset(actor);
      }
    }
    this.updateActorTuningLabel();
  }

  private updateActorTuningLabel() {
    this.actorTuningLabel?.setText([
      'ACTOR TUNING',
      `[ / ] feet padding: ${this.actorTextureBottomPadding}`,
      'Shift = 5px, R = reset',
    ].join('\n'));
  }

  private handleDebugCheckpointKey(event: KeyboardEvent) {
    const checkpoint = DEBUG_DEPTH_CHECKPOINTS.find((candidate) => candidate.key === event.key);
    if (!checkpoint) return;
    this.placeDebugActorAt(checkpoint);
  }

  private placeDebugActorAt(checkpoint: typeof DEBUG_DEPTH_CHECKPOINTS[number]) {
    const actor = this.actors.find((candidate) => candidate.id === 'apex');
    if (!actor) return;
    this.tweens.killTweensOf(actor.container);
    this.tweens.killTweensOf(actor.sprite);
    actor.busy = true;
    actor.nextTaskAt = Number.POSITIVE_INFINITY;
    actor.walking = false;
    this.resetActorPose(actor);
    this.setActorTexture(actor, actor.idleTexture);
    actor.container.setPosition(checkpoint.x, checkpoint.y);
    actor.container.setDepth(DEPTH.actorBase + Math.round(checkpoint.y));
    actor.lastDepth = DEPTH.actorBase + Math.round(checkpoint.y);
    this.drawDebugProbe(checkpoint, [new Phaser.Math.Vector2(checkpoint.x, checkpoint.y)]);
    this.debugProbeLabel?.setText(
      `Apex probe: checkpoint ${checkpoint.key} ${checkpoint.label} ${checkpoint.x}, ${checkpoint.y}`,
    );
  }

  private moveDebugActorTo(target: WorldPoint) {
    const actor = this.actors.find((candidate) => candidate.id === 'apex');
    if (!actor) return;
    const from = { x: actor.container.x, y: actor.container.y };
    const path = this.pathTo(actor.zone, from, target);
    this.drawDebugProbe(target, path);
    if (!path) {
      this.debugProbeLabel?.setText(`Apex probe: BLOCKED ${Math.round(target.x)}, ${Math.round(target.y)}`);
      return;
    }

    this.debugProbeLabel?.setText(`Apex probe: path accepted ${Math.round(target.x)}, ${Math.round(target.y)}`);
    this.tweens.killTweensOf(actor.container);
    this.tweens.killTweensOf(actor.sprite);
    actor.busy = true;
    actor.nextTaskAt = Number.POSITIVE_INFINITY;
    actor.walking = false;
    this.resetActorPose(actor);
    this.setActorTexture(actor, actor.idleTexture);
    this.moveAlongPath(actor, path, () => {
      this.idleThen(actor, this.time.now, 2600);
    });
  }

  private drawDebugProbe(target: WorldPoint, path: Phaser.Math.Vector2[] | null) {
    if (!this.debugProbeGraphics) return;
    this.debugProbeGraphics.clear();
    const accepted = path !== null;
    this.debugProbeGraphics.lineStyle(3, accepted ? 0x43ff8f : 0xff3030, 0.95);
    this.debugProbeGraphics.fillStyle(accepted ? 0x43ff8f : 0xff3030, 0.72);
    this.debugProbeGraphics.strokeCircle(target.x, target.y, 12);
    this.debugProbeGraphics.fillCircle(target.x, target.y, 4);
    if (!path || path.length === 0) return;
    this.debugProbeGraphics.beginPath();
    this.debugProbeGraphics.moveTo(path[0].x, path[0].y);
    for (const point of path.slice(1)) {
      this.debugProbeGraphics.lineTo(point.x, point.y);
    }
    this.debugProbeGraphics.strokePath();
  }
}

function polygonBounds(polygon: WorldPoint[]) {
  return polygon.reduce(
    (bounds, point) => ({
      minX: Math.min(bounds.minX, point.x),
      maxX: Math.max(bounds.maxX, point.x),
      minY: Math.min(bounds.minY, point.y),
      maxY: Math.max(bounds.maxY, point.y),
    }),
    { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity },
  );
}

function navBoundsForZone(
  polygons: WorldPoint[][],
  fallback: { x: number; y: number; width: number; height: number },
  worldBounds: { x: number; y: number; width: number; height: number },
) {
  const points = polygons.flat();
  if (points.length === 0) return fallback;
  const bounds = polygonBounds(points);
  if (!Number.isFinite(bounds.minX) || !Number.isFinite(bounds.minY)) return fallback;

  const x = Math.max(worldBounds.x, Math.floor(bounds.minX / NAV_TILE_SIZE) * NAV_TILE_SIZE);
  const y = Math.max(worldBounds.y, Math.floor(bounds.minY / NAV_TILE_SIZE) * NAV_TILE_SIZE);
  const right = Math.min(worldBounds.x + worldBounds.width, Math.ceil(bounds.maxX / NAV_TILE_SIZE) * NAV_TILE_SIZE);
  const bottom = Math.min(worldBounds.y + worldBounds.height, Math.ceil(bounds.maxY / NAV_TILE_SIZE) * NAV_TILE_SIZE);
  return {
    x,
    y,
    width: Math.max(NAV_TILE_SIZE, right - x),
    height: Math.max(NAV_TILE_SIZE, bottom - y),
  };
}

function isTreeTestProp(propId: string) {
  return propId.startsWith('apex-cherry-right-');
}

function manifestRoleColor(role: ManifestRole) {
  if (role === 'ground-baked') return 0x5de4ff;
  if (role === 'walkable-ground') return 0x2ee6c4;
  if (role === 'blocking-ground') return 0xff4e4e;
  if (role === 'occluder') return 0xffe05a;
  if (role === 'decor-cluster') return 0x8cff78;
  return 0xb68cff;
}

function manifestLabel(object: ManifestObject) {
  return [
    object.id.replace(/^apex-/, ''),
    object.layerTarget,
  ].join('\n');
}

function foregroundWorkspaceTextureKey(spriteId: string) {
  return `world-v2-foreground-workspace-${GROUND_PREVIEW_ZONE}-${spriteId}`;
}

function manifestRuntimeTextureKey(spriteId: string) {
  return `world-v2-manifest-runtime-${spriteId}`;
}

function manifestObjectsToWalkablePolygons(objects: ManifestObject[]): Partial<Record<ZoneId, WorldPoint[][]>> {
  const byZone: Partial<Record<ZoneId, WorldPoint[][]>> = {};

  for (const object of objects) {
    if (object.role !== 'walkable-ground') continue;
    const zone = agentZoneFromString(object.zone);
    if (!zone) continue;

    const points = isValidPointPolygon(object.walkable?.points)
      ? object.walkable.points
      : isValidBounds(object.bbox)
        ? boundsToPolygon(object.bbox)
        : null;
    if (!points) continue;

    byZone[zone] = [...(byZone[zone] ?? []), points];
  }

  return byZone;
}

function manifestObjectToCollider(object: ManifestObject): WorldCollider | null {
  if (object.role !== 'blocking-ground' || object.collision?.kind === 'none') return null;
  const zone = agentZoneFromString(object.zone);
  if (!zone) return null;

  if (object.collision?.kind === 'polygon' && isValidPointPolygon(object.collision.points)) {
    return {
      id: `manifest-${object.id}`,
      zone,
      points: object.collision.points,
    };
  }

  const bounds = object.bbox;
  if (!isValidBounds(bounds)) return null;

  return {
    id: `manifest-${object.id}`,
    zone,
    points: boundsToPolygon(bounds),
  };
}

function manifestObjectToPoi(object: ManifestObject): Poi | null {
  if (object.role !== 'interactive') return null;
  const zone = agentZoneFromString(object.zone);
  if (!zone || !isValidBounds(object.bbox)) return null;

  const behavior = manifestPoiBehavior(zone, object);
  return {
    id: `manifest-${object.id}`,
    zone,
    x: Math.round(object.bbox.x + object.bbox.width / 2),
    y: Math.round(object.bbox.y + object.bbox.height),
    label: object.label || object.id,
    actionTexture: behavior.actionTexture,
    effect: behavior.effect,
  };
}

function manifestPoiBehavior(zone: ZoneId, object: ManifestObject): Pick<Poi, 'actionTexture' | 'effect'> {
  const searchableText = `${object.id} ${object.label ?? ''}`.toLowerCase();

  if (zone === 'apex') {
    if (searchableText.includes('zen') || searchableText.includes('meditat')) {
      return { actionTexture: 'actor-apex-meditate', effect: 'apex-meditate' };
    }
    return { actionTexture: 'actor-apex-strike', effect: 'apex-strike' };
  }

  if (zone === 'gale') {
    if (searchableText.includes('globe')) {
      return { actionTexture: 'actor-gale-globe', effect: 'gale-globe' };
    }
    return { actionTexture: 'actor-gale-cast', effect: 'gale-cast' };
  }

  if (zone === 'bacon') {
    if (searchableText.includes('harvest') || searchableText.includes('produce') || searchableText.includes('herb')) {
      return { actionTexture: 'actor-bacon-idle', effect: 'bacon-harvest' };
    }
    return { actionTexture: 'actor-bacon-cook', effect: 'bacon-cook' };
  }

  if (searchableText.includes('scope') || searchableText.includes('observatory')) {
    return { actionTexture: 'actor-metheus-telescope', effect: 'metheus-telescope' };
  }
  return { actionTexture: 'actor-metheus-read', effect: 'metheus-read' };
}

function agentZoneFromString(zone: string): ZoneId | null {
  if (zone === 'apex' || zone === 'gale' || zone === 'metheus' || zone === 'bacon') return zone;
  return null;
}

function isValidBounds(bounds: ManifestObject['bbox'] | undefined) {
  return Boolean(
    bounds
      && Number.isFinite(bounds.x)
      && Number.isFinite(bounds.y)
      && Number.isFinite(bounds.width)
      && Number.isFinite(bounds.height)
      && bounds.width > 0
      && bounds.height > 0,
  );
}

function isValidPointPolygon(points: WorldPoint[] | undefined): points is WorldPoint[] {
  return Boolean(
    points
      && points.length >= 3
      && points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)),
  );
}

function boundsToPolygon(bounds: ManifestObject['bbox']): WorldPoint[] {
  return [
    { x: bounds.x, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
    { x: bounds.x, y: bounds.y + bounds.height },
  ];
}

function shortestVisibilityPath(
  points: WorldPoint[],
  canConnect: (start: WorldPoint, end: WorldPoint) => boolean,
): WorldPoint[] | null {
  const edges = points.map(() => [] as ExactNavEdge[]);
  for (let startIndex = 0; startIndex < points.length; startIndex += 1) {
    for (let endIndex = startIndex + 1; endIndex < points.length; endIndex += 1) {
      if (!canConnect(points[startIndex], points[endIndex])) continue;
      const cost = pointDistance(points[startIndex], points[endIndex]);
      edges[startIndex].push({ to: endIndex, cost });
      edges[endIndex].push({ to: startIndex, cost });
    }
  }
  return shortestPath(points, 0, 1, (index) => edges[index] ?? []);
}

function shortestPath(
  points: WorldPoint[],
  startIndex: number,
  endIndex: number,
  neighborsFor: (index: number) => ExactNavEdge[],
): WorldPoint[] | null {
  if (points.length < 2) return null;

  const open = new Set([startIndex]);
  const closed = new Set<number>();
  const cameFrom = new Map<number, number>();
  const gScore = Array.from({ length: points.length }, () => Infinity);
  const fScore = Array.from({ length: points.length }, () => Infinity);
  gScore[startIndex] = 0;
  fScore[startIndex] = pointDistance(points[startIndex], points[endIndex]);

  while (open.size > 0) {
    const current = Array.from(open).reduce((best, candidate) => (
      fScore[candidate] < fScore[best] ? candidate : best
    ));
    if (current === endIndex) return reconstructPointPath(points, cameFrom, current);

    open.delete(current);
    closed.add(current);

    for (const edge of neighborsFor(current)) {
      const neighbor = edge.to;
      if (neighbor === current || closed.has(neighbor)) continue;
      const nextGScore = gScore[current] + edge.cost;
      if (nextGScore >= gScore[neighbor]) continue;

      cameFrom.set(neighbor, current);
      gScore[neighbor] = nextGScore;
      fScore[neighbor] = nextGScore + pointDistance(points[neighbor], points[endIndex]);
      open.add(neighbor);
    }
  }

  return null;
}

function reconstructPointPath(points: WorldPoint[], cameFrom: Map<number, number>, current: number) {
  const route = [points[current]];
  while (cameFrom.has(current)) {
    current = cameFrom.get(current)!;
    route.unshift(points[current]);
  }
  return route;
}

function uniquePoints(points: WorldPoint[]) {
  const byKey = new Map<string, WorldPoint>();
  for (const point of points) {
    const rounded = {
      x: Math.round(point.x * 10) / 10,
      y: Math.round(point.y * 10) / 10,
    };
    byKey.set(`${rounded.x}:${rounded.y}`, rounded);
  }
  return Array.from(byKey.values());
}

function sparsePolygonVertices(polygon: WorldPoint[], maxVertices: number) {
  if (polygon.length <= maxVertices) return polygon;
  const step = polygon.length / maxVertices;
  const vertices: WorldPoint[] = [];
  for (let index = 0; index < maxVertices; index += 1) {
    vertices.push(polygon[Math.floor(index * step)]);
  }
  return vertices;
}

function offsetPolygonVertexCandidates(polygon: WorldPoint[], offset: number) {
  const center = polygonCenter(polygon);
  const candidates: WorldPoint[] = [];

  for (const vertex of polygon) {
    const angle = Math.atan2(vertex.y - center.y, vertex.x - center.x);
    candidates.push({
      x: vertex.x + Math.cos(angle) * offset,
      y: vertex.y + Math.sin(angle) * offset,
    });
  }

  return candidates;
}

function polygonCenter(polygon: WorldPoint[]) {
  const total = polygon.reduce((sum, point) => ({
    x: sum.x + point.x,
    y: sum.y + point.y,
  }), { x: 0, y: 0 });
  return {
    x: total.x / polygon.length,
    y: total.y / polygon.length,
  };
}

function pointDistance(start: WorldPoint, end: WorldPoint) {
  return Phaser.Math.Distance.Between(start.x, start.y, end.x, end.y);
}

function actorWalkSheetForTexture(texture: string) {
  const slug = texture.replace(/^actor-/, '');
  return ACTOR_WALK_SHEET_SLUGS.has(slug) ? `actor-${slug}-walk` : null;
}

function pointInOrOnPolygon(point: WorldPoint, polygon: WorldPoint[]) {
  if (polygon.some((edgeStart, index) => (
    distanceToSegment(point, edgeStart, polygon[(index + 1) % polygon.length]) <= 0.01
  ))) {
    return true;
  }
  return pointInPolygon(point, polygon);
}

function pointInPolygon(point: WorldPoint, polygon: WorldPoint[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const pi = polygon[i];
    const pj = polygon[j];
    const intersects = ((pi.y > point.y) !== (pj.y > point.y))
      && (point.x < ((pj.x - pi.x) * (point.y - pi.y)) / (pj.y - pi.y) + pi.x);
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointNearPolygon(point: WorldPoint, polygon: WorldPoint[], padding: number) {
  if (pointInPolygon(point, polygon)) return true;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    if (distanceToSegment(point, polygon[j], polygon[i]) <= padding) return true;
  }
  return false;
}

function distancePolygonToSegment(polygon: WorldPoint[], start: WorldPoint, end: WorldPoint) {
  return Math.min(
    ...polygon.map((point) => distanceToSegment(point, start, end)),
    distancePointToPolygon(start, polygon),
    distancePointToPolygon(end, polygon),
  );
}

function distancePointToPolygon(point: WorldPoint, polygon: WorldPoint[]) {
  if (pointInPolygon(point, polygon)) return 0;
  return polygon.reduce((closest, edgeStart, index) => (
    Math.min(closest, distanceToSegment(point, edgeStart, polygon[(index + 1) % polygon.length]))
  ), Infinity);
}

function distanceToSegment(point: WorldPoint, a: WorldPoint, b: WorldPoint) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return Phaser.Math.Distance.Between(point.x, point.y, a.x, a.y);
  const t = Math.max(0, Math.min(1, (((point.x - a.x) * dx) + ((point.y - a.y) * dy)) / ((dx * dx) + (dy * dy))));
  return Phaser.Math.Distance.Between(point.x, point.y, a.x + t * dx, a.y + t * dy);
}

function segmentIntersectsPolygon(start: WorldPoint, end: WorldPoint, polygon: WorldPoint[]) {
  const midpoint = {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2,
  };
  if (pointInPolygon(midpoint, polygon)) return true;

  for (let index = 0; index < polygon.length; index += 1) {
    const edgeStart = polygon[index];
    const edgeEnd = polygon[(index + 1) % polygon.length];
    if (segmentsIntersect(start, end, edgeStart, edgeEnd)) return true;
  }

  return false;
}

function segmentsIntersect(a: WorldPoint, b: WorldPoint, c: WorldPoint, d: WorldPoint) {
  const o1 = segmentOrientation(a, b, c);
  const o2 = segmentOrientation(a, b, d);
  const o3 = segmentOrientation(c, d, a);
  const o4 = segmentOrientation(c, d, b);

  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && pointOnSegment(c, a, b)) return true;
  if (o2 === 0 && pointOnSegment(d, a, b)) return true;
  if (o3 === 0 && pointOnSegment(a, c, d)) return true;
  if (o4 === 0 && pointOnSegment(b, c, d)) return true;
  return false;
}

function segmentOrientation(a: WorldPoint, b: WorldPoint, c: WorldPoint) {
  const value = ((b.y - a.y) * (c.x - b.x)) - ((b.x - a.x) * (c.y - b.y));
  if (Math.abs(value) < 0.0001) return 0;
  return value > 0 ? 1 : 2;
}

function pointOnSegment(point: WorldPoint, start: WorldPoint, end: WorldPoint) {
  return point.x <= Math.max(start.x, end.x) + 0.0001
    && point.x >= Math.min(start.x, end.x) - 0.0001
    && point.y <= Math.max(start.y, end.y) + 0.0001
    && point.y >= Math.min(start.y, end.y) - 0.0001;
}

function cellsToPolygons(grid: number[][], tileSize: number): WorldPoint[][] {
  const polygons: WorldPoint[][] = [];
  for (let row = 0; row < grid.length; row += 1) {
    for (let col = 0; col < grid[row].length; col += 1) {
      if (grid[row][col] !== 1) continue;
      const x1 = col * tileSize;
      const y1 = row * tileSize;
      const x2 = x1 + tileSize;
      const y2 = y1 + tileSize;
      polygons.push([
        { x: x1, y: y1 },
        { x: x2, y: y1 },
        { x: x2, y: y2 },
        { x: x1, y: y2 },
      ]);
    }
  }
  return polygons;
}
