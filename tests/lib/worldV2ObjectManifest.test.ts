/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const manifestPath = path.resolve(process.cwd(), 'public/world-v2/maps/world-v2-object-manifest.json');

interface Manifest {
  schemaVersion: number;
  source: {
    referenceImage: string;
    groundImage: string;
    coordinateSpace: string;
    imageSize: Bounds;
  };
  statusDefinitions: Record<string, string>;
  roleDefinitions: Record<string, string>;
  zones: Array<{
    id: string;
    bbox: Bounds;
    status: string;
  }>;
  objects: ManifestObject[];
}

interface Bounds {
  x?: number;
  y?: number;
  width: number;
  height: number;
}

interface WorldPoint {
  x: number;
  y: number;
}

interface RemovalMask {
  kind: string;
  points: WorldPoint[];
}

interface ManifestObject {
  id: string;
  zone: string;
  role: string;
  layerTarget: string;
  bbox: Required<Bounds>;
  depthY?: number;
  collision: {
    kind: string;
    points?: WorldPoint[];
  };
  occlusion: {
    required: boolean;
  };
  removalMask?: RemovalMask;
  walkable?: RemovalMask;
  status: string[];
}

function readManifest() {
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Manifest;
}

function requiresForegroundOcclusion(object: ManifestObject) {
  return object.role === 'occluder' || (object.role === 'interactive' && object.occlusion.required);
}

function manifestCoordinateBounds(manifest: Manifest) {
  const left = Math.min(0, ...manifest.zones.map((zone) => zone.bbox.x ?? 0));
  const top = Math.min(0, ...manifest.zones.map((zone) => zone.bbox.y ?? 0));
  const right = Math.max(
    manifest.source.imageSize.width,
    ...manifest.zones.map((zone) => (zone.bbox.x ?? 0) + zone.bbox.width),
  );
  const bottom = Math.max(
    manifest.source.imageSize.height,
    ...manifest.zones.map((zone) => (zone.bbox.y ?? 0) + zone.bbox.height),
  );

  return { left, top, right, bottom };
}

