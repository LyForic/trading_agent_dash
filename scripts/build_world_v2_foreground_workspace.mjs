import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'public/world-v2/maps/world-v2-object-manifest.json');
const referencePath = path.join(root, 'public/world-v2/layers/reference.png');
const targetId = process.argv[2] ?? 'gale';
const baconFullMapRuntime = targetId === 'manifest-runtime-bacon-fullmap';
const referenceOnly = process.argv.includes('--reference-only') || targetId === 'manifest-runtime' || baconFullMapRuntime;
const allZones = targetId === 'all' || targetId === 'manifest-runtime' || baconFullMapRuntime;
const zoneId = allZones ? null : targetId;
const workspacePublicRoot = targetId === 'manifest-runtime'
  ? '/world-v2/runtime/manifest'
  : baconFullMapRuntime
    ? '/world-v2/runtime/manifest-bacon-fullmap'
  : `/world-v2/source/${targetId}-foreground-workspace`;
const outDir = targetId === 'manifest-runtime'
  ? path.join(root, 'public/world-v2/runtime/manifest')
  : baconFullMapRuntime
    ? path.join(root, 'public/world-v2/runtime/manifest-bacon-fullmap')
  : path.join(root, `private/world-v2/source/${targetId}-foreground-workspace`);
const spritesDir = path.join(outDir, 'sprites');
const groundWorkspaceDir = zoneId ? path.join(root, `private/world-v2/source/${zoneId}-ground-workspace`) : null;
const approvedGroundPreviewPath = groundWorkspaceDir
  ? path.join(groundWorkspaceDir, 'approved-ground-preview-full.png')
  : null;
const preservedGroundPreviewPath = groundWorkspaceDir
  ? path.join(groundWorkspaceDir, 'reference-preserved-current-ground-preview-full.png')
  : null;
const BACON_FULL_MAP_CHUNKS = [
  { src: '/world-v2/layers/bacon-fullmap-west-v1.png', x: -512, y: 0, width: 512, height: 1024 },
  { src: '/world-v2/layers/bacon-fullmap-core-0-v1.png', x: 0, y: 0, width: 512, height: 1024 },
  { src: '/world-v2/layers/bacon-fullmap-core-1-v1.png', x: 512, y: 0, width: 512, height: 1024 },
  { src: '/world-v2/layers/bacon-fullmap-core-2-v1.png', x: 1024, y: 0, width: 512, height: 1024 },
];

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const crcTable = new Uint32Array(256).map((_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
  }
  return crc >>> 0;
});

