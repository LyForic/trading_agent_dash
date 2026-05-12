import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'public/world-v2/maps/world-v2-object-manifest.json');
const referencePath = path.join(root, 'public/world-v2/layers/reference.png');
const currentGroundPath = path.join(root, 'public/world-v2/layers/ground.png');
const zoneId = process.argv[2] ?? 'apex';
const padding = Number(process.argv[3] ?? 96);
const workspacePublicRoot = `/world-v2/source/${zoneId}-ground-workspace`;
const outDir = path.join(root, `private/world-v2/source/${zoneId}-ground-workspace`);

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const crcTable = new Uint32Array(256).map((_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
  }
  return crc >>> 0;
});

const roleColors = {
  'ground-baked': [93, 228, 255, 148],
  'blocking-ground': [255, 78, 78, 154],
  occluder: [255, 224, 90, 154],
  'decor-cluster': [140, 255, 120, 142],
  interactive: [182, 140, 255, 160],
};

function main() {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const reference = readPng(referencePath);
  const currentGround = readPng(currentGroundPath);
  const zone = manifest.zones.find((candidate) => candidate.id === zoneId);
  if (!zone) throw new Error(`Manifest has no zone "${zoneId}"`);

  const objects = manifest.objects.filter((object) => object.zone === zoneId);
  const crop = paddedUnionCrop([zone.bbox, ...objects.map((object) => object.bbox)], manifest.source.imageSize, padding);
  const referenceCrop = cropImage(reference, crop);
  const currentGroundCrop = cropImage(currentGround, crop);
  const relativeObjects = objects.map((object) => ({
    ...object,
    relativeBbox: relativeBounds(object.bbox, crop),
    relativeRemovalMask: relativeRemovalMask(object.removalMask, crop),
  }));
  const groundAuthoringObjects = relativeObjects.filter((object) => (
    object.role === 'ground-baked'
    || object.role === 'blocking-ground'
    || object.role === 'decor-cluster'
  ));
  const foregroundObjects = relativeObjects.filter((object) => requiresForegroundOcclusion(object));
  const groundCandidate = buildGroundCandidate(currentGroundCrop, referenceCrop, crop, groundAuthoringObjects);
  const inpaintGroundCandidate = buildReferenceInpaintGroundCandidate(referenceCrop, crop, foregroundObjects);
  const fullGroundPreview = buildFullGroundPreview(currentGround, groundCandidate, crop, zone, relativeObjects);
  const fullInpaintGroundPreview = buildFullGroundPreview(currentGround, inpaintGroundCandidate, crop, zone, relativeObjects);
  const foregroundRemovalMask = buildForegroundRemovalAlpha(crop, foregroundObjects);
  const foregroundRemovalShapeMask = buildForegroundRemovalAlpha(crop, foregroundObjects, 2, 0);
  const foregroundDiffRemovalMask = buildForegroundDiffRemovalAlpha(referenceCrop, currentGroundCrop, crop, foregroundObjects);

  fs.mkdirSync(outDir, { recursive: true });
  writePng(path.join(outDir, 'reference-padded.png'), referenceCrop);
  writePng(path.join(outDir, 'current-ground-padded.png'), currentGroundCrop);
  writePng(path.join(outDir, 'label-driven-ground-candidate-padded.png'), groundCandidate);
  writePng(path.join(outDir, 'label-driven-ground-preview-full.png'), fullGroundPreview);
  writePng(path.join(outDir, 'reference-inpaint-ground-candidate-padded.png'), inpaintGroundCandidate);
  writePng(path.join(outDir, 'reference-inpaint-ground-preview-full.png'), fullInpaintGroundPreview);
  const referencePreservedCurrentGroundBoxCandidate = buildReferencePreservedGeneratedCandidate(
    referenceCrop,
    currentGroundCrop,
    foregroundRemovalMask,
  );
  writePng(path.join(outDir, 'reference-preserved-current-ground-box-candidate-padded.png'), referencePreservedCurrentGroundBoxCandidate);
  writePng(
    path.join(outDir, 'reference-preserved-current-ground-box-preview-full.png'),
    buildFullGroundPreview(currentGround, referencePreservedCurrentGroundBoxCandidate, crop, zone, relativeObjects),
  );
  const referencePreservedCurrentGroundCandidate = buildReferencePreservedGeneratedCandidate(
    referenceCrop,
    currentGroundCrop,
    foregroundDiffRemovalMask,
  );
  writePng(path.join(outDir, 'reference-preserved-current-ground-candidate-padded.png'), referencePreservedCurrentGroundCandidate);
  writePng(
    path.join(outDir, 'reference-preserved-current-ground-preview-full.png'),
    buildFullGroundPreview(currentGround, referencePreservedCurrentGroundCandidate, crop, zone, relativeObjects),
  );
  writeGeneratedCandidatePreviewIfPresent(currentGround, referenceCrop, crop, zone, relativeObjects, foregroundDiffRemovalMask);
  writePng(path.join(outDir, 'annotated-roles.png'), buildAnnotatedReference(referenceCrop, relativeObjects));
  writePng(path.join(outDir, 'coverage-mask.png'), buildRoleMask(crop, relativeObjects, () => [255, 255, 255, 210]));
  writePng(path.join(outDir, 'composite-feather-mask.png'), buildCompositeFeatherMask(crop, zone, relativeObjects));
  writePng(path.join(outDir, 'edit-mask-remove-foreground.png'), alphaToGrayscaleImage(foregroundRemovalShapeMask, crop));
  writePng(path.join(outDir, 'edit-mask-remove-foreground-diff.png'), alphaToGrayscaleImage(foregroundDiffRemovalMask, crop));
  writePng(path.join(outDir, 'ground-authoring-mask.png'), buildRoleMask(
    crop,
    relativeObjects.filter((object) => (
      object.role === 'ground-baked'
      || object.role === 'blocking-ground'
      || object.role === 'decor-cluster'
    )),
    () => [255, 255, 255, 255],
  ));

  for (const role of Object.keys(roleColors)) {
    writePng(
      path.join(outDir, `role-mask-${role}.png`),
      buildRoleMask(crop, relativeObjects.filter((object) => object.role === role), () => roleColors[role]),
    );
  }

  writeGuide(manifest, zone, crop, relativeObjects);
  writePrompt(zone, crop, relativeObjects);
  console.log(`Built ${zoneId} ground workspace at ${path.relative(root, outDir)}`);
  console.log(`Crop: ${crop.x},${crop.y},${crop.width},${crop.height}`);
  console.log(`Objects: ${relativeObjects.length}`);
}

