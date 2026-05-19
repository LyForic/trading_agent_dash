import type { AgentId } from '@/lib/types';
import {
  propTextureKey,
  type Poi,
  type WorldCollider,
  type WorldLayerAsset,
  type WorldMapData,
  type WorldMapChunk,
  type WorldPoint,
  type WorldProp,
  type ZoneId,
  worldSizeFromChunks,
} from './worldMapData';

type TiledPropertyValue = string | number | boolean;

interface TiledProperty {
  name: string;
  type?: string;
  value: TiledPropertyValue;
}

interface TiledObject {
  id: number;
  name?: string;
  type?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  point?: boolean;
  polygon?: WorldPoint[];
  properties?: TiledProperty[];
}

interface TiledLayer {
  id: number;
  name: string;
  type: 'imagelayer' | 'objectgroup';
  image?: string;
  x?: number;
  y?: number;
  visible?: boolean;
  objects?: TiledObject[];
}

interface TiledMap {
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  layers: TiledLayer[];
}

const MAP_PUBLIC_ROOT = '/world-v2/maps/';

export function buildWorldFromTiledMap(raw: unknown, fallback: WorldMapData): WorldMapData {
  const map = assertTiledMap(raw);
  const groundLayer = imageLayerToAsset(map, 'Ground', fallback.groundLayer);
  const referenceLayer = imageLayerToAsset(map, 'Reference', fallback.referenceLayer);
  const groundChunks = imageLayerToChunks(map, 'Ground', fallback.groundChunks, groundLayer);
  const referenceChunks = imageLayerToChunks(map, 'Reference', fallback.referenceChunks, referenceLayer);
  const props = parseProps(map);
  const propColliders = props.flatMap(propToColliders);
  const layerColliders = parseCollisionLayer(map);
  const walkableByZone = parseWalkableLayer(map);
  const poiByZone = parsePoiLayer(map);
  const propTextures = Array.from(new Map(props.map((prop) => [prop.key, prop.src])).entries())
    .map(([key, src]) => ({ key, src }));

  const authoredWalkableZones = new Set(Object.keys(walkableByZone) as ZoneId[]);
  const authoredPoiZones = new Set(Object.keys(poiByZone) as ZoneId[]);
  const authoredColliderZones = new Set<ZoneId>([
    ...propColliders.map((collider) => collider.zone),
    ...layerColliders.map((collider) => collider.zone),
  ]);

  const navMeshPolygons = { ...fallback.navMeshPolygons };
  for (const zone of authoredWalkableZones) {
    navMeshPolygons[zone] = walkableByZone[zone] ?? fallback.navMeshPolygons[zone];
  }

  return {
    ...fallback,
    worldSize: worldSizeFromChunks([...groundChunks, ...referenceChunks], fallback.worldSize),
    groundLayer,
    referenceLayer,
    groundChunks,
    referenceChunks,
    navMeshPolygons,
    pois: [
      ...fallback.pois.filter((poi) => !authoredPoiZones.has(poi.zone)),
      ...Object.values(poiByZone).flat(),
    ],
    props,
    colliders: [
      ...fallback.colliders.filter((collider) => !authoredColliderZones.has(collider.zone)),
      ...propColliders,
      ...layerColliders,
    ],
    propTextures,
  };
}

function assertTiledMap(raw: unknown): TiledMap {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Tiled map must be an object');
  }
  const map = raw as Partial<TiledMap>;
  if (!Array.isArray(map.layers)) {
    throw new Error('Tiled map is missing layers');
  }
  if (typeof map.width !== 'number' || typeof map.height !== 'number') {
    throw new Error('Tiled map is missing dimensions');
  }
  if (typeof map.tilewidth !== 'number' || typeof map.tileheight !== 'number') {
    throw new Error('Tiled map is missing tile dimensions');
  }
  return map as TiledMap;
}

function imageLayerToAsset(map: TiledMap, layerName: string, fallback: WorldMapData['groundLayer']) {
  const layer = map.layers.find((candidate) => candidate.name === layerName);
  if (!layer || layer.type !== 'imagelayer' || !layer.image) return fallback;
  return {
    key: fallback.key,
    src: publicPathFromMapImage(layer.image),
  };
}

function imageLayerToChunks(
  map: TiledMap,
  layerName: string,
  fallback: WorldMapChunk[],
  layerAsset: WorldLayerAsset,
) {
  const layer = map.layers.find((candidate) => candidate.name === layerName);
  if (!layer || layer.type !== 'imagelayer' || !layer.image) return fallback;

  const [coreFallback, ...expansionChunks] = fallback;
  const coreChunk: WorldMapChunk = {
    id: coreFallback?.id ?? 'core',
    key: layerAsset.key,
    src: layerAsset.src,
    x: layer.x ?? coreFallback?.x ?? 0,
    y: layer.y ?? coreFallback?.y ?? 0,
    width: coreFallback?.width ?? map.width * map.tilewidth,
    height: coreFallback?.height ?? map.height * map.tileheight,
  };
  return [coreChunk, ...expansionChunks];
}