function main() {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const reference = readReferenceImage();
  const coordinateSpace = imageCoordinateSpace(reference);
  const cleanGround = readCleanGround(reference);
  const zones = allZones
    ? manifest.zones.filter((zone) => baconFullMapRuntime || zone.id !== 'bacon')
    : manifest.zones.filter((candidate) => candidate.id === zoneId);
  if (zones.length === 0) throw new Error(`Manifest has no zone "${zoneId}"`);
  const zoneIds = new Set(zones.map((zone) => zone.id));

  const objects = manifest.objects
    .filter((object) => zoneIds.has(object.zone) && requiresForegroundOcclusion(object))
    .sort((a, b) => (a.depthY ?? a.bbox.y + a.bbox.height) - (b.depthY ?? b.bbox.y + b.bbox.height));

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(spritesDir, { recursive: true });

  const preview = cloneImage(cleanGround);
  const alphaMask = {
    width: reference.width,
    height: reference.height,
    data: Buffer.alloc(reference.width * reference.height * 4),
  };
  const spriteIndex = [];

  for (const object of objects) {
    const alphaResult = buildObjectAlpha(reference, cleanGround, object, coordinateSpace, { referenceOnly });
    const imageCrop = cropBoundsFromAlpha(alphaResult.alpha, coordinateSpace, object.bbox, 4);
    const worldCrop = imageCropToWorldBounds(imageCrop, coordinateSpace);
    const sprite = cropWithAlpha(reference, alphaResult.alpha, imageCrop);
    const fileName = `${slugify(object.id)}.png`;
    const spritePath = path.join(spritesDir, fileName);

    writePng(spritePath, sprite);
    compositeImage(preview, sprite, imageCrop.x, imageCrop.y);
    paintAlphaMask(alphaMask, alphaResult.alpha);

    spriteIndex.push({
      id: object.id,
      zone: object.zone,
      label: object.label,
      role: object.role,
      category: object.category,
      sprite: `${workspacePublicRoot}/sprites/${fileName}`,
      sourceBbox: object.bbox,
      spriteCrop: worldCrop,
      x: worldCrop.x,
      y: worldCrop.y,
      depthY: object.depthY ?? object.bbox.y + object.bbox.height,
      maskSource: alphaResult.source,
      alphaPixels: alphaResult.alphaPixels,
      spriteAlphaCoverage: Number((alphaResult.alphaPixels / (imageCrop.width * imageCrop.height)).toFixed(3)),
      removalMaskPoints: object.removalMask?.points?.length ?? 0,
      status: object.status,
      notes: object.notes,
    });
  }

  writePng(path.join(outDir, 'foreground-placement-preview-full.png'), preview);
  writePng(path.join(outDir, 'foreground-alpha-mask-full.png'), alphaMask);
  fs.writeFileSync(path.join(outDir, 'sprite-index.json'), `${JSON.stringify({
    schemaVersion: 1,
    zone: allZones
      ? { id: 'all', label: 'All manifest zones', bbox: coordinateSpace }
      : { id: zones[0].id, label: zones[0].label, bbox: zones[0].bbox },
    zones,
    sourceImages: {
      reference: reference.source,
      cleanGround: cleanGround.source,
    },
    outputs: {
      placementPreviewFull: `${workspacePublicRoot}/foreground-placement-preview-full.png`,
      alphaMaskFull: `${workspacePublicRoot}/foreground-alpha-mask-full.png`,
      sprites: `${workspacePublicRoot}/sprites/`,
    },
    extractionPolicy: {
      mode: referenceOnly ? 'reference-overlay' : 'clean-ground-foreground',
      includedObjects: 'Extract occluders and only interactive objects with occlusion.required=true.',
      manualMask: 'Use manifest removalMask polygons when present.',
      autoDiff: referenceOnly
        ? 'Disabled in reference-overlay mode; unmasked objects use their authored boxes.'
        : 'For unmasked objects, compare the flat reference against the approved/preserved cleaned ground inside the object box.',
      fallbackBox: referenceOnly
        ? 'Use the authored box when no manual removalMask exists.'
        : 'Use a rectangle only when the diff mask cannot find enough object pixels.',
    },
    sprites: spriteIndex,
  }, null, 2)}\n`);

  const sourceCounts = spriteIndex.reduce((counts, sprite) => {
    counts[sprite.maskSource] = (counts[sprite.maskSource] ?? 0) + 1;
    return counts;
  }, {});

  console.log(`Built ${targetId} foreground workspace at ${path.relative(root, outDir)}`);
  console.log(`Sprites: ${spriteIndex.length}`);
  console.log(`Mask sources: ${JSON.stringify(sourceCounts)}`);
}

function requiresForegroundOcclusion(object) {
  return object.role === 'occluder' || (object.role === 'interactive' && object.occlusion?.required === true);
}

function readReferenceImage() {
  if (baconFullMapRuntime) {
    return composeImageChunks(BACON_FULL_MAP_CHUNKS, '/world-v2/layers/bacon-fullmap-*.png');
  }

  return {
    ...readPng(referencePath),
    source: '/world-v2/layers/reference.png',
    x: 0,
    y: 0,
  };
}

function composeImageChunks(chunks, sourceLabel) {
  const minX = Math.min(...chunks.map((chunk) => chunk.x));
  const minY = Math.min(...chunks.map((chunk) => chunk.y));
  const maxX = Math.max(...chunks.map((chunk) => chunk.x + chunk.width));
  const maxY = Math.max(...chunks.map((chunk) => chunk.y + chunk.height));
  const composed = {
    width: maxX - minX,
    height: maxY - minY,
    data: Buffer.alloc((maxX - minX) * (maxY - minY) * 4),
    source: sourceLabel,
    x: minX,
    y: minY,
  };

  for (const chunk of chunks) {
    const chunkImage = readPng(path.join(root, 'public', chunk.src));
    if (chunkImage.width !== chunk.width || chunkImage.height !== chunk.height) {
      throw new Error(`${chunk.src} must be ${chunk.width}x${chunk.height}`);
    }
    pasteImage(composed, chunkImage, chunk.x - minX, chunk.y - minY);
  }

  return composed;
}