function paddedUnionCrop(boundsList, imageSize, extraPadding) {
  const union = boundsList.reduce((bounds, next) => ({
    x: Math.min(bounds.x, next.x),
    y: Math.min(bounds.y, next.y),
    right: Math.max(bounds.right, next.x + next.width),
    bottom: Math.max(bounds.bottom, next.y + next.height),
  }), {
    x: Number.POSITIVE_INFINITY,
    y: Number.POSITIVE_INFINITY,
    right: 0,
    bottom: 0,
  });

  const x = Math.max(0, Math.floor(union.x - extraPadding));
  const y = Math.max(0, Math.floor(union.y - extraPadding));
  const right = Math.min(imageSize.width, Math.ceil(union.right + extraPadding));
  const bottom = Math.min(imageSize.height, Math.ceil(union.bottom + extraPadding));
  return { x, y, width: right - x, height: bottom - y };
}

function relativeBounds(bounds, crop) {
  return {
    x: bounds.x - crop.x,
    y: bounds.y - crop.y,
    width: bounds.width,
    height: bounds.height,
  };
}

function relativeRemovalMask(removalMask, crop) {
  if (!isPolygonRemovalMask(removalMask)) return undefined;
  return {
    ...removalMask,
    points: removalMask.points.map((point) => ({
      x: point.x - crop.x,
      y: point.y - crop.y,
    })),
  };
}

function isPolygonRemovalMask(removalMask) {
  return removalMask?.kind === 'polygon'
    && Array.isArray(removalMask.points)
    && removalMask.points.length >= 3;
}

function buildAnnotatedReference(image, objects) {
  const annotated = cloneImage(image);
  for (const object of objects) {
    const color = roleColors[object.role] ?? [255, 255, 255, 144];
    fillRect(annotated, object.relativeBbox, color);
    drawRectOutline(annotated, object.relativeBbox, [255, 255, 255, 255], 2);
    if (isPolygonRemovalMask(object.relativeRemovalMask)) {
      fillPolygon(annotated, object.relativeRemovalMask.points, [255, 255, 255, 72]);
      drawPolygonOutline(annotated, object.relativeRemovalMask.points, [255, 255, 255, 255], 2);
    }
  }
  return annotated;
}