function parseProps(map: TiledMap): WorldProp[] {
  const layer = objectLayer(map, 'PropsSorted');
  return layer.objects.map((object) => {
    const asset = requiredString(object, 'asset', 'PropsSorted object');
    const zone = requiredZone(object, 'PropsSorted object');
    const depthY = requiredNumber(object, 'depthY', 'PropsSorted object');
    const scale = optionalNumber(object, 'scale');
    if (scale !== undefined && scale <= 0) {
      throw new Error(`${object.name || object.id}: scale must be greater than 0`);
    }
    const src = optionalString(object, 'src') ?? `/world-v2/foreground/${asset}.png`;
    const layerValue = optionalString(object, 'renderLayer') === 'ground' ? 'ground' : 'sorted';
    return {
      id: object.name || asset,
      zone,
      key: propTextureKey(asset),
      src,
      x: object.x,
      y: object.y,
      renderX: optionalNumber(object, 'renderX'),
      renderY: optionalNumber(object, 'renderY'),
      width: object.width,
      height: object.height,
      depthY,
      layer: layerValue,
      crop: parseCrop(object),
      scale,
      assetStatus: optionalAssetStatus(object),
      occludesActors: optionalBoolean(object, 'occludesActors') ?? layerValue === 'sorted',
      colliders: parseObjectColliderProperty(object, zone, scale ?? 1),
      glow: parseGlow(object),
    };
  });
}

function parseCollisionLayer(map: TiledMap): WorldCollider[] {
  const layer = maybeObjectLayer(map, 'Collision');
  if (!layer) return [];
  return layer.objects.map((object) => ({
    id: object.name || `collision-${object.id}`,
    zone: requiredZone(object, 'Collision object'),
    points: objectToPolygon(object),
  }));
}

function parseWalkableLayer(map: TiledMap): Partial<Record<ZoneId, WorldPoint[][]>> {
  const layer = maybeObjectLayer(map, 'Walkable');
  if (!layer) return {};
  const byZone: Partial<Record<ZoneId, WorldPoint[][]>> = {};
  for (const object of layer.objects) {
    const zone = requiredZone(object, 'Walkable object');
    byZone[zone] = [...(byZone[zone] ?? []), objectToPolygon(object)];
  }
  return byZone;
}

function parsePoiLayer(map: TiledMap): Partial<Record<ZoneId, Poi[]>> {
  const layer = maybeObjectLayer(map, 'POI');
  if (!layer) return {};
  const byZone: Partial<Record<ZoneId, Poi[]>> = {};
  for (const object of layer.objects) {
    const zone = requiredZone(object, 'POI object');
    const poi: Poi = {
      id: object.name || `poi-${object.id}`,
      zone,
      x: object.x,
      y: object.y,
      label: optionalString(object, 'label') ?? object.name ?? `POI ${object.id}`,
      actionTexture: optionalString(object, 'actionTexture'),
      effect: requiredEffect(object),
      effectX: optionalNumber(object, 'effectX'),
      effectY: optionalNumber(object, 'effectY'),
      helperOnly: optionalBoolean(object, 'helperOnly') ?? false,
    };
    byZone[zone] = [...(byZone[zone] ?? []), poi];
  }
  return byZone;
}

function propToColliders(prop: WorldProp): WorldCollider[] {
  return prop.colliders?.map((points, index) => ({
    id: `${prop.id}-${index}`,
    zone: prop.zone,
    points,
  })) ?? [];
}

function parseObjectColliderProperty(object: TiledObject, zone: ZoneId, scale: number): WorldPoint[][] | undefined {
  const raw = optionalString(object, 'collider');
  if (!raw) return undefined;
  const rects = raw.split(';')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const [x, y, width, height] = chunk.split(',').map((part) => Number(part.trim()));
      if (![x, y, width, height].every(Number.isFinite)) {
        throw new Error(`${object.name || object.id}: invalid collider rect "${chunk}"`);
      }
      return rectToPolygon(object.x + x * scale, object.y + y * scale, width * scale, height * scale);
    });
  if (rects.length === 0) {
    throw new Error(`${object.name || object.id}: collider property had no valid rects`);
  }
  // Zone is accepted here to make malformed zone data fail before runtime use.
  assertZone(zone, object.name || 'collider');
  return rects;
}