function pasteImage(base, overlay, targetX, targetY) {
  for (let y = 0; y < overlay.height; y += 1) {
    for (let x = 0; x < overlay.width; x += 1) {
      const sourceOffset = ((y * overlay.width) + x) * 4;
      const targetOffset = (((targetY + y) * base.width) + targetX + x) * 4;
      base.data[targetOffset] = overlay.data[sourceOffset];
      base.data[targetOffset + 1] = overlay.data[sourceOffset + 1];
      base.data[targetOffset + 2] = overlay.data[sourceOffset + 2];
      base.data[targetOffset + 3] = overlay.data[sourceOffset + 3];
    }
  }
}

function imageCoordinateSpace(image) {
  return {
    x: image.x ?? 0,
    y: image.y ?? 0,
    width: image.width,
    height: image.height,
  };
}

function imageCropToWorldBounds(crop, coordinateSpace) {
  return {
    x: crop.x + coordinateSpace.x,
    y: crop.y + coordinateSpace.y,
    width: crop.width,
    height: crop.height,
  };
}

function worldPointToImagePoint(point, coordinateSpace) {
  return {
    x: point.x - coordinateSpace.x,
    y: point.y - coordinateSpace.y,
  };
}

function worldBoundsToImageBounds(bounds, coordinateSpace) {
  return {
    x: bounds.x - coordinateSpace.x,
    y: bounds.y - coordinateSpace.y,
    width: bounds.width,
    height: bounds.height,
  };
}

function readCleanGround(reference) {
  if (referenceOnly || !groundWorkspaceDir) {
    return { ...cloneImage(reference), source: reference.source ?? '/world-v2/layers/reference.png' };
  }

  const source = fs.existsSync(approvedGroundPreviewPath)
    ? approvedGroundPreviewPath
    : preservedGroundPreviewPath;
  if (!fs.existsSync(source)) return { ...cloneImage(reference), source: reference.source ?? '/world-v2/layers/reference.png' };

  const cleanGround = readPng(source);
  if (cleanGround.width !== reference.width || cleanGround.height !== reference.height) {
    throw new Error(`${source} must be ${reference.width}x${reference.height}`);
  }
  return {
    ...cleanGround,
    source: source.startsWith(path.join(root, 'public'))
      ? source.slice(path.join(root, 'public').length)
      : path.relative(root, source),
  };
}

function buildObjectAlpha(reference, cleanGround, object, coordinateSpace, options = {}) {
  const manualAlpha = buildManualMaskAlpha(object, coordinateSpace);
  if (manualAlpha) {
    return {
      alpha: manualAlpha,
      source: 'manual-removalMask',
      alphaPixels: countAlphaPixels(manualAlpha),
    };
  }

  if (!options.referenceOnly) {
    const diffAlpha = buildDiffAlpha(reference, cleanGround, object.bbox, coordinateSpace);
    const diffPixels = countAlphaPixels(diffAlpha);
    const minimumDiffPixels = Math.max(24, Math.floor(object.bbox.width * object.bbox.height * 0.03));
    if (diffPixels >= minimumDiffPixels) {
      return {
        alpha: diffAlpha,
        source: 'auto-diff',
        alphaPixels: diffPixels,
      };
    }
  }

  const boxAlpha = new Uint8Array(coordinateSpace.width * coordinateSpace.height);
  fillAlphaRect(boxAlpha, coordinateSpace, object.bbox, 255, 0);
  return {
    alpha: boxAlpha,
    source: 'bbox-fallback',
    alphaPixels: countAlphaPixels(boxAlpha),
  };
}

function buildManualMaskAlpha(object, coordinateSpace) {
  const removalMask = object.removalMask;
  if (
    removalMask?.kind !== 'polygon'
    || !Array.isArray(removalMask.points)
    || removalMask.points.length < 3
  ) {
    return null;
  }

  const alpha = new Uint8Array(coordinateSpace.width * coordinateSpace.height);
  fillAlphaPolygon(alpha, coordinateSpace, removalMask.points, 255);
  return alpha;
}