function buildRoleMask(crop, objects, colorForObject) {
  const image = {
    width: crop.width,
    height: crop.height,
    data: Buffer.alloc(crop.width * crop.height * 4),
  };
  for (const object of objects) {
    fillRect(image, object.relativeBbox, colorForObject(object));
  }
  return image;
}

function buildCompositeFeatherMask(crop, zone, objects) {
  if (zone.id === 'apex') return buildApexCompositeFeatherMask(crop, zone);

  const alpha = new Uint8Array(crop.width * crop.height);
  fillAlphaRect(alpha, crop, relativeBounds(zone.bbox, crop), 255, 28);
  for (const object of objects) {
    fillAlphaRect(alpha, crop, object.relativeBbox, 255, 28);
  }
  return alphaToGrayscaleImage(blurAlpha(alpha, crop.width, crop.height, 18, 2), crop);
}

function buildApexCompositeFeatherMask(crop, zone) {
  const alpha = new Uint8Array(crop.width * crop.height);
  fillAlphaRect(alpha, crop, relativeBounds(zone.bbox, crop), 255, 18);

  // Keep a little extra path context below Apex, but do not replace Gale's
  // roof/clouds or the center tree while those zones are not being regenerated.
  fillAlphaRect(alpha, crop, { x: 370 - crop.x, y: 390 - crop.y, width: 205, height: 116 }, 255, 16);
  subtractAlphaRect(alpha, crop, { x: 0 - crop.x, y: 488 - crop.y, width: 430, height: 160 }, 32);
  subtractAlphaRect(alpha, crop, { x: 560 - crop.x, y: 420 - crop.y, width: 330, height: 240 }, 30);

  // The koi pond is an Apex blocking-ground feature, so it must remain fully
  // inside the replacement even though nearby center/Gale context is excluded.
  fillAlphaRect(alpha, crop, { x: 506 - crop.x, y: 306 - crop.y, width: 230, height: 124 }, 255, 20);

  return alphaToGrayscaleImage(blurAlpha(alpha, crop.width, crop.height, 18, 2), crop);
}

function alphaToGrayscaleImage(alpha, imageSize) {
  const data = Buffer.alloc(imageSize.width * imageSize.height * 4);
  for (let index = 0; index < alpha.length; index += 1) {
    const value = alpha[index];
    const offset = index * 4;
    data[offset] = value;
    data[offset + 1] = value;
    data[offset + 2] = value;
    data[offset + 3] = 255;
  }
  return { width: imageSize.width, height: imageSize.height, data };
}

function buildGroundCandidate(currentGroundCrop, referenceCrop, crop, objects) {
  const alpha = new Uint8Array(crop.width * crop.height);
  for (const object of objects) {
    fillAlphaRect(alpha, crop, object.relativeBbox, 255, 3);
  }
  const softenedAlpha = blurAlpha(alpha, crop.width, crop.height, 2, 1);
  return blendImages(currentGroundCrop, referenceCrop, softenedAlpha);
}

function buildReferenceInpaintGroundCandidate(referenceCrop, crop, foregroundObjects) {
  const mask = buildForegroundRemovalAlpha(crop, foregroundObjects, 2, 0);
  return inpaintMaskedPixels(referenceCrop, mask);
}

function buildForegroundRemovalAlpha(crop, foregroundObjects, extraPadding = 3, blurRadius = 4) {
  const alpha = new Uint8Array(crop.width * crop.height);
  for (const object of foregroundObjects) {
    if (isPolygonRemovalMask(object.relativeRemovalMask)) {
      fillAlphaPolygonWithPadding(alpha, crop, object.relativeRemovalMask.points, 255, extraPadding);
    } else {
      fillAlphaRect(alpha, crop, object.relativeBbox, 255, extraPadding);
    }
  }
  return blurRadius > 0 ? blurAlpha(alpha, crop.width, crop.height, blurRadius, 1) : alpha;
}