function parseGlow(object: TiledObject): WorldProp['glow'] {
  const color = optionalString(object, 'glowColor');
  if (!color) return undefined;
  const x = optionalNumber(object, 'glowX');
  const y = optionalNumber(object, 'glowY');
  const radius = optionalNumber(object, 'glowRadius');
  if (x === undefined || y === undefined || radius === undefined) {
    throw new Error(`${object.name || object.id}: glowColor requires glowX, glowY, and glowRadius`);
  }
  return {
    x,
    y,
    radius,
    color: parseHexColor(color),
  };
}

function parseCrop(object: TiledObject): WorldProp['crop'] {
  const raw = optionalString(object, 'crop');
  if (!raw) return undefined;
  const [x, y, width, height] = raw.split(',').map((part) => Number(part.trim()));
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    throw new Error(`${object.name || object.id}: invalid crop rect "${raw}"`);
  }
  return { x, y, width, height };
}

function objectLayer(map: TiledMap, layerName: string): TiledLayer & { objects: TiledObject[] } {
  const layer = maybeObjectLayer(map, layerName);
  if (!layer) throw new Error(`Tiled map is missing object layer "${layerName}"`);
  return layer;
}

function maybeObjectLayer(map: TiledMap, layerName: string): (TiledLayer & { objects: TiledObject[] }) | null {
  const layer = map.layers.find((candidate) => candidate.name === layerName);
  if (!layer) return null;
  if (layer.type !== 'objectgroup' || !Array.isArray(layer.objects)) {
    throw new Error(`Tiled layer "${layerName}" must be an object layer`);
  }
  return layer as TiledLayer & { objects: TiledObject[] };
}

function objectToPolygon(object: TiledObject): WorldPoint[] {
  if (object.polygon && object.polygon.length >= 3) {
    return object.polygon.map((point) => ({ x: object.x + point.x, y: object.y + point.y }));
  }
  const width = object.width ?? 0;
  const height = object.height ?? 0;
  if (width <= 0 || height <= 0) {
    throw new Error(`${object.name || object.id}: polygon or positive rectangle size required`);
  }
  return rectToPolygon(object.x, object.y, width, height);
}

function rectToPolygon(x: number, y: number, width: number, height: number): WorldPoint[] {
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ];
}

function requiredString(object: TiledObject, name: string, context: string): string {
  const value = optionalString(object, name);
  if (!value) throw new Error(`${context} "${object.name || object.id}" is missing "${name}"`);
  return value;
}

function optionalString(object: TiledObject, name: string): string | undefined {
  const value = propertyValue(object, name);
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function requiredNumber(object: TiledObject, name: string, context: string): number {
  const value = optionalNumber(object, name);
  if (value === undefined) throw new Error(`${context} "${object.name || object.id}" is missing numeric "${name}"`);
  return value;
}

function optionalNumber(object: TiledObject, name: string): number | undefined {
  const value = propertyValue(object, name);
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function optionalBoolean(object: TiledObject, name: string): boolean | undefined {
  const value = propertyValue(object, name);
  return typeof value === 'boolean' ? value : undefined;
}

function requiredZone(object: TiledObject, context: string): AgentId {
  const value = requiredString(object, 'zone', context);
  return assertZone(value, `${context} "${object.name || object.id}"`);
}

function assertZone(value: string, context: string): AgentId {
  if (value === 'apex' || value === 'gale' || value === 'metheus') return value;
  throw new Error(`${context} has invalid zone "${value}"`);
}

function requiredEffect(object: TiledObject): Poi['effect'] {
  const value = requiredString(object, 'effect', 'POI object');
  if (
    value === 'apex-meditate'
    || value === 'apex-strike'
    || value === 'metheus-read'
    || value === 'metheus-telescope'
    || value === 'gale-cast'
    || value === 'gale-globe'
    || value === 'helper'
  ) {
    return value;
  }
  throw new Error(`POI object "${object.name || object.id}" has invalid effect "${value}"`);
}

function optionalAssetStatus(object: TiledObject): WorldProp['assetStatus'] {
  const value = optionalString(object, 'assetStatus');
  if (!value) return undefined;
  if (
    value === 'needed'
    || value === 'reused'
    || value === 'needs-regeneration'
    || value === 'generated'
    || value === 'placed'
    || value === 'verified'
  ) {
    return value;
  }
  throw new Error(`${object.name || object.id}: invalid assetStatus "${value}"`);
}

function propertyValue(object: TiledObject, name: string): TiledPropertyValue | undefined {
  return object.properties?.find((property) => property.name === name)?.value;
}

function publicPathFromMapImage(image: string): string {
  if (image.startsWith('/')) return image;
  const normalized = new URL(image, `http://local${MAP_PUBLIC_ROOT}`).pathname;
  return normalized;
}

function parseHexColor(value: string): number {
  const normalized = value.startsWith('#') ? value.slice(1) : value;
  const parsed = Number.parseInt(normalized, 16);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid hex color "${value}"`);
  return parsed;
}
