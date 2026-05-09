import NavMeshRuntime from 'navmesh';
import type { NavMesh as NavMeshInstance } from 'navmesh';
import Phaser from 'phaser';
import type { AgentId } from '@/lib/types';
import {
  ACTOR_TEXTURES,
  GROUND_LAYER,
  NAV_MESH_POLYGONS,
  POIS,
  PROP_TEXTURES,
  REFERENCE_LAYER,
  WORLD_COLLIDERS,
  WORLD_PROPS,
  WORLD_SIZE,
  ZONES,
  type Poi,
  type WorldPoint,
  type ZoneId,
} from './worldMapData';

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
  | 'apex-helper'
  | 'metheus-helper'
  | 'gale-helper';

interface LivingActor {
  id: string;
  kind: ActorKind;
  zone: ZoneId;
  idleTexture: string;
  actionTextures: string[];
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
    speed: 82,
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
    speed: 68,
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
    speed: 66,
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
    speed: 70,
  },
  {
    kind: 'metheus-helper',
    zone: 'metheus',
    textures: ['actor-metheus-helper-books', 'actor-metheus-helper-scroll', 'actor-metheus-helper-lantern'],
    count: 5,
    scale: 0.41,
    speed: 60,
  },
  {
    kind: 'gale-helper',
    zone: 'gale',
    textures: ['actor-gale-helper-crystal', 'actor-gale-helper-jar', 'actor-gale-helper-tool'],
    count: 5,
    scale: 0.41,
    speed: 60,
  },
];

const queryParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
const DEBUG_WORLD = queryParams?.has('debugWorld') ?? false;
const REFERENCE_WORLD = queryParams?.has('referenceWorld') ?? false;
const REFERENCE_OPACITY = queryParams?.has('referenceSolid') ? 0.82 : 0.42;

export class LivingWorldScene extends Phaser.Scene {
  private actors: LivingActor[] = [];
  private props: Phaser.GameObjects.Image[] = [];
  private zoneNavMeshes = new Map<ZoneId, NavMeshInstance>();
  private zoneNavPolygons = new Map<ZoneId, WorldPoint[][]>();
  private homeZoom = 0.66;
  private readonly focusedZoomDesktop = 1.18;
  private readonly focusedZoomMobile = 0.92;
  private focusedZone: ZoneId | null = null;

  constructor() {
    super('LivingWorldScene');
  }

  preload() {
    this.load.image(GROUND_LAYER.key, GROUND_LAYER.src);
    if (REFERENCE_WORLD) this.load.image(REFERENCE_LAYER.key, REFERENCE_LAYER.src);
    for (const texture of PROP_TEXTURES) {
      this.load.image(texture.key, texture.src);
    }
    for (const key of ACTOR_TEXTURES) {
      this.load.image(`actor-${key}`, `/world-v2/actors/${key}.png`);
    }
  }