function buildForegroundDiffRemovalAlpha(referenceCrop, currentGroundCrop, crop, foregroundObjects) {
  const diffAlpha = new Uint8Array(crop.width * crop.height);
  const manualAlpha = new Uint8Array(crop.width * crop.height);
  const strongThreshold = 48;
  const softThreshold = 24;

  for (const object of foregroundObjects) {
    if (isPolygonRemovalMask(object.relativeRemovalMask)) {
      fillAlphaPolygonWithPadding(manualAlpha, crop, object.relativeRemovalMask.points, 255, 2);
      continue;
    }

    const bounds = paddedBounds(object.relativeBbox, crop, 4);
    for (let y = bounds.top; y < bounds.bottom; y += 1) {
      for (let x = bounds.left; x < bounds.right; x += 1) {
        const index = (y * crop.width) + x;
        const offset = index * 4;
        const redDiff = Math.abs(referenceCrop.data[offset] - currentGroundCrop.data[offset]);
        const greenDiff = Math.abs(referenceCrop.data[offset + 1] - currentGroundCrop.data[offset + 1]);
        const blueDiff = Math.abs(referenceCrop.data[offset + 2] - currentGroundCrop.data[offset + 2]);
        const maxDiff = Math.max(redDiff, greenDiff, blueDiff);
        const colorDiff = (redDiff + greenDiff + blueDiff) / 3;
        const lumaDiff = Math.abs(lumaAt(referenceCrop.data, offset) - lumaAt(currentGroundCrop.data, offset));
        const score = Math.max(maxDiff, colorDiff * 1.25, lumaDiff * 1.1);

        if (score >= strongThreshold) {
          diffAlpha[index] = 255;
        } else if (score >= softThreshold) {
          diffAlpha[index] = Math.max(
            diffAlpha[index],
            Math.round(((score - softThreshold) / (strongThreshold - softThreshold)) * 190),
          );
        }
      }
    }
  }

  const expandedDiff = dilateAlpha(diffAlpha, crop.width, crop.height, 2);
  maxAlphaInto(expandedDiff, manualAlpha);
  return blurAlpha(expandedDiff, crop.width, crop.height, 2, 1);
}

function paddedBounds(bounds, imageSize, padding) {
  return {
    left: Math.max(0, Math.floor(bounds.x - padding)),
    top: Math.max(0, Math.floor(bounds.y - padding)),
    right: Math.min(imageSize.width, Math.ceil(bounds.x + bounds.width + padding)),
    bottom: Math.min(imageSize.height, Math.ceil(bounds.y + bounds.height + padding)),
  };
}

function lumaAt(data, offset) {
  return (0.2126 * data[offset]) + (0.7152 * data[offset + 1]) + (0.0722 * data[offset + 2]);
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

function buildReferencePreservedGeneratedCandidate(referenceCrop, generatedCandidate, foregroundRemovalMask) {
  return blendImages(referenceCrop, generatedCandidate, foregroundRemovalMask);
}

function writeGeneratedCandidatePreviewIfPresent(currentGround, referenceCrop, crop, zone, objects, foregroundRemovalMask) {
  const candidatePath = path.join(outDir, 'generated-ground-candidate-padded.png');
  if (!fs.existsSync(candidatePath)) return;

  const candidate = readPng(candidatePath);
  if (candidate.width !== crop.width || candidate.height !== crop.height) {
    throw new Error(`generated-ground-candidate-padded.png must be ${crop.width}x${crop.height}`);
  }

  writePng(
    path.join(outDir, 'generated-ground-preview-full.png'),
    buildFullGroundPreview(currentGround, candidate, crop, zone, objects),
  );

  const referencePreservedCandidate = buildReferencePreservedGeneratedCandidate(referenceCrop, candidate, foregroundRemovalMask);
  writePng(path.join(outDir, 'reference-preserved-generated-candidate-padded.png'), referencePreservedCandidate);
  writePng(
    path.join(outDir, 'reference-preserved-generated-preview-full.png'),
    buildFullGroundPreview(currentGround, referencePreservedCandidate, crop, zone, objects),
  );
}

function inpaintMaskedPixels(source, mask) {
  const output = cloneImage(source);
  const width = source.width;
  const height = source.height;
  const filled = new Uint8Array(mask.length);
  const queue = [];
  let cursor = 0;

  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index] === 0) filled[index] = 1;
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width) + x;
      if (filled[index] || !hasFilledNeighbor(filled, width, height, x, y)) continue;
      queue.push(index);
    }
  }

  while (cursor < queue.length) {
    const index = queue[cursor];
    cursor += 1;
    if (filled[index]) continue;

    const x = index % width;
    const y = Math.floor(index / width);
    const color = averageFilledNeighborColor(output, filled, width, height, x, y);
    if (!color) {
      queue.push(index);
      continue;
    }

    const offset = index * 4;
    output.data[offset] = color[0];
    output.data[offset + 1] = color[1];
    output.data[offset + 2] = color[2];
    output.data[offset + 3] = 255;
    filled[index] = 1;

    for (const [nextX, nextY] of neighborPoints(x, y)) {
      if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) continue;
      const nextIndex = (nextY * width) + nextX;
      if (!filled[nextIndex]) queue.push(nextIndex);
    }
  }

  smoothMaskedPixels(output, mask, 2);
  return output;
}