function buildDiffAlpha(reference, cleanGround, bounds, coordinateSpace) {
  const rawAlpha = new Uint8Array(coordinateSpace.width * coordinateSpace.height);
  const strongThreshold = 42;
  const softThreshold = 18;
  const area = paddedBounds(bounds, coordinateSpace, 2);

  for (let y = area.top; y < area.bottom; y += 1) {
    for (let x = area.left; x < area.right; x += 1) {
      const index = (y * coordinateSpace.width) + x;
      const offset = index * 4;
      const redDiff = Math.abs(reference.data[offset] - cleanGround.data[offset]);
      const greenDiff = Math.abs(reference.data[offset + 1] - cleanGround.data[offset + 1]);
      const blueDiff = Math.abs(reference.data[offset + 2] - cleanGround.data[offset + 2]);
      const maxDiff = Math.max(redDiff, greenDiff, blueDiff);
      const colorDiff = (redDiff + greenDiff + blueDiff) / 3;
      const score = Math.max(maxDiff, colorDiff * 1.2);

      if (score >= strongThreshold) {
        rawAlpha[index] = 255;
      } else if (score >= softThreshold) {
        rawAlpha[index] = Math.max(
          rawAlpha[index],
          Math.round(((score - softThreshold) / (strongThreshold - softThreshold)) * 210),
        );
      }
    }
  }

  return blurAlpha(dilateAlpha(rawAlpha, coordinateSpace.width, coordinateSpace.height, 1), coordinateSpace.width, coordinateSpace.height, 1, 1);
}

function cropBoundsFromAlpha(alpha, coordinateSpace, fallbackBounds, padding) {
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = 0;
  let bottom = 0;

  for (let y = 0; y < coordinateSpace.height; y += 1) {
    for (let x = 0; x < coordinateSpace.width; x += 1) {
      if (alpha[(y * coordinateSpace.width) + x] === 0) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x + 1);
      bottom = Math.max(bottom, y + 1);
    }
  }

  if (!Number.isFinite(left)) {
    const fallbackImageBounds = worldBoundsToImageBounds(fallbackBounds, coordinateSpace);
    return {
      x: Math.max(0, Math.floor(fallbackImageBounds.x)),
      y: Math.max(0, Math.floor(fallbackImageBounds.y)),
      width: Math.min(coordinateSpace.width, Math.ceil(fallbackImageBounds.width)),
      height: Math.min(coordinateSpace.height, Math.ceil(fallbackImageBounds.height)),
    };
  }

  const x = Math.max(0, left - padding);
  const y = Math.max(0, top - padding);
  const cropRight = Math.min(coordinateSpace.width, right + padding);
  const cropBottom = Math.min(coordinateSpace.height, bottom + padding);
  return {
    x,
    y,
    width: cropRight - x,
    height: cropBottom - y,
  };
}

function cropWithAlpha(source, alpha, crop) {
  const data = Buffer.alloc(crop.width * crop.height * 4);
  for (let y = 0; y < crop.height; y += 1) {
    for (let x = 0; x < crop.width; x += 1) {
      const sourceIndex = ((crop.y + y) * source.width) + crop.x + x;
      const sourceOffset = sourceIndex * 4;
      const targetOffset = ((y * crop.width) + x) * 4;
      data[targetOffset] = source.data[sourceOffset];
      data[targetOffset + 1] = source.data[sourceOffset + 1];
      data[targetOffset + 2] = source.data[sourceOffset + 2];
      data[targetOffset + 3] = alpha[sourceIndex];
    }
  }
  return { width: crop.width, height: crop.height, data };
}

function compositeImage(base, overlay, targetX, targetY) {
  for (let y = 0; y < overlay.height; y += 1) {
    const baseY = targetY + y;
    if (baseY < 0 || baseY >= base.height) continue;

    for (let x = 0; x < overlay.width; x += 1) {
      const baseX = targetX + x;
      if (baseX < 0 || baseX >= base.width) continue;

      const overlayOffset = ((y * overlay.width) + x) * 4;
      const alpha = overlay.data[overlayOffset + 3] / 255;
      if (alpha <= 0) continue;

      const baseOffset = ((baseY * base.width) + baseX) * 4;
      base.data[baseOffset] = Math.round(overlay.data[overlayOffset] * alpha + base.data[baseOffset] * (1 - alpha));
      base.data[baseOffset + 1] = Math.round(overlay.data[overlayOffset + 1] * alpha + base.data[baseOffset + 1] * (1 - alpha));
      base.data[baseOffset + 2] = Math.round(overlay.data[overlayOffset + 2] * alpha + base.data[baseOffset + 2] * (1 - alpha));
      base.data[baseOffset + 3] = 255;
    }
  }
}

