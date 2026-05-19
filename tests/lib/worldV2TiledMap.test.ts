/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FALLBACK_WORLD_DATA } from '@/world-v2/worldMapData';
import { buildWorldFromTiledMap } from '@/world-v2/tiledMap';

const mapPath = path.resolve(process.cwd(), 'public/world-v2/maps/world-v2-apex-slice.tmj');

function readMap() {
  return JSON.parse(fs.readFileSync(mapPath, 'utf8')) as unknown;
}

describe('world v2 Tiled importer', () => {
  it('builds Apex authored props, textures, colliders, nav polygons, and POIs', () => {
    const world = buildWorldFromTiledMap(readMap(), FALLBACK_WORLD_DATA);

    expect(world.groundLayer.src).toBe('/world-v2/layers/ground.png');
    expect(world.referenceLayer.src).toBe('/world-v2/layers/reference.png');
    expect(world.worldSize).toEqual({ width: 1536, height: 1024 });
    expect(world.groundChunks).toEqual([
      {
        id: 'core',
        key: 'world-v2-ground',
        src: '/world-v2/layers/ground.png',
        x: 0,
        y: 0,
        width: 1536,
        height: 1024,
      },
    ]);
    expect(world.referenceChunks).toEqual([
      {
        id: 'core',
        key: 'world-v2-reference',
        src: '/world-v2/layers/reference.png',
        x: 0,
        y: 0,
        width: 1536,
        height: 1024,
      },
    ]);

    const dojo = world.props.find((prop) => prop.id === 'apex-dojo');
    expect(dojo).toMatchObject({
      zone: 'apex',
      src: '/world-v2/foreground/apex-dojo.png',
      key: 'world-v2-prop-apex-dojo',
      depthY: 256,
      layer: 'sorted',
      assetStatus: 'reused',
      occludesActors: true,
    });
    expect(dojo?.colliders?.[0]).toEqual([
      { x: 304, y: 126 },
      { x: 498, y: 126 },
      { x: 498, y: 244 },
      { x: 304, y: 244 },
    ]);

    expect(world.propTextures).toEqual(
      expect.arrayContaining([
        { key: 'world-v2-prop-apex-dojo', src: '/world-v2/foreground/apex-dojo.png' },
        { key: 'world-v2-prop-cherry-tree-large-base', src: '/world-v2/foreground/cherry-tree-large-base.png' },
        { key: 'world-v2-prop-cherry-tree-large-canopy', src: '/world-v2/foreground/cherry-tree-large-canopy.png' },
        { key: 'world-v2-prop-cherry-tree-large-trunk', src: '/world-v2/foreground/cherry-tree-large-trunk.png' },
        { key: 'world-v2-prop-cherry-tree-small-base', src: '/world-v2/foreground/cherry-tree-small-base.png' },
        { key: 'world-v2-prop-cherry-tree-small-canopy', src: '/world-v2/foreground/cherry-tree-small-canopy.png' },
        { key: 'world-v2-prop-cherry-tree-small-trunk', src: '/world-v2/foreground/cherry-tree-small-trunk.png' },
      ]),
    );
    expect(new Set(world.propTextures.map((texture) => texture.key)).size).toBe(world.propTextures.length);

    const trainingPlatform = world.props.find((prop) => prop.id === 'apex-training-platform');
    expect(trainingPlatform).toMatchObject({
      layer: 'ground',
      occludesActors: false,
    });

    const leftTreeBase = world.props.find((prop) => prop.id === 'apex-cherry-left-base');
    expect(leftTreeBase).toMatchObject({
      src: '/world-v2/foreground/cherry-tree-large-base.png',
      layer: 'ground',
      scale: 0.72,
      assetStatus: 'needs-regeneration',
      occludesActors: false,
    });
    expect(leftTreeBase?.colliders?.[0][0].x).toBeCloseTo(38.32);
    expect(leftTreeBase?.colliders?.[0][0].y).toBeCloseTo(139.44);

    const leftCanopy = world.props.find((prop) => prop.id === 'apex-cherry-left-canopy');
    expect(leftCanopy).toMatchObject({
      src: '/world-v2/foreground/cherry-tree-large-canopy.png',
      layer: 'sorted',
      depthY: 246,
      scale: 0.72,
      assetStatus: 'needs-regeneration',
      occludesActors: true,
    });

    const leftTrunk = world.props.find((prop) => prop.id === 'apex-cherry-left-trunk');
    expect(leftTrunk).toMatchObject({
      src: '/world-v2/foreground/cherry-tree-large-trunk.png',
      layer: 'sorted',
      depthY: 292,
      scale: 0.72,
      assetStatus: 'needs-regeneration',
      occludesActors: true,
    });

    const smallTreeBase = world.props.find((prop) => prop.id === 'apex-cherry-small-base');
    expect(smallTreeBase).toMatchObject({
      src: '/world-v2/foreground/cherry-tree-small-base.png',
      layer: 'ground',
      scale: 0.38,
      assetStatus: 'needs-regeneration',
      occludesActors: false,
    });

    const smallTreeTrunk = world.props.find((prop) => prop.id === 'apex-cherry-small-trunk');
    expect(smallTreeTrunk).toMatchObject({
      src: '/world-v2/foreground/cherry-tree-small-trunk.png',
      layer: 'sorted',
      depthY: 152,
      scale: 0.38,
      assetStatus: 'needs-regeneration',
      occludesActors: true,
    });

    const fence = world.props.find((prop) => prop.id === 'apex-low-fence-front');
    expect(fence).toMatchObject({
      src: '/world-v2/foreground/low-fence.png',
      width: 95,
      height: 74,
      assetStatus: 'verified',
    });

    const bench = world.props.find((prop) => prop.id === 'apex-bench-path');
    expect(bench).toMatchObject({
      src: '/world-v2/foreground/bench.png',
      width: 87,
      height: 73,
      assetStatus: 'verified',
    });

    expect(world.navMeshPolygons.apex).toHaveLength(3);
    expect(world.colliders.some((collider) => collider.id === 'apex-dojo-0')).toBe(true);
    expect(world.colliders.some((collider) => collider.id === 'apex-koi-water')).toBe(true);

    const apexPois = world.pois.filter((poi) => poi.zone === 'apex');
    expect(apexPois.map((poi) => poi.id).sort()).toEqual([
      'banner-check',
      'dojo-mat',
      'petal-sweep',
      'water-carry',
      'zen-garden',
    ]);
    expect(world.pois.some((poi) => poi.id === 'observatory')).toBe(true);
  });

  it('keeps authored Apex props traceable to valid source assets', () => {
    const world = buildWorldFromTiledMap(readMap(), FALLBACK_WORLD_DATA);
    const propIds = new Set<string>();

    for (const prop of world.props) {
      expect(propIds.has(prop.id), `${prop.id} should be unique`).toBe(false);
      propIds.add(prop.id);
      expect(prop.assetStatus, `${prop.id} should declare assetStatus`).toBeDefined();

      const filePath = path.resolve(process.cwd(), 'public', prop.src.replace(/^\//, ''));
      expect(fs.existsSync(filePath), `${prop.id} should reference an existing PNG`).toBe(true);

      if (prop.crop) {
        const size = readPngSize(filePath);
        expect(prop.crop.x, `${prop.id} crop x`).toBeGreaterThanOrEqual(0);
        expect(prop.crop.y, `${prop.id} crop y`).toBeGreaterThanOrEqual(0);
        expect(prop.crop.x + prop.crop.width, `${prop.id} crop width`).toBeLessThanOrEqual(size.width);
        expect(prop.crop.y + prop.crop.height, `${prop.id} crop height`).toBeLessThanOrEqual(size.height);
      }
    }
  });

  it('preserves fallback expansion chunks while importing the authored core layer', () => {
    const eastChunk = {
      id: 'east-expansion-test',
      key: 'world-v2-ground-east-expansion-test',
      src: '/world-v2/layers/east-expansion-test.png',
      x: 1536,
      y: 0,
      width: 320,
      height: 512,
    };
    const world = buildWorldFromTiledMap(readMap(), {
      ...FALLBACK_WORLD_DATA,
      groundChunks: [...FALLBACK_WORLD_DATA.groundChunks, eastChunk],
    });

    expect(world.groundChunks[0]).toMatchObject({
      id: 'core',
      src: '/world-v2/layers/ground.png',
      x: 0,
      y: 0,
      width: 1536,
      height: 1024,
    });
    expect(world.groundChunks[1]).toEqual(eastChunk);
    expect(world.worldSize).toEqual({ width: 1856, height: 1024 });
  });

  it('fails loudly when a sorted prop omits its asset property', () => {
    const map = readMap() as {
      layers: Array<{
        name: string;
        objects?: Array<{ properties?: Array<{ name: string }> }>;
      }>;
    };
    const propsLayer = map.layers.find((layer) => layer.name === 'PropsSorted');
    const firstObject = propsLayer?.objects?.[0];
    if (!firstObject?.properties) throw new Error('test fixture missing first prop');
    firstObject.properties = firstObject.properties.filter((property) => property.name !== 'asset');

    expect(() => buildWorldFromTiledMap(map, FALLBACK_WORLD_DATA))
      .toThrow(/missing "asset"/);
  });
});

function readPngSize(filePath: string) {
  const png = fs.readFileSync(filePath);
  const signature = png.subarray(0, 8).toString('hex');
  if (signature !== '89504e470d0a1a0a') throw new Error(`${filePath} is not a PNG`);
  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
  };
}