function hasFilledNeighbor(filled, width, height, x, y) {
  return neighborPoints(x, y).some(([nextX, nextY]) => (
    nextX >= 0
    && nextY >= 0
    && nextX < width
    && nextY < height
    && filled[(nextY * width) + nextX]
  ));
}

function averageFilledNeighborColor(image, filled, width, height, x, y) {
  let red = 0;
  let green = 0;
  let blue = 0;
  let count = 0;
  for (const [nextX, nextY] of neighborPoints(x, y)) {
    if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) continue;
    const index = (nextY * width) + nextX;
    if (!filled[index]) continue;
    const offset = index * 4;
    red += image.data[offset];
    green += image.data[offset + 1];
    blue += image.data[offset + 2];
    count += 1;
  }
  if (count === 0) return null;
  return [
    Math.round(red / count),
    Math.round(green / count),
    Math.round(blue / count),
  ];
}

function smoothMaskedPixels(image, mask, passes) {
  for (let pass = 0; pass < passes; pass += 1) {
    const snapshot = Buffer.from(image.data);
    for (let y = 0; y < image.height; y += 1) {
      for (let x = 0; x < image.width; x += 1) {
        const index = (y * image.width) + x;
        if (mask[index] === 0) continue;
        let red = 0;
        let green = 0;
        let blue = 0;
        let count = 0;
        for (let sampleY = Math.max(0, y - 1); sampleY <= Math.min(image.height - 1, y + 1); sampleY += 1) {
          for (let sampleX = Math.max(0, x - 1); sampleX <= Math.min(image.width - 1, x + 1); sampleX += 1) {
            const offset = ((sampleY * image.width) + sampleX) * 4;
            red += snapshot[offset];
            green += snapshot[offset + 1];
            blue += snapshot[offset + 2];
            count += 1;
          }
        }
        const offset = index * 4;
        image.data[offset] = Math.round(red / count);
        image.data[offset + 1] = Math.round(green / count);
        image.data[offset + 2] = Math.round(blue / count);
      }
    }
  }
}

function neighborPoints(x, y) {
  return [
    [x - 1, y],
    [x + 1, y],
    [x, y - 1],
    [x, y + 1],
  ];
}

function buildFullGroundPreview(currentGround, candidateCrop, crop, zone, objects) {
  const preview = cloneImage(currentGround);
  const cropAlpha = extractGrayscaleAlpha(buildCompositeFeatherMask(crop, zone, objects));

  for (let y = 0; y < crop.height; y += 1) {
    for (let x = 0; x < crop.width; x += 1) {
      const sourceOffset = ((y * crop.width) + x) * 4;
      const targetOffset = ((((crop.y + y) * preview.width) + crop.x + x) * 4);
      const alpha = cropAlpha[(y * crop.width) + x] / 255;
      if (alpha <= 0) continue;
      preview.data[targetOffset] = Math.round(candidateCrop.data[sourceOffset] * alpha + preview.data[targetOffset] * (1 - alpha));
      preview.data[targetOffset + 1] = Math.round(candidateCrop.data[sourceOffset + 1] * alpha + preview.data[targetOffset + 1] * (1 - alpha));
      preview.data[targetOffset + 2] = Math.round(candidateCrop.data[sourceOffset + 2] * alpha + preview.data[targetOffset + 2] * (1 - alpha));
      preview.data[targetOffset + 3] = 255;
    }
  }

  return preview;
}