  create() {
    this.zoneNavPolygons = new Map(
      (Object.keys(ZONES) as ZoneId[]).map((zone) => [zone, this.buildZoneNavPolygons(zone)]),
    );
    this.zoneNavMeshes = new Map(
      (Array.from(this.zoneNavPolygons.entries()) as Array<[ZoneId, WorldPoint[][]]>)
        .map(([zone, polygons]) => [zone, new NavMeshCtor(polygons, 8)]),
    );

    this.cameras.main.setBounds(0, 0, WORLD_SIZE.width, WORLD_SIZE.height);
    this.add.image(0, 0, GROUND_LAYER.key).setOrigin(0, 0).setDepth(DEPTH.ground);
    this.createAmbientLife();
    this.createWorldProps();
    this.createActors();
    if (DEBUG_WORLD) this.createDebugOverlay();
    if (REFERENCE_WORLD) this.createReferenceOverlay();
    this.updateCameraHome(true);
    this.scale.on('resize', this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', this.handleResize, this);
      for (const mesh of this.zoneNavMeshes.values()) mesh.destroy();
    });
  }

  update(time: number) {
    for (const actor of this.actors) {
      if (!actor.container.visible) continue;
      const depth = DEPTH.actorBase + Math.round(actor.container.y);
      if (depth !== actor.lastDepth) {
        actor.container.setDepth(depth);
        actor.lastDepth = depth;
      }
      if (actor.walking) this.applyWalkCycle(actor, time);
      if (!actor.busy && time >= actor.nextTaskAt) this.assignTask(actor);
    }
  }

  focusAgent(agentId: AgentId | null) {
    this.focusedZone = agentId;
    this.applyFocusVisibility();
    if (!agentId) {
      this.updateCameraHome(false);
      return;
    }
    const zone = ZONES[agentId];
    const mobile = this.scale.width < 700;
    const zoom = mobile ? this.focusedZoomMobile : this.focusedZoomDesktop;
    this.cameras.main.pan(zone.center.x, zone.center.y, 850, 'Sine.easeInOut');
    this.cameras.main.zoomTo(zoom, 850, 'Sine.easeInOut');
  }

  private handleResize() {
    this.updateCameraHome(false);
  }

  private updateCameraHome(instant: boolean) {
    const width = Math.max(1, this.scale.width);
    const height = Math.max(1, this.scale.height);
    const cover = Math.max(width / WORLD_SIZE.width, height / WORLD_SIZE.height);
    const coverMobile = Math.max(width / 980, height / WORLD_SIZE.height);
    this.homeZoom = width < 700 ? coverMobile : cover;
    const camera = this.cameras.main;
    if (instant) {
      camera.centerOn(WORLD_SIZE.width / 2, WORLD_SIZE.height / 2);
      camera.setZoom(this.homeZoom);
      return;
    }
    camera.pan(WORLD_SIZE.width / 2, WORLD_SIZE.height / 2, 850, 'Sine.easeInOut');
    camera.zoomTo(this.homeZoom, 850, 'Sine.easeInOut');
  }

  private createWorldProps() {
    for (const prop of WORLD_PROPS) {
      const image = this.add.image(prop.x, prop.y, prop.key)
        .setOrigin(0, 0)
        .setScale(prop.scale ?? 1)
        .setDepth(prop.layer === 'ground' ? DEPTH.groundDetail : DEPTH.actorBase + prop.depthY)
        .setData('zone', prop.zone);
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

  private createActors() {
    for (const config of AGENT_ACTOR_CONFIG) {
      this.actors.push(this.createActor(config));
    }

    for (const helper of HELPER_CONFIG) {
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
    this.add.image(0, 0, REFERENCE_LAYER.key)
      .setOrigin(0, 0)
      .setAlpha(REFERENCE_OPACITY)
      .setDepth(DEPTH.reference)
      .setBlendMode(Phaser.BlendModes.NORMAL);
  }

  private applyFocusVisibility() {
    for (const actor of this.actors) {
      actor.container.setVisible(this.focusedZone === null || actor.zone === this.focusedZone);
    }
    for (const prop of this.props) {
      const zone = prop.getData('zone') as ZoneId;
      prop.setVisible(this.focusedZone === null || zone === this.focusedZone);
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
    const shadow = this.add.ellipse(0, 15, 36, 13, 0x21170f, 0.3);
    const sprite = this.add.image(0, 0, config.idleTexture)
      .setOrigin(0.5, 1)
      .setScale(config.scale);
    const container = this.add.container(config.x, config.y, [shadow, sprite])
      .setDepth(DEPTH.actorBase + config.y);
    return {
      id: config.id,
      kind: config.kind,
      zone: config.zone,
      idleTexture: config.idleTexture,
      actionTextures: config.actionTextures,
      container,
      sprite,
      shadow,
      speed: config.speed,
      scale: config.scale,
      currentScale: config.scale,
      walkSeed: Math.random() * Math.PI * 2,
      lastDepth: DEPTH.actorBase + Math.round(config.y),
      nextTaskAt: this.time.now + Phaser.Math.Between(500, 4200),
      busy: false,
      walking: false,
    };
  }

  private assignTask(actor: LivingActor) {
    actor.busy = true;
    const isHelper = actor.kind.endsWith('helper');
    const zonePois = POIS.filter((poi) => {
      if (poi.zone !== actor.zone) return false;
      return isHelper ? poi.helperOnly === true : poi.helperOnly !== true;
    });
    const usePoi = zonePois.length > 0 && Math.random() < (isHelper ? 0.62 : 0.76);
    const poi = usePoi ? Phaser.Utils.Array.GetRandom(zonePois) : null;
    const point = poi ? { x: poi.x, y: poi.y } : this.randomNavPoint(actor.zone);
    const path = this.pathTo(actor.zone, { x: actor.container.x, y: actor.container.y }, point);
    if (!path) {
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
    const mesh = this.zoneNavMeshes.get(zone);
    if (!mesh || !mesh.isPointInMesh(from) || !mesh.isPointInMesh(to)) return null;
    const route = mesh.findPath(from, to);
    if (!route || route.length === 0) return null;
    return route.map((point) => new Phaser.Math.Vector2(point.x, point.y));
  }

  private randomNavPoint(zone: ZoneId): WorldPoint {
    const polygons = this.zoneNavPolygons.get(zone) ?? NAV_MESH_POLYGONS[zone];
    const polygon = Phaser.Utils.Array.GetRandom(polygons);
    const bounds = polygonBounds(polygon);
    for (let i = 0; i < 30; i += 1) {
      const point = {
        x: Phaser.Math.Between(bounds.minX + 12, bounds.maxX - 12),
        y: Phaser.Math.Between(bounds.minY + 12, bounds.maxY - 12),
      };
      if (pointInPolygon(point, polygon)) return point;
    }
    return {
      x: (bounds.minX + bounds.maxX) / 2,
      y: (bounds.minY + bounds.maxY) / 2,
    };
  }

  private moveAlongPath(actor: LivingActor, path: Phaser.Math.Vector2[], onComplete: () => void) {
    actor.walking = true;
    const walkNext = (index: number) => {
      const target = path[index];
      if (!target) {
        actor.walking = false;
        this.resetActorPose(actor);
        onComplete();
        return;
      }
      const distance = Phaser.Math.Distance.Between(actor.container.x, actor.container.y, target.x, target.y);
      if (distance < 4) {
        walkNext(index + 1);
        return;
      }
      actor.sprite.setFlipX(target.x < actor.container.x);
      const duration = Phaser.Math.Clamp((distance / actor.speed) * 1000, 180, 1600);
      this.tweens.add({
        targets: actor.container,
        x: target.x,
        y: target.y,
        duration,
        ease: 'Sine.easeInOut',
        onComplete: () => walkNext(index + 1),
      });
    };
    walkNext(0);
  }

  private buildZoneNavPolygons(zone: ZoneId): WorldPoint[][] {
    const rect = ZONES[zone].rect;
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
    const insideZonePath = NAV_MESH_POLYGONS[zone].some((polygon) => pointInPolygon(point, polygon));
    if (!insideZonePath) return false;
    return !WORLD_COLLIDERS.some((collider) => (
      collider.zone === zone && pointNearPolygon(point, collider.points, NAV_COLLIDER_PADDING)
    ));
  }

  private setActorTexture(actor: LivingActor, texture: string) {
    actor.sprite.setTexture(texture);
    actor.currentScale = actor.scale * (TEXTURE_SCALE[texture] ?? 1);
    actor.sprite.setScale(actor.currentScale);
  }

  private applyWalkCycle(actor: LivingActor, time: number) {
    const step = Math.sin(time / 86 + actor.walkSeed);
    const lift = Math.abs(step);
    actor.sprite.y = -lift * 5;
    actor.sprite.rotation = step * 0.055;
    actor.sprite.scaleX = actor.currentScale * (1 + lift * 0.035);
    actor.sprite.scaleY = actor.currentScale * (1 - lift * 0.035);
    actor.shadow.scaleX = 1 + lift * 0.12;
    actor.shadow.scaleY = 1 - lift * 0.08;
    actor.shadow.alpha = 0.22 + (1 - lift) * 0.08;
  }

  private resetActorPose(actor: LivingActor) {
    actor.sprite.y = 0;
    actor.sprite.rotation = 0;
    actor.sprite.setScale(actor.currentScale);
    actor.shadow.setScale(1);
    actor.shadow.alpha = 0.3;
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
    for (const [zone, polygons] of this.zoneNavPolygons.entries()) {
      const color = zone === 'apex' ? 0xff8fb3 : zone === 'metheus' ? 0xffd36b : 0x79e8ff;
      graphics.lineStyle(2, color, 0.9);
      graphics.fillStyle(color, 0.09);
      for (const polygon of polygons) {
        graphics.beginPath();
        graphics.moveTo(polygon[0].x, polygon[0].y);
        for (const point of polygon.slice(1)) graphics.lineTo(point.x, point.y);
        graphics.closePath();
        graphics.fillPath();
        graphics.strokePath();
      }
    }

    for (const collider of WORLD_COLLIDERS) {
      graphics.lineStyle(2, 0xff3f3f, 0.8);
      graphics.fillStyle(0xff3f3f, 0.12);
      graphics.beginPath();
      graphics.moveTo(collider.points[0].x, collider.points[0].y);
      for (const point of collider.points.slice(1)) graphics.lineTo(point.x, point.y);
      graphics.closePath();
      graphics.fillPath();
      graphics.strokePath();
    }

    for (const prop of WORLD_PROPS) {
      if (prop.layer !== 'sorted') continue;
      graphics.lineStyle(1, 0xffffff, 0.35);
      graphics.lineBetween(prop.x, prop.depthY, prop.x + 86, prop.depthY);
      graphics.fillStyle(0xffffff, 0.5);
      graphics.fillCircle(prop.x, prop.y, 3);
    }
  }

  private cameraMicroShake() {
    this.cameras.main.shake(120, 0.0015);
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

function distanceToSegment(point: WorldPoint, a: WorldPoint, b: WorldPoint) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return Phaser.Math.Distance.Between(point.x, point.y, a.x, a.y);
  const t = Math.max(0, Math.min(1, (((point.x - a.x) * dx) + ((point.y - a.y) * dy)) / ((dx * dx) + (dy * dy))));
  return Phaser.Math.Distance.Between(point.x, point.y, a.x + t * dx, a.y + t * dy);
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