function paintAlphaMask(image, alpha) {
  for (let index = 0; index < alpha.length; index += 1) {
    const value = Math.max(image.data[index * 4], alpha[index]);
    const offset = index * 4;
    image.data[offset] = value;
    image.data[offset + 1] = value;
    image.data[offset + 2] = value;
    image.data[offset + 3] = 255;
  }
}

function countAlphaPixels(alpha) {
  let count = 0;
  for (const value of alpha) {
    if (value > 0) count += 1;
  }
  return count;
}

function fillAlphaPolygon(alpha, imageSize, points, value) {
  const imagePoints = points.map((point) => worldPointToImagePoint(point, imageSize));
  if (imagePoints.length < 3) return;
  const minY = Math.max(0, Math.floor(Math.min(...imagePoints.map((point) => point.y))));
  const maxY = Math.min(imageSize.height - 1, Math.ceil(Math.max(...imagePoints.map((point) => point.y))));

  for (let y = minY; y <= maxY; y += 1) {
    const scanY = y + 0.5;
    const intersections = [];

    for (let index = 0; index < imagePoints.length; index += 1) {
      const start = imagePoints[index];
      const end = imagePoints[(index + 1) % imagePoints.length];
      if ((start.y <= scanY && end.y > scanY) || (end.y <= scanY && start.y > scanY)) {
        const ratio = (scanY - start.y) / (end.y - start.y);
        intersections.push(start.x + ratio * (end.x - start.x));
      }
    }

    intersections.sort((a, b) => a - b);
    for (let index = 0; index < intersections.length; index += 2) {
      if (intersections[index + 1] === undefined) continue;
      const left = Math.max(0, Math.ceil(intersections[index]));
      const right = Math.min(imageSize.width - 1, Math.floor(intersections[index + 1]));
      for (let x = left; x <= right; x += 1) {
        alpha[(y * imageSize.width) + x] = value;
      }
    }
  }
}

function fillAlphaRect(alpha, imageSize, bounds, value, extraPadding) {
  const imageBounds = worldBoundsToImageBounds(bounds, imageSize);
  const left = Math.max(0, Math.floor(imageBounds.x - extraPadding));
  const top = Math.max(0, Math.floor(imageBounds.y - extraPadding));
  const right = Math.min(imageSize.width, Math.ceil(imageBounds.x + imageBounds.width + extraPadding));
  const bottom = Math.min(imageSize.height, Math.ceil(imageBounds.y + imageBounds.height + extraPadding));

  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      alpha[(y * imageSize.width) + x] = value;
    }
  }
}

function paddedBounds(bounds, imageSize, padding) {
  const imageBounds = worldBoundsToImageBounds(bounds, imageSize);
  return {
    left: Math.max(0, Math.floor(imageBounds.x - padding)),
    top: Math.max(0, Math.floor(imageBounds.y - padding)),
    right: Math.min(imageSize.width, Math.ceil(imageBounds.x + imageBounds.width + padding)),
    bottom: Math.min(imageSize.height, Math.ceil(imageBounds.y + imageBounds.height + padding)),
  };
}

function dilateAlpha(source, width, height, radius) {
  const output = new Uint8Array(source.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let value = 0;
      for (let sampleY = Math.max(0, y - radius); sampleY <= Math.min(height - 1, y + radius); sampleY += 1) {
        for (let sampleX = Math.max(0, x - radius); sampleX <= Math.min(width - 1, x + radius); sampleX += 1) {
          value = Math.max(value, source[(sampleY * width) + sampleX]);
        }
      }
      output[(y * width) + x] = value;
    }
  }
  return output;
}