function blendImages(base, overlay, alpha) {
  const data = Buffer.alloc(base.data.length);
  for (let index = 0; index < alpha.length; index += 1) {
    const offset = index * 4;
    const overlayAlpha = alpha[index] / 255;
    data[offset] = Math.round(overlay.data[offset] * overlayAlpha + base.data[offset] * (1 - overlayAlpha));
    data[offset + 1] = Math.round(overlay.data[offset + 1] * overlayAlpha + base.data[offset + 1] * (1 - overlayAlpha));
    data[offset + 2] = Math.round(overlay.data[offset + 2] * overlayAlpha + base.data[offset + 2] * (1 - overlayAlpha));
    data[offset + 3] = 255;
  }
  return { width: base.width, height: base.height, data };
}

function extractGrayscaleAlpha(mask) {
  const alpha = new Uint8Array(mask.width * mask.height);
  for (let index = 0; index < alpha.length; index += 1) {
    alpha[index] = mask.data[index * 4];
  }
  return alpha;
}

function fillAlphaPolygonWithPadding(alpha, imageSize, points, value, extraPadding) {
  const objectAlpha = new Uint8Array(alpha.length);
  fillAlphaPolygon(objectAlpha, imageSize, points, value);
  const paddedAlpha = extraPadding > 0
    ? dilateAlpha(objectAlpha, imageSize.width, imageSize.height, extraPadding)
    : objectAlpha;
  maxAlphaInto(alpha, paddedAlpha);
}