describe('world v2 object manifest', () => {
  it('keeps the Apex reference inventory valid and explicit', () => {
    const manifest = readManifest();
    const roleNames = new Set(Object.keys(manifest.roleDefinitions));
    const statusNames = new Set(Object.keys(manifest.statusDefinitions));
    const zoneIds = new Set(manifest.zones.map((zone) => zone.id));
    const objectIds = new Set<string>();
    const coordinateBounds = manifestCoordinateBounds(manifest);

    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.source.referenceImage).toBe('/world-v2/layers/reference.png');
    expect(manifest.source.groundImage).toBe('/world-v2/layers/ground.png');
    expect(manifest.source.coordinateSpace).toBe('full reference image pixels');
    expect(manifest.source.imageSize).toEqual({ width: 1536, height: 1024 });
    expect(zoneIds.has('apex')).toBe(true);
    expect(manifest.objects.length).toBeGreaterThanOrEqual(30);

    for (const object of manifest.objects) {
      expect(objectIds.has(object.id), `${object.id} should be unique`).toBe(false);
      objectIds.add(object.id);

      expect(zoneIds.has(object.zone), `${object.id} should use a known zone`).toBe(true);
      expect(roleNames.has(object.role), `${object.id} should use a known role`).toBe(true);
      expect(object.layerTarget, `${object.id} should declare a layer target`).toBeTruthy();
      expect(['none', 'rect', 'rects', 'polygon'].includes(object.collision.kind), `${object.id} collision kind`).toBe(true);
      expect(object.status.length, `${object.id} should have tracking statuses`).toBeGreaterThan(0);
      for (const status of object.status) {
        expect(statusNames.has(status), `${object.id} unknown status ${status}`).toBe(true);
      }

      expect(object.bbox.x, `${object.id} bbox x`).toBeGreaterThanOrEqual(coordinateBounds.left);
      expect(object.bbox.y, `${object.id} bbox y`).toBeGreaterThanOrEqual(coordinateBounds.top);
      expect(object.bbox.width, `${object.id} bbox width`).toBeGreaterThan(0);
      expect(object.bbox.height, `${object.id} bbox height`).toBeGreaterThan(0);
      expect(object.bbox.x + object.bbox.width, `${object.id} bbox right`).toBeLessThanOrEqual(coordinateBounds.right);
      expect(object.bbox.y + object.bbox.height, `${object.id} bbox bottom`).toBeLessThanOrEqual(coordinateBounds.bottom);

      if (object.role === 'blocking-ground') {
        expect(object.collision.kind, `${object.id} blocking object needs collision`).not.toBe('none');
      }
      if (object.role === 'walkable-ground') {
        expect(object.walkable?.kind, `${object.id} walkable kind`).toBe('polygon');
        expect(object.walkable?.points.length, `${object.id} walkable points`).toBeGreaterThanOrEqual(3);
      }
      if (object.collision.points) {
        expect(object.collision.kind, `${object.id} collision points kind`).toBe('polygon');
        expect(object.role, `${object.id} collision points role`).toBe('blocking-ground');
        expect(object.collision.points.length, `${object.id} collision points`).toBeGreaterThanOrEqual(3);
        for (const point of object.collision.points) {
          expect(point.x, `${object.id} collision point x`).toEqual(expect.any(Number));
          expect(point.y, `${object.id} collision point y`).toEqual(expect.any(Number));
          expect(point.x, `${object.id} collision point x bounds`).toBeGreaterThanOrEqual(coordinateBounds.left);
          expect(point.y, `${object.id} collision point y bounds`).toBeGreaterThanOrEqual(coordinateBounds.top);
          expect(point.x, `${object.id} collision point x max`).toBeLessThanOrEqual(coordinateBounds.right);
          expect(point.y, `${object.id} collision point y max`).toBeLessThanOrEqual(coordinateBounds.bottom);
        }
      }
      if (requiresForegroundOcclusion(object)) {
        expect(object.depthY, `${object.id} depthY`).toEqual(expect.any(Number));
      }
      if (object.role === 'occluder') {
        expect(object.occlusion.required, `${object.id} occlusion`).toBe(true);
      }
      if (object.removalMask) {
        expect(requiresForegroundOcclusion(object), `${object.id} removal mask foreground`).toBe(true);
        expect(object.removalMask.kind, `${object.id} removal mask kind`).toBe('polygon');
        expect(object.removalMask.points.length, `${object.id} removal mask points`).toBeGreaterThanOrEqual(3);
        for (const point of object.removalMask.points) {
          expect(point.x, `${object.id} removal mask point x`).toEqual(expect.any(Number));
          expect(point.y, `${object.id} removal mask point y`).toEqual(expect.any(Number));
          expect(point.x, `${object.id} removal mask point x bounds`).toBeGreaterThanOrEqual(coordinateBounds.left);
          expect(point.y, `${object.id} removal mask point y bounds`).toBeGreaterThanOrEqual(coordinateBounds.top);
          expect(point.x, `${object.id} removal mask point x max`).toBeLessThanOrEqual(coordinateBounds.right);
          expect(point.y, `${object.id} removal mask point y max`).toBeLessThanOrEqual(coordinateBounds.bottom);
        }
      }
      if (object.walkable) {
        expect(object.role, `${object.id} walkable role`).toBe('walkable-ground');
        expect(object.walkable.kind, `${object.id} walkable kind`).toBe('polygon');
        expect(object.walkable.points.length, `${object.id} walkable points`).toBeGreaterThanOrEqual(3);
        for (const point of object.walkable.points) {
          expect(point.x, `${object.id} walkable point x`).toEqual(expect.any(Number));
          expect(point.y, `${object.id} walkable point y`).toEqual(expect.any(Number));
          expect(point.x, `${object.id} walkable point x bounds`).toBeGreaterThanOrEqual(coordinateBounds.left);
          expect(point.y, `${object.id} walkable point y bounds`).toBeGreaterThanOrEqual(coordinateBounds.top);
          expect(point.x, `${object.id} walkable point x max`).toBeLessThanOrEqual(coordinateBounds.right);
          expect(point.y, `${object.id} walkable point y max`).toBeLessThanOrEqual(coordinateBounds.bottom);
        }
      }
    }
  });

  it('tracks the manually labeled Apex detail density needed for regeneration', () => {
    const manifest = readManifest();
    const ids = new Set(manifest.objects.map((object) => object.id));
    const byRole = manifest.objects.reduce<Record<string, number>>((counts, object) => {
      counts[object.role] = (counts[object.role] ?? 0) + 1;
      return counts;
    }, {});

    expect(Array.from(ids)).toEqual(expect.arrayContaining([
      'apex-yard-center-lantern',
      'apex-dojo-front-planters',
      'apex-koi-pond-fence',
      'apex-lower-flower-left-cluster',
      'apex-lower-flower-center-cluster',
      'apex-lower-flower-right-cluster',
      'apex-koi-bottom-lantern',
      'apex-training-front-banner',
    ]));
    expect(manifest.objects.length).toBeGreaterThanOrEqual(70);
    expect(byRole.occluder).toBeGreaterThanOrEqual(25);
    expect(byRole['blocking-ground']).toBeGreaterThanOrEqual(15);
    expect(byRole['decor-cluster']).toBeGreaterThanOrEqual(10);
    expect(byRole['ground-baked']).toBeGreaterThanOrEqual(8);
    expect(manifest.objects.filter((object) => object.id.includes('flower')).length).toBeGreaterThanOrEqual(7);
    expect(manifest.objects.filter((object) => object.id.includes('bamboo')).length).toBeGreaterThanOrEqual(2);
  });

  it('keeps precision-critical Apex features split into tight manual boxes', () => {
    const manifest = readManifest();
    const ids = new Set(manifest.objects.map((object) => object.id));

    expect(Array.from(ids)).toEqual(expect.arrayContaining([
      'apex-training-front-right-rail',
      'apex-training-back-left-dummy',
      'apex-training-front-center-dummy',
      'apex-training-front-right-dummy',
      'apex-zen-stone-back-left',
      'apex-zen-stone-back-right',
    ]));
    expect(manifest.objects.filter((object) => object.id.includes('training-dummy') || object.id.includes('-dummy')).length)
      .toBeGreaterThanOrEqual(6);
    expect(manifest.objects.filter((object) => object.id.includes('rail') || object.id.includes('fence')).length)
      .toBeGreaterThanOrEqual(8);
    expect(manifest.objects.filter((object) => object.id.includes('zen') && object.role === 'blocking-ground').length)
      .toBeGreaterThanOrEqual(3);
    expect(manifest.objects.filter((object) => object.id.includes('non-walkable')).length).toBeGreaterThanOrEqual(6);
    expect(ids.has('apex-training-front-rails')).toBe(false);
    expect(ids.has('apex-training-dummies')).toBe(false);
    expect(ids.has('apex-zen-small-rocks')).toBe(false);
  });

  it('separates ground-baked features from blockers and occluders', () => {
    const manifest = readManifest();
    const byId = new Map(manifest.objects.map((object) => [object.id, object]));

    expect(byId.get('apex-training-yard-floor')).toMatchObject({
      role: 'ground-baked',
      layerTarget: 'base-ground',
      collision: { kind: 'none' },
    });
    expect(byId.get('apex-koi-pond-water')).toMatchObject({
      role: 'blocking-ground',
      layerTarget: 'base-ground',
      collision: { kind: 'polygon' },
    });
    expect(byId.get('apex-koi-pond-fence')).toMatchObject({
      role: 'occluder',
      layerTarget: 'foreground-occluder',
      occlusion: { required: true },
    });
    expect(byId.get('apex-zen-sand-garden')).toMatchObject({
      role: 'ground-baked',
      layerTarget: 'base-ground',
    });
  });
});