function blurAlpha(source, width, height, radius, passes) {
  let current = source;
  for (let pass = 0; pass < passes; pass += 1) {
    const horizontal = new Uint8Array(current.length);
    const vertical = new Uint8Array(current.length);

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let total = 0;
        let count = 0;
        for (let sampleX = Math.max(0, x - radius); sampleX <= Math.min(width - 1, x + radius); sampleX += 1) {
          total += current[(y * width) + sampleX];
          count += 1;
        }
        horizontal[(y * width) + x] = Math.round(total / count);
      }
    }

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let total = 0;
        let count = 0;
        for (let sampleY = Math.max(0, y - radius); sampleY <= Math.min(height - 1, y + radius); sampleY += 1) {
          total += horizontal[(sampleY * width) + x];
          count += 1;
        }
        vertical[(y * width) + x] = Math.round(total / count);
      }
    }

    current = vertical;
  }
  return current;
}

function cloneImage(image) {
  return {
    width: image.width,
    height: image.height,
    data: Buffer.from(image.data),
  };
}

function readPng(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (!buffer.subarray(0, 8).equals(pngSignature)) throw new Error(`${filePath} is not a PNG`);

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += length + 12;
  }

  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`${filePath} must be an 8-bit RGB or RGBA PNG`);
  }

  const channels = colorType === 6 ? 4 : 3;
  return {
    width,
    height,
    data: unfilterPngData(zlib.inflateSync(Buffer.concat(idat)), width, height, channels),
  };
}

function unfilterPngData(raw, width, height, channels) {
  const stride = width * channels;
  const pixels = Buffer.alloc(width * height * 4);
  let sourceOffset = 0;
  let previous = Buffer.alloc(stride);
  let current = Buffer.alloc(stride);

  for (let y = 0; y < height; y += 1) {
    const filter = raw[sourceOffset];
    sourceOffset += 1;

    for (let x = 0; x < stride; x += 1) {
      const value = raw[sourceOffset];
      sourceOffset += 1;
      const left = x >= channels ? current[x - channels] : 0;
      const up = previous[x];
      const upperLeft = x >= channels ? previous[x - channels] : 0;
      current[x] = reconstructPngByte(filter, value, left, up, upperLeft);
    }

    for (let x = 0; x < width; x += 1) {
      const sourcePixelOffset = x * channels;
      const targetPixelOffset = ((y * width) + x) * 4;
      pixels[targetPixelOffset] = current[sourcePixelOffset];
      pixels[targetPixelOffset + 1] = current[sourcePixelOffset + 1];
      pixels[targetPixelOffset + 2] = current[sourcePixelOffset + 2];
      pixels[targetPixelOffset + 3] = channels === 4 ? current[sourcePixelOffset + 3] : 255;
    }

    [previous, current] = [current, previous];
  }

  return pixels;
}

function reconstructPngByte(filter, value, left, up, upperLeft) {
  if (filter === 0) return value;
  if (filter === 1) return (value + left) & 0xff;
  if (filter === 2) return (value + up) & 0xff;
  if (filter === 3) return (value + Math.floor((left + up) / 2)) & 0xff;
  if (filter === 4) return (value + paethPredictor(left, up, upperLeft)) & 0xff;
  throw new Error(`Unsupported PNG filter ${filter}`);
}

function paethPredictor(left, up, upperLeft) {
  const estimate = left + up - upperLeft;
  const distanceLeft = Math.abs(estimate - left);
  const distanceUp = Math.abs(estimate - up);
  const distanceUpperLeft = Math.abs(estimate - upperLeft);
  if (distanceLeft <= distanceUp && distanceLeft <= distanceUpperLeft) return left;
  return distanceUp <= distanceUpperLeft ? up : upperLeft;
}

function writePng(filePath, image) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(image.width, 0);
  header.writeUInt32BE(image.height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const stride = image.width * 4;
  const raw = Buffer.alloc((stride + 1) * image.height);
  for (let y = 0; y < image.height; y += 1) {
    raw[y * (stride + 1)] = 0;
    image.data.copy(raw, (y * (stride + 1)) + 1, y * stride, (y + 1) * stride);
  }

  fs.writeFileSync(filePath, Buffer.concat([
    pngSignature,
    pngChunk('IHDR', header),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]));
}

function pngChunk(type, data) {
  const name = Buffer.from(type);
  const chunk = Buffer.alloc(data.length + 12);
  chunk.writeUInt32BE(data.length, 0);
  name.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([name, data])), data.length + 8);
  return chunk;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function slugify(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'object';
}

main();