function fillAlphaPolygon(alpha, imageSize, points, value) {
  if (points.length < 3) return;
  const minY = Math.max(0, Math.floor(Math.min(...points.map((point) => point.y))));
  const maxY = Math.min(imageSize.height - 1, Math.ceil(Math.max(...points.map((point) => point.y))));

  for (let y = minY; y <= maxY; y += 1) {
    const scanY = y + 0.5;
    const intersections = [];

    for (let index = 0; index < points.length; index += 1) {
      const start = points[index];
      const end = points[(index + 1) % points.length];
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

function maxAlphaInto(target, source) {
  for (let index = 0; index < target.length; index += 1) {
    target[index] = Math.max(target[index], source[index]);
  }
}

function fillAlphaRect(alpha, imageSize, bounds, value, extraPadding) {
  const left = Math.max(0, Math.floor(bounds.x - extraPadding));
  const top = Math.max(0, Math.floor(bounds.y - extraPadding));
  const right = Math.min(imageSize.width, Math.ceil(bounds.x + bounds.width + extraPadding));
  const bottom = Math.min(imageSize.height, Math.ceil(bounds.y + bounds.height + extraPadding));

  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      alpha[(y * imageSize.width) + x] = value;
    }
  }
}

function subtractAlphaRect(alpha, imageSize, bounds, extraPadding) {
  fillAlphaRect(alpha, imageSize, bounds, 0, extraPadding);
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

function writeGuide(manifest, zone, crop, objects) {
  const byRole = {};
  for (const object of objects) {
    byRole[object.role] = (byRole[object.role] ?? 0) + 1;
  }

  const guide = {
    schemaVersion: 1,
    zone: {
      id: zone.id,
      label: zone.label,
      sourceBbox: zone.bbox,
      paddedCrop: crop,
      padding,
    },
    sourceImages: {
      reference: '/world-v2/layers/reference.png',
      currentGround: '/world-v2/layers/ground.png',
    },
    outputs: {
      referencePadded: `${workspacePublicRoot}/reference-padded.png`,
      currentGroundPadded: `${workspacePublicRoot}/current-ground-padded.png`,
      labelDrivenGroundCandidate: `${workspacePublicRoot}/label-driven-ground-candidate-padded.png`,
      labelDrivenGroundPreviewFull: `${workspacePublicRoot}/label-driven-ground-preview-full.png`,
      referenceInpaintGroundCandidate: `${workspacePublicRoot}/reference-inpaint-ground-candidate-padded.png`,
      referenceInpaintGroundPreviewFull: `${workspacePublicRoot}/reference-inpaint-ground-preview-full.png`,
      referencePreservedCurrentGroundCandidate: `${workspacePublicRoot}/reference-preserved-current-ground-candidate-padded.png`,
      referencePreservedCurrentGroundPreviewFull: `${workspacePublicRoot}/reference-preserved-current-ground-preview-full.png`,
      referencePreservedCurrentGroundBoxCandidate: `${workspacePublicRoot}/reference-preserved-current-ground-box-candidate-padded.png`,
      referencePreservedCurrentGroundBoxPreviewFull: `${workspacePublicRoot}/reference-preserved-current-ground-box-preview-full.png`,
      referencePreservedGeneratedCandidate: `${workspacePublicRoot}/reference-preserved-generated-candidate-padded.png`,
      referencePreservedGeneratedPreviewFull: `${workspacePublicRoot}/reference-preserved-generated-preview-full.png`,
      generatedGroundCandidate: `${workspacePublicRoot}/generated-ground-candidate-padded.png`,
      generatedGroundPreviewFull: `${workspacePublicRoot}/generated-ground-preview-full.png`,
      annotatedRoles: `${workspacePublicRoot}/annotated-roles.png`,
      compositeFeatherMask: `${workspacePublicRoot}/composite-feather-mask.png`,
      foregroundRemovalMask: `${workspacePublicRoot}/edit-mask-remove-foreground.png`,
      foregroundDiffRemovalMask: `${workspacePublicRoot}/edit-mask-remove-foreground-diff.png`,
      groundAuthoringMask: `${workspacePublicRoot}/ground-authoring-mask.png`,
    },
    roleCounts: byRole,
    regenerationPolicy: {
      groundBaked: 'Keep or rebuild as part of the base terrain.',
      blockingGround: 'Keep visually in the base terrain and keep non-walkable in collision data.',
      decorCluster: 'Use as density anchors. These can be baked into the ground unless promoted later.',
      occluder: 'Remove from the ground crop where actors can pass in front/behind; regenerate as foreground sprites.',
      interactive: 'Keep as base/gameplay metadata unless occlusion.required is true; only occlusion-required interactives become separate foreground sprites.',
      unlabeledPixels: 'Infer from the flat reference as normal visual ground detail. Do not invent collision from unlabeled pixels.',
      zoneBoundary: 'Use the padded crop for generation, then composite back with an irregular/feathered ground mask.',
    },
    objects: objects.map((object) => ({
      id: object.id,
      label: object.label,
      role: object.role,
      category: object.category,
      sourceBbox: object.bbox,
      relativeBbox: object.relativeBbox,
      removalMask: object.removalMask,
      relativeRemovalMask: object.relativeRemovalMask,
      collision: object.collision,
      occlusion: object.occlusion,
      depthY: object.depthY,
      notes: object.notes,
    })),
    manifestSource: {
      path: '/world-v2/maps/world-v2-object-manifest.json',
      objectCount: manifest.objects.length,
    },
  };

  fs.writeFileSync(path.join(outDir, 'generation-guide.json'), `${JSON.stringify(guide, null, 2)}\n`);
}

function writePrompt(zone, crop, objects) {
  const roleLines = Object.entries(groupByRole(objects))
    .map(([role, roleObjects]) => `- ${role}: ${roleObjects.length} boxes`)
    .join('\n');
  const blockerNames = objects
    .filter((object) => object.role === 'blocking-ground')
    .map((object) => object.id)
    .join(', ');
  const foregroundNames = objects
    .filter((object) => requiresForegroundOcclusion(object))
    .map((object) => object.id)
    .join(', ');

  fs.writeFileSync(path.join(outDir, 'prompt.md'), `# ${zone.label} Ground Regeneration Prompt

Use \`reference-padded.png\` as the visual target for this padded crop:

- source crop: x=${crop.x}, y=${crop.y}, width=${crop.width}, height=${crop.height}
- maintain pixel-art/isometric style, prop density, path shapes, terrain colors, shadows, and tiny ground details from the reference
- do not create a visible rectangular edge; this crop will be composited back with a non-rectangular blend mask

Role coverage:

${roleLines}

Ground output rules:

- Keep ground-baked terrain and unlabeled path/grass/detail as base map pixels.
- Keep blocking-ground visuals in the ground layer, but they remain non-walkable later.
- Remove or paint behind occluders and occlusion-required interactive foreground objects where actors can walk in front of them.
- Do not remove the broad upper cherry/background blocked area just because it is non-walkable; it can stay visually baked into the scene.
- Do not invent new collision or new large props outside the labeled structure.

Blocking-ground anchors:

${blockerNames}

Foreground objects to keep separate from final ground where possible:

${foregroundNames}
`);
}

function groupByRole(objects) {
  return objects.reduce((groups, object) => {
    groups[object.role] = [...(groups[object.role] ?? []), object];
    return groups;
  }, {});
}

function requiresForegroundOcclusion(object) {
  return object.role === 'occluder' || (object.role === 'interactive' && object.occlusion?.required === true);
}

function cropImage(source, crop) {
  const data = Buffer.alloc(crop.width * crop.height * 4);
  for (let y = 0; y < crop.height; y += 1) {
    const sourceStart = (((crop.y + y) * source.width) + crop.x) * 4;
    const targetStart = y * crop.width * 4;
    source.data.copy(data, targetStart, sourceStart, sourceStart + crop.width * 4);
  }
  return { width: crop.width, height: crop.height, data };
}

function cloneImage(image) {
  return {
    width: image.width,
    height: image.height,
    data: Buffer.from(image.data),
  };
}

function fillPolygon(image, points, color) {
  const alpha = new Uint8Array(image.width * image.height);
  fillAlphaPolygon(alpha, image, points, 255);
  for (let index = 0; index < alpha.length; index += 1) {
    if (alpha[index] === 0) continue;
    blendPixel(image, index, color);
  }
}

function drawPolygonOutline(image, points, color, stroke) {
  if (points.length < 2) return;
  for (let index = 0; index < points.length; index += 1) {
    const start = points[index];
    const end = points[(index + 1) % points.length];
    drawLine(image, start, end, color, stroke);
  }
}

function drawLine(image, start, end, color, stroke) {
  const steps = Math.max(Math.abs(end.x - start.x), Math.abs(end.y - start.y), 1);
  const radius = Math.max(0, Math.floor(stroke / 2));
  for (let step = 0; step <= steps; step += 1) {
    const ratio = step / steps;
    const centerX = Math.round(start.x + (end.x - start.x) * ratio);
    const centerY = Math.round(start.y + (end.y - start.y) * ratio);
    for (let y = centerY - radius; y <= centerY + radius; y += 1) {
      for (let x = centerX - radius; x <= centerX + radius; x += 1) {
        if (x < 0 || y < 0 || x >= image.width || y >= image.height) continue;
        blendPixel(image, (y * image.width) + x, color);
      }
    }
  }
}

function fillRect(image, bounds, color) {
  const left = Math.max(0, Math.floor(bounds.x));
  const top = Math.max(0, Math.floor(bounds.y));
  const right = Math.min(image.width, Math.ceil(bounds.x + bounds.width));
  const bottom = Math.min(image.height, Math.ceil(bounds.y + bounds.height));

  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      blendPixel(image, (y * image.width) + x, color);
    }
  }
}

function blendPixel(image, pixelIndex, color) {
  const [r, g, b, alpha] = color;
  const offset = pixelIndex * 4;
  const existingAlpha = image.data[offset + 3] / 255;
  const overlayAlpha = alpha / 255;
  const outAlpha = overlayAlpha + existingAlpha * (1 - overlayAlpha);
  image.data[offset] = Math.round(((r * overlayAlpha) + image.data[offset] * existingAlpha * (1 - overlayAlpha)) / outAlpha);
  image.data[offset + 1] = Math.round(((g * overlayAlpha) + image.data[offset + 1] * existingAlpha * (1 - overlayAlpha)) / outAlpha);
  image.data[offset + 2] = Math.round(((b * overlayAlpha) + image.data[offset + 2] * existingAlpha * (1 - overlayAlpha)) / outAlpha);
  image.data[offset + 3] = Math.round(outAlpha * 255);
}

function drawRectOutline(image, bounds, color, stroke) {
  fillRect(image, { x: bounds.x, y: bounds.y, width: bounds.width, height: stroke }, color);
  fillRect(image, { x: bounds.x, y: bounds.y + bounds.height - stroke, width: bounds.width, height: stroke }, color);
  fillRect(image, { x: bounds.x, y: bounds.y, width: stroke, height: bounds.height }, color);
  fillRect(image, { x: bounds.x + bounds.width - stroke, y: bounds.y, width: stroke, height: bounds.height }, color);
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

main();
