import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(root, 'private/world-v2/actors/generated/meridian-character-concept-gpt-v1.png');
const helperWalkSourcePath = path.join(root, 'private/world-v2/actors/walk/raw/meridian-helper-idle-walk-source-gpt-v1.png');
const meridianUpWalkSourcePath = path.join(root, 'private/world-v2/actors/generated/meridian-idle-up-walk-source-gpt-v1.png');
const actorDir = path.join(root, 'public/world-v2/actors');
const walkDir = path.join(actorDir, 'walk');
const frameWidth = 96;
const frameHeight = 112;
const columns = 6;
const rows = 4;
const directionRows = {
  down: 0,
  left: 1,
  right: 2,
  up: 3,
};
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const crcTable = new Uint32Array(256).map((_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

const sourceProfiles = [
  { slug: 'meridian-idle', targetWidth: 63, targetHeight: 102, bottomPadding: 5 },
  { slug: 'meridian-helper-idle', targetWidth: 61, targetHeight: 98, bottomPadding: 6 },
  { slug: 'meridian-helper-orb', targetWidth: 70, targetHeight: 100, bottomPadding: 5 },
  { slug: 'meridian-helper-scroll', targetWidth: 70, targetHeight: 100, bottomPadding: 5 },
];

const outputProfiles = [
  { slug: 'meridian-idle' },
  { slug: 'meridian-helper-idle' },
  { slug: 'meridian-helper-orb' },
  { slug: 'meridian-helper-scroll' },
];

function main() {
  const source = readPng(sourcePath);
  const bounds = detectCharacterBounds(source);
  if (bounds.length < sourceProfiles.length) {
    throw new Error(`Expected at least ${sourceProfiles.length} characters in ${sourcePath}, found ${bounds.length}`);
  }

  fs.mkdirSync(actorDir, { recursive: true });
  fs.mkdirSync(walkDir, { recursive: true });

  const sourceFrames = sourceProfiles.map((profile, index) => {
    const frame = fitSourceToFrame(source, bounds[index], profile);
    removeSmallAlphaComponents(frame);
    return frame;
  });

  const helperWalk = fs.existsSync(helperWalkSourcePath)
    ? processGeneratedWalkSource(helperWalkSourcePath, { targetWidth: 68, targetHeight: 98, bottomPadding: 6 })
    : null;
  const meridianFrame = sourceFrames[0];
  const hoodedHelper = helperWalk?.firstFrame ?? sourceFrames[1];
  const frames = new Map([
    ['meridian-idle', meridianFrame],
    ['meridian-helper-idle', hoodedHelper],
    ['meridian-helper-orb', buildHoodedHelperActionFrame(hoodedHelper, sourceFrames[2], 'orb')],
    ['meridian-helper-scroll', buildHoodedHelperActionFrame(hoodedHelper, sourceFrames[3], 'scroll')],
  ]);
  const walkSheets = new Map();
  if (helperWalk) {
    mirrorWalkSheetRow(helperWalk.sheet, directionRows.left, directionRows.right);
    walkSheets.set('meridian-helper-idle', helperWalk.sheet);
    const orbWalkSheet = buildHoodedHelperActionWalkSheet(helperWalk.sheet, sourceFrames[2], 'orb');
    const scrollWalkSheet = buildHoodedHelperActionWalkSheet(helperWalk.sheet, sourceFrames[3], 'scroll');
    mirrorWalkSheetRow(orbWalkSheet, directionRows.left, directionRows.right);
    mirrorWalkSheetRow(scrollWalkSheet, directionRows.left, directionRows.right);
    walkSheets.set('meridian-helper-orb', orbWalkSheet);
    walkSheets.set('meridian-helper-scroll', scrollWalkSheet);
  }

  for (const profile of outputProfiles) {
    const frame = frames.get(profile.slug);
    if (!frame) throw new Error(`Missing generated frame for ${profile.slug}`);
    const sheet = walkSheets.get(profile.slug) ?? buildWalkSheet(frame, profile);
    if (profile.slug === 'meridian-idle' && fs.existsSync(meridianUpWalkSourcePath)) {
      replaceWalkSheetRowFromSource(sheet, meridianUpWalkSourcePath, directionRows.up, {
        targetWidth: 77,
        targetHeight: 103,
        bottomPadding: 5,
      });
    }
    writePng(path.join(actorDir, `${profile.slug}.png`), frame);
    writePng(path.join(walkDir, `${profile.slug}-walk.png`), sheet);
    console.log(`wrote ${profile.slug}.png and ${profile.slug}-walk.png`);
  }

  writePng(path.join(actorDir, 'meridian-channel.png'), buildQiActionFrame(meridianFrame, 'channel'));
  writePng(path.join(actorDir, 'meridian-palm.png'), buildQiActionFrame(meridianFrame, 'palm'));
  console.log('wrote meridian-channel.png and meridian-palm.png');
}

function detectCharacterBounds(image) {
  const columnCounts = Array.from({ length: image.width }, () => 0);
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (isForeground(image, x, y)) columnCounts[x] += 1;
    }
  }

  const smoothed = columnCounts.map((_, x) => {
    let total = 0;
    let count = 0;
    for (let sx = Math.max(0, x - 8); sx <= Math.min(image.width - 1, x + 8); sx += 1) {
      total += columnCounts[sx];
      count += 1;
    }
    return total / count;
  });

  const threshold = Math.max(8, Math.round(image.height * 0.012));
  const runs = [];
  let runStart = null;
  for (let x = 0; x < smoothed.length; x += 1) {
    if (smoothed[x] >= threshold && runStart === null) {
      runStart = x;
    } else if ((smoothed[x] < threshold || x === smoothed.length - 1) && runStart !== null) {
      const runEnd = smoothed[x] < threshold ? x - 1 : x;
      if (runEnd - runStart > 24) runs.push({ start: runStart, end: runEnd });
      runStart = null;
    }
  }

  const mergedRuns = [];
  for (const run of runs) {
    const previous = mergedRuns[mergedRuns.length - 1];
    if (previous && run.start - previous.end < 72) {
      previous.end = run.end;
    } else {
      mergedRuns.push({ ...run });
    }
  }

  return mergedRuns
    .map((run) => foregroundBounds(image, {
      x: Math.max(0, run.start - 24),
      y: 0,
      width: Math.min(image.width, run.end + 25) - Math.max(0, run.start - 24),
      height: image.height,
    }))
    .filter(Boolean)
    .sort((left, right) => left.x - right.x)
    .slice(0, sourceProfiles.length);
}

function foregroundBounds(image, rect) {
  let minX = rect.x + rect.width;
  let minY = rect.y + rect.height;
  let maxX = rect.x - 1;
  let maxY = rect.y - 1;

  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      if (!isForeground(image, x, y)) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) return null;
  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

function fitSourceToFrame(source, bounds, profile) {
  const frame = emptyImage(frameWidth, frameHeight);
  const paddingX = Math.max(14, Math.round(bounds.width * 0.05));
  const paddingY = Math.max(14, Math.round(bounds.height * 0.05));
  const crop = {
    x: Math.max(0, bounds.x - paddingX),
    y: Math.max(0, bounds.y - paddingY),
    width: Math.min(source.width, bounds.x + bounds.width + paddingX) - Math.max(0, bounds.x - paddingX),
    height: Math.min(source.height, bounds.y + bounds.height + paddingY) - Math.max(0, bounds.y - paddingY),
  };
  const scale = Math.min(profile.targetWidth / bounds.width, profile.targetHeight / bounds.height);
  const sourceCenterX = bounds.x + (bounds.width / 2) - crop.x;
  const sourceBottom = bounds.y + bounds.height - crop.y;
  const destX = Math.round((frameWidth / 2) - (sourceCenterX * scale));
  const destY = Math.round(frameHeight - profile.bottomPadding - (sourceBottom * scale));
  drawScaledConcept(frame, source, crop, destX, destY, scale);
  return frame;
}

function buildWalkSheet(baseFrame, profile) {
  const sheet = emptyImage(frameWidth * columns, frameHeight * rows);
  const backFrame = profile.slug === 'meridian-idle' ? buildMeridianBackFrame(baseFrame) : null;
  const steps = [
    { dx: -1, dy: 0, sx: 1.00, sy: 1.00, phase: 0 },
    { dx: 0, dy: -3, sx: 0.98, sy: 1.03, phase: Math.PI / 3 },
    { dx: 1, dy: 0, sx: 1.00, sy: 1.00, phase: (Math.PI * 2) / 3 },
    { dx: 0, dy: -1, sx: 1.03, sy: 0.98, phase: Math.PI },
    { dx: -1, dy: 0, sx: 1.00, sy: 1.00, phase: (Math.PI * 4) / 3 },
    { dx: 0, dy: -3, sx: 0.98, sy: 1.03, phase: (Math.PI * 5) / 3 },
  ];
  const directions = [
    { squeeze: 1, flip: false, tint: 1, dy: 0, stride: 4.2, frame: baseFrame },
    { squeeze: profile.slug === 'meridian-idle' ? 0.92 : 0.8, flip: false, tint: 0.98, dy: 0, stride: 3.4, frame: baseFrame },
    { squeeze: profile.slug === 'meridian-idle' ? 0.92 : 0.8, flip: true, tint: 0.98, dy: 0, stride: 3.4, frame: baseFrame },
    { squeeze: profile.slug === 'meridian-idle' ? 0.98 : 0.9, flip: false, tint: profile.slug === 'meridian-idle' ? 0.96 : 0.78, dy: -1, stride: 3.2, frame: backFrame ?? baseFrame },
  ];

  directions.forEach((direction, row) => {
    steps.forEach((step, column) => {
      const cell = transformFrame(direction.frame, {
        dx: step.dx * (row === 0 ? 1 : 0.7),
        dy: step.dy + direction.dy,
        scaleX: step.sx * direction.squeeze,
        scaleY: step.sy,
        flipX: direction.flip,
        tint: direction.tint,
        walkPhase: step.phase,
        stride: direction.stride,
      });
      pasteImage(sheet, cell, column * frameWidth, row * frameHeight);
    });
  });

  return sheet;
}

function replaceWalkSheetRowFromSource(sheet, sourceFilePath, row, profile) {
  const source = readPng(sourceFilePath);
  for (let column = 0; column < columns; column += 1) {
    const cell = sourceRowCell(source, column);
    const bounds = foregroundBounds(source, cell);
    if (!bounds) throw new Error(`Could not find foreground for ${sourceFilePath} column ${column + 1}`);
    const frame = fitSourceToFrame(source, bounds, profile);
    removeSmallAlphaComponents(frame);
    removeDetachedBelowPrimary(frame);
    pasteImage(sheet, frame, column * frameWidth, row * frameHeight);
  }
}

function mirrorWalkSheetRow(sheet, sourceRow, targetRow) {
  for (let column = 0; column < columns; column += 1) {
    const sourceFrame = cropImage(sheet, column * frameWidth, sourceRow * frameHeight, frameWidth, frameHeight);
    const mirrored = mirrorFrame(sourceFrame);
    pasteImage(sheet, mirrored, column * frameWidth, targetRow * frameHeight);
  }
}

function mirrorFrame(source) {
  const mirrored = emptyImage(source.width, source.height);
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const sourceOffset = ((y * source.width) + x) * 4;
      const targetOffset = ((y * source.width) + (source.width - 1 - x)) * 4;
      source.data.copy(mirrored.data, targetOffset, sourceOffset, sourceOffset + 4);
    }
  }
  return mirrored;
}

function sourceRowCell(image, column) {
  const x1 = Math.floor((image.width * column) / columns);
  const x2 = Math.floor((image.width * (column + 1)) / columns);
  return { x: x1, y: 0, width: x2 - x1, height: image.height };
}

function buildMeridianBackFrame(frontFrame) {
  const frame = cloneImage(frontFrame);
  const bounds = alphaBounds(frame);
  if (!bounds) return frame;

  const cx = bounds.x + (bounds.width / 2);
  const headCy = bounds.y + (bounds.height * 0.29);
  const rx = bounds.width * 0.36;
  const ry = bounds.height * 0.27;

  for (let y = Math.floor(headCy - ry); y <= Math.ceil(headCy + ry); y += 1) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += 1) {
      if (x < 0 || x >= frame.width || y < 0 || y >= frame.height) continue;
      const normalizedX = (x - cx) / rx;
      const normalizedY = (y - headCy) / ry;
      if ((normalizedX * normalizedX) + (normalizedY * normalizedY) > 1.08) continue;

      const offset = ((y * frame.width) + x) * 4;
      if (frame.data[offset + 3] <= 12) continue;
      const pixel = pixelAt(frame, x, y);
      if (isMeridianGoldPixel(pixel)) continue;

      const topLight = Math.max(0, Math.min(1, 1 - ((y - (headCy - ry)) / (ry * 2))));
      const sideShadow = Math.max(0, Math.min(1, Math.abs(normalizedX)));
      frame.data[offset] = clampByte(13 + (topLight * 34) - (sideShadow * 6));
      frame.data[offset + 1] = clampByte(76 + (topLight * 60) - (sideShadow * 18));
      frame.data[offset + 2] = clampByte(76 + (topLight * 58) - (sideShadow * 14));
    }
  }

  const torsoTop = bounds.y + (bounds.height * 0.47);
  const torsoBottom = bounds.y + (bounds.height * 0.82);
  for (let y = Math.floor(torsoTop); y <= Math.ceil(torsoBottom); y += 1) {
    const progress = Math.max(0, Math.min(1, (y - torsoTop) / (torsoBottom - torsoTop)));
    const torsoRx = bounds.width * (0.18 + (progress * 0.08));
    for (let x = Math.floor(cx - torsoRx); x <= Math.ceil(cx + torsoRx); x += 1) {
      if (x < 0 || x >= frame.width || y < 0 || y >= frame.height) continue;
      const offset = ((y * frame.width) + x) * 4;
      if (frame.data[offset + 3] <= 12) continue;
      const pixel = pixelAt(frame, x, y);
      if (isMeridianGoldPixel(pixel)) continue;
      const shade = Math.max(0, Math.min(1, (pixel.r + pixel.g + pixel.b) / 680));
      frame.data[offset] = clampByte(16 + (shade * 18));
      frame.data[offset + 1] = clampByte(70 + (shade * 64));
      frame.data[offset + 2] = clampByte(62 + (shade * 56));
    }
  }

  drawThickLine(frame, cx - 10, headCy - 18, cx - 14, headCy + 18, 2.2, 0x0b4744, 155);
  drawThickLine(frame, cx, headCy - 20, cx - 1, headCy + 24, 2.6, 0x0a3939, 140);
  drawThickLine(frame, cx + 11, headCy - 17, cx + 15, headCy + 17, 2.2, 0x1e6f66, 135);
  drawThickLine(frame, cx - 17, headCy + 5, cx + 17, headCy + 3, 2.3, 0x08292c, 120);
  drawThickLine(frame, cx, bounds.y + (bounds.height * 0.47), cx, bounds.y + (bounds.height * 0.78), 2.2, 0x0f5148, 105);
  drawThickLine(frame, cx - 10, bounds.y + (bounds.height * 0.58), cx + 10, bounds.y + (bounds.height * 0.58), 2.1, 0xd5a84c, 105);

  return frame;
}

function isMeridianGoldPixel(pixel) {
  return pixel.r > 126 && pixel.g > 86 && pixel.b < 70 && pixel.r >= pixel.b * 2.2;
}

function buildHoodedHelperActionFrame(baseFrame, sourceFrame, mode) {
  const frame = cloneImage(baseFrame);
  applyHoodedHelperActionOverlay(frame, sourceFrame, mode);
  return frame;
}

function buildHoodedHelperActionWalkSheet(baseWalkSheet, sourceFrame, mode) {
  const sheet = emptyImage(baseWalkSheet.width, baseWalkSheet.height);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const frame = cropImage(baseWalkSheet, column * frameWidth, row * frameHeight, frameWidth, frameHeight);
      applyHoodedHelperActionOverlay(frame, sourceFrame, mode);
      pasteImage(sheet, frame, column * frameWidth, row * frameHeight);
    }
  }
  return sheet;
}

function applyHoodedHelperActionOverlay(frame, sourceFrame, mode) {
  void sourceFrame;
  if (mode === 'orb') {
    drawJadeOrb(frame);
  } else {
    drawScrollBundle(frame);
  }
}

function drawJadeOrb(frame) {
  const bounds = alphaBounds(frame);
  const cx = bounds ? bounds.x + (bounds.width / 2) : 48;
  const cy = bounds ? bounds.y + (bounds.height * 0.58) : 64;
  const radius = bounds ? Math.max(9, Math.min(13, bounds.width * 0.22)) : 12;
  drawDot(frame, cx, cy + 1, radius + 4.2, 0x071d18, 212);
  drawDot(frame, cx, cy, radius + 2.4, 0xd3a54b, 232);
  drawDot(frame, cx, cy, radius, 0x16aa78, 245);
  drawDot(frame, cx - 2.5, cy - 2.2, radius * 0.68, 0x62f6b2, 148);
  drawRing(frame, cx, cy, radius - 2.6, 0x0f6e55, 150);
  drawRing(frame, cx, cy, radius + 1.2, 0xdab45a, 190);
  drawDot(frame, cx - radius * 0.35, cy - radius * 0.38, 3.2, 0xe4fff0, 180);
  drawDot(frame, cx + radius * 0.25, cy + radius * 0.22, 2.4, 0x063b31, 105);
}

function processGeneratedWalkSource(filePath, profile) {
  const source = readPng(filePath);
  const sheet = emptyImage(frameWidth * columns, frameHeight * rows);
  let firstFrame = null;

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const cell = gridCell(source, column, row);
      const bounds = foregroundBounds(source, cell);
      if (!bounds) throw new Error(`Could not find foreground for ${filePath} row ${row + 1}, column ${column + 1}`);
      const frame = fitSourceToFrame(source, bounds, profile);
      removeSmallAlphaComponents(frame);
      removeDetachedBelowPrimary(frame);
      pasteImage(sheet, frame, column * frameWidth, row * frameHeight);
      if (row === 0 && column === 0) firstFrame = frame;
    }
  }

  if (!firstFrame) throw new Error(`Could not extract first frame from ${filePath}`);
  return { firstFrame, sheet };
}

function gridCell(image, column, row) {
  const x1 = Math.floor((image.width * column) / columns);
  const y1 = Math.floor((image.height * row) / rows);
  const x2 = Math.floor((image.width * (column + 1)) / columns);
  const y2 = Math.floor((image.height * (row + 1)) / rows);
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

function cropImage(source, x, y, width, height) {
  const image = emptyImage(width, height);
  for (let cy = 0; cy < height; cy += 1) {
    for (let cx = 0; cx < width; cx += 1) {
      const sourceOffset = (((y + cy) * source.width) + x + cx) * 4;
      const targetOffset = ((cy * width) + cx) * 4;
      source.data.copy(image.data, targetOffset, sourceOffset, sourceOffset + 4);
    }
  }
  return image;
}

function drawScrollBundle(image) {
  drawThickLine(image, 32, 60, 64, 69, 13, 0x2b1b12, 235);
  drawThickLine(image, 32, 60, 64, 69, 10, 0xa06025, 255);
  drawThickLine(image, 34, 58, 65, 67, 6, 0xd79a4a, 255);
  drawThickLine(image, 36, 57, 64, 65, 2.5, 0xf0cc76, 190);
  drawThickLine(image, 42, 58, 50, 72, 2.5, 0x1f5b45, 230);
  drawThickLine(image, 52, 61, 58, 73, 2.5, 0x1f5b45, 230);
  drawDot(image, 31, 60, 5.6, 0x382012, 245);
  drawDot(image, 31, 60, 3.7, 0xc08138, 255);
  drawDot(image, 65, 69, 5.6, 0x382012, 245);
  drawDot(image, 65, 69, 3.7, 0xc08138, 255);
}

function drawThickLine(image, x1, y1, x2, y2, width, color, alpha) {
  const minX = Math.floor(Math.min(x1, x2) - width);
  const maxX = Math.ceil(Math.max(x1, x2) + width);
  const minY = Math.floor(Math.min(y1, y2) - width);
  const maxY = Math.ceil(Math.max(y1, y2) + width);
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const distance = distanceToSegment(x, y, x1, y1, x2, y2);
      if (distance > width / 2) continue;
      const edge = Math.max(0, Math.min(1, ((width / 2) - distance) / 1.35));
      blendColor(image, x, y, color, alpha * edge);
    }
  }
}

function distanceToSegment(x, y, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(x - x1, y - y1);
  const t = Math.max(0, Math.min(1, (((x - x1) * dx) + ((y - y1) * dy)) / ((dx * dx) + (dy * dy))));
  return Math.hypot(x - (x1 + dx * t), y - (y1 + dy * t));
}

function extractHelperProp(sourceFrame, mode) {
  const prop = emptyImage(sourceFrame.width, sourceFrame.height);
  const crop = mode === 'orb'
    ? { x1: 28, y1: 48, x2: 70, y2: 82 }
    : { x1: 24, y1: 48, x2: 74, y2: 80 };
  const seed = new Uint8Array(sourceFrame.width * sourceFrame.height);
  const mask = new Uint8Array(sourceFrame.width * sourceFrame.height);

  for (let y = crop.y1; y <= crop.y2; y += 1) {
    for (let x = crop.x1; x <= crop.x2; x += 1) {
      const pixel = pixelAt(sourceFrame, x, y);
      if (pixel.a <= 12) continue;
      const keep = mode === 'orb'
        ? isOrbPropPixel(pixel, x, y)
        : isScrollPropPixel(pixel, x, y);
      if (!keep) continue;
      seed[(y * sourceFrame.width) + x] = 1;
      mask[(y * sourceFrame.width) + x] = 1;
    }
  }

  const radius = mode === 'orb' ? 1 : 2;
  for (let y = crop.y1; y <= crop.y2; y += 1) {
    for (let x = crop.x1; x <= crop.x2; x += 1) {
      if (!seed[(y * sourceFrame.width) + x]) continue;
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < crop.x1 || nx > crop.x2 || ny < crop.y1 || ny > crop.y2) continue;
          const pixel = pixelAt(sourceFrame, nx, ny);
          if (pixel.a <= 12 || isSkinPixel(pixel)) continue;
          mask[(ny * sourceFrame.width) + nx] = 1;
        }
      }
    }
  }

  for (let y = crop.y1; y <= crop.y2; y += 1) {
    for (let x = crop.x1; x <= crop.x2; x += 1) {
      if (!mask[(y * sourceFrame.width) + x]) continue;
      const offset = ((y * sourceFrame.width) + x) * 4;
      sourceFrame.data.copy(prop.data, offset, offset, offset + 4);
    }
  }

  return prop;
}

function isOrbPropPixel(pixel, x, y) {
  const distance = Math.hypot(x - 48, y - 64);
  if (distance > 18 || isSkinPixel(pixel)) return false;
  return pixel.g > 86 && pixel.g >= pixel.r * 0.88 && pixel.g >= pixel.b * 0.86;
}

function isScrollPropPixel(pixel, x, y) {
  if (isSkinPixel(pixel)) return false;
  if (x < 28 || x > 70 || y < 50 || y > 78) return false;
  return pixel.r > 86 && pixel.g > 44 && pixel.b < 94 && pixel.r >= pixel.g * 0.9;
}

function isSkinPixel(pixel) {
  return pixel.r > 136 && pixel.g > 78 && pixel.b < 122 && pixel.r > pixel.g * 1.18 && pixel.g > pixel.b * 1.08;
}

function buildQiActionFrame(baseFrame, mode) {
  const aura = emptyImage(frameWidth, frameHeight);
  if (mode === 'channel') {
    drawRing(aura, 48, 62, 30, 0x48f2b8, 132);
    drawRing(aura, 48, 72, 20, 0xb8ffd8, 96);
    drawDot(aura, 30, 38, 3, 0x9effc7, 172);
    drawDot(aura, 66, 34, 2, 0xdbffe8, 150);
  } else {
    drawArc(aura, 58, 56, 26, -0.85, 0.85, 0x50f2b1, 190);
    drawArc(aura, 62, 62, 34, -0.65, 0.55, 0xd3ffe2, 130);
    drawDot(aura, 72, 48, 4, 0x78ffbd, 180);
    drawDot(aura, 78, 65, 3, 0xd9ffe9, 140);
  }
  compositeImage(aura, baseFrame, 0, 0);
  return aura;
}

function transformFrame(source, options) {
  const bounds = alphaBounds(source);
  if (!bounds) return source;
  const target = emptyImage(frameWidth, frameHeight);
  const drawWidth = Math.max(1, Math.round(bounds.width * options.scaleX));
  const drawHeight = Math.max(1, Math.round(bounds.height * options.scaleY));
  const drawX = Math.round((frameWidth - drawWidth) / 2 + options.dx);
  const drawY = Math.round(frameHeight - 5 - drawHeight + options.dy);

  for (let y = 0; y < drawHeight; y += 1) {
    for (let x = 0; x < drawWidth; x += 1) {
      const normalizedX = options.flipX ? 1 - ((x + 0.5) / drawWidth) : (x + 0.5) / drawWidth;
      const normalizedY = (y + 0.5) / drawHeight;
      const lowerBody = Math.max(0, Math.min(1, (normalizedY - 0.56) / 0.44));
      const half = normalizedX < 0.5 ? -1 : 1;
      const strideOffset = Math.sin(options.walkPhase ?? 0) * (options.stride ?? 0) * lowerBody * half;
      const sourceX = bounds.x + (normalizedX * bounds.width) - 0.5 - strideOffset;
      const sourceY = bounds.y + (normalizedY * bounds.height) - 0.5;
      const pixel = sampleBilinear(source, sourceX, sourceY);
      if (pixel.a <= 2) continue;
      blendPixel(target, drawX + x, drawY + y, {
        r: pixel.r * options.tint,
        g: pixel.g * options.tint,
        b: pixel.b * options.tint,
        a: pixel.a,
      });
    }
  }
  return target;
}

function cloneImage(image) {
  return { width: image.width, height: image.height, data: Buffer.from(image.data) };
}

function drawScaledConcept(target, source, crop, destX, destY, scale) {
  const drawWidth = Math.max(1, Math.round(crop.width * scale));
  const drawHeight = Math.max(1, Math.round(crop.height * scale));

  for (let y = 0; y < drawHeight; y += 1) {
    const targetY = destY + y;
    if (targetY < 0 || targetY >= target.height) continue;
    const sourceY = crop.y + ((y + 0.5) / scale) - 0.5;

    for (let x = 0; x < drawWidth; x += 1) {
      const targetX = destX + x;
      if (targetX < 0 || targetX >= target.width) continue;
      const sourceX = crop.x + ((x + 0.5) / scale) - 0.5;
      const pixel = sampleConcept(source, sourceX, sourceY);
      if (pixel.a <= 2) continue;
      blendPixel(target, targetX, targetY, pixel);
    }
  }
}

function sampleConcept(image, x, y) {
  const pixel = sampleBilinear(image, x, y);
  if (pixel.a <= 8 || isChromaGreen(pixel.r, pixel.g, pixel.b)) return { r: 0, g: 0, b: 0, a: 0 };
  return pixel;
}

function isForeground(image, x, y) {
  const offset = ((y * image.width) + x) * 4;
  return !isChromaGreen(image.data[offset], image.data[offset + 1], image.data[offset + 2]);
}

function isChromaGreen(r, g, b) {
  return g > 176 && r < 96 && b < 110 && g > r * 1.75 && g > b * 1.75;
}

function removeSmallAlphaComponents(image) {
  const components = alphaComponents(image);
  if (components.length <= 1) return;
  const largest = components[0];
  for (const component of components.slice(1)) {
    if (component.pixels.length >= largest.pixels.length * 0.035) continue;
    for (const pixel of component.pixels) {
      image.data[((pixel.y * image.width) + pixel.x) * 4 + 3] = 0;
    }
  }
}

function removeDetachedBelowPrimary(image) {
  const components = alphaComponents(image);
  if (components.length <= 1) return;
  const primary = componentBounds(components[0]);
  for (const component of components.slice(1)) {
    const bounds = componentBounds(component);
    if (bounds.minY <= primary.maxY + 5) continue;
    if (component.pixels.length >= components[0].pixels.length * 0.25) continue;
    for (const pixel of component.pixels) {
      image.data[((pixel.y * image.width) + pixel.x) * 4 + 3] = 0;
    }
  }
}

function componentBounds(component) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const pixel of component.pixels) {
    minX = Math.min(minX, pixel.x);
    minY = Math.min(minY, pixel.y);
    maxX = Math.max(maxX, pixel.x);
    maxY = Math.max(maxY, pixel.y);
  }
  return { minX, minY, maxX, maxY };
}

function alphaComponents(image) {
  const visited = new Uint8Array(image.width * image.height);
  const components = [];
  const queue = [];

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const start = (y * image.width) + x;
      if (visited[start] || image.data[start * 4 + 3] <= 12) continue;
      visited[start] = 1;
      queue.length = 0;
      queue.push({ x, y });
      const pixels = [];

      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const point = queue[cursor];
        pixels.push(point);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = point.x + dx;
          const ny = point.y + dy;
          if (nx < 0 || nx >= image.width || ny < 0 || ny >= image.height) continue;
          const next = (ny * image.width) + nx;
          if (visited[next] || image.data[next * 4 + 3] <= 12) continue;
          visited[next] = 1;
          queue.push({ x: nx, y: ny });
        }
      }
      components.push({ pixels });
    }
  }

  return components.sort((left, right) => right.pixels.length - left.pixels.length);
}

function alphaBounds(image) {
  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (image.data[((y * image.width) + x) * 4 + 3] <= 12) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  return maxX >= minX
    ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
    : null;
}

function drawRing(image, cx, cy, radius, color, alpha) {
  for (let y = Math.floor(cy - radius - 2); y <= Math.ceil(cy + radius + 2); y += 1) {
    for (let x = Math.floor(cx - radius - 2); x <= Math.ceil(cx + radius + 2); x += 1) {
      const distance = Math.hypot(x - cx, y - cy);
      const strength = Math.max(0, 1 - Math.abs(distance - radius) / 2.7);
      if (strength <= 0) continue;
      blendColor(image, x, y, color, alpha * strength);
    }
  }
}

function drawArc(image, cx, cy, radius, start, end, color, alpha) {
  for (let step = 0; step <= 52; step += 1) {
    const angle = start + ((end - start) * step / 52);
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    drawDot(image, x, y, 3.2, color, alpha);
  }
}

function drawDot(image, cx, cy, radius, color, alpha) {
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y += 1) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x += 1) {
      const distance = Math.hypot(x - cx, y - cy);
      if (distance > radius) continue;
      blendColor(image, x, y, color, alpha * (1 - distance / radius));
    }
  }
}

function blendColor(image, x, y, color, alpha) {
  if (x < 0 || x >= image.width || y < 0 || y >= image.height) return;
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  blendPixel(image, Math.round(x), Math.round(y), { r, g, b, a: alpha });
}

function compositeImage(base, overlay, targetX, targetY) {
  for (let y = 0; y < overlay.height; y += 1) {
    for (let x = 0; x < overlay.width; x += 1) {
      const offset = ((y * overlay.width) + x) * 4;
      if (overlay.data[offset + 3] <= 0) continue;
      blendPixel(base, targetX + x, targetY + y, {
        r: overlay.data[offset],
        g: overlay.data[offset + 1],
        b: overlay.data[offset + 2],
        a: overlay.data[offset + 3],
      });
    }
  }
}

function pasteImage(target, source, targetX, targetY) {
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const sourceOffset = ((y * source.width) + x) * 4;
      const targetOffset = (((targetY + y) * target.width) + targetX + x) * 4;
      source.data.copy(target.data, targetOffset, sourceOffset, sourceOffset + 4);
    }
  }
}

function blendPixel(image, x, y, pixel) {
  if (x < 0 || x >= image.width || y < 0 || y >= image.height) return;
  const offset = ((y * image.width) + x) * 4;
  const sourceAlpha = Math.max(0, Math.min(255, pixel.a)) / 255;
  if (sourceAlpha <= 0) return;
  const targetAlpha = image.data[offset + 3] / 255;
  const outAlpha = sourceAlpha + (targetAlpha * (1 - sourceAlpha));
  if (outAlpha <= 0) return;
  image.data[offset] = clampByte(((pixel.r * sourceAlpha) + (image.data[offset] * targetAlpha * (1 - sourceAlpha))) / outAlpha);
  image.data[offset + 1] = clampByte(((pixel.g * sourceAlpha) + (image.data[offset + 1] * targetAlpha * (1 - sourceAlpha))) / outAlpha);
  image.data[offset + 2] = clampByte(((pixel.b * sourceAlpha) + (image.data[offset + 2] * targetAlpha * (1 - sourceAlpha))) / outAlpha);
  image.data[offset + 3] = clampByte(outAlpha * 255);
}

function sampleBilinear(image, x, y) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = x - x0;
  const ty = y - y0;
  const samples = [
    { pixel: pixelAt(image, x0, y0), weight: (1 - tx) * (1 - ty) },
    { pixel: pixelAt(image, x0 + 1, y0), weight: tx * (1 - ty) },
    { pixel: pixelAt(image, x0, y0 + 1), weight: (1 - tx) * ty },
    { pixel: pixelAt(image, x0 + 1, y0 + 1), weight: tx * ty },
  ];
  let alpha = 0;
  let red = 0;
  let green = 0;
  let blue = 0;

  for (const { pixel, weight } of samples) {
    const weightedAlpha = (pixel.a / 255) * weight;
    alpha += weightedAlpha;
    red += pixel.r * weightedAlpha;
    green += pixel.g * weightedAlpha;
    blue += pixel.b * weightedAlpha;
  }

  if (alpha <= 0) return { r: 0, g: 0, b: 0, a: 0 };
  return {
    r: clampByte(red / alpha),
    g: clampByte(green / alpha),
    b: clampByte(blue / alpha),
    a: clampByte(alpha * 255),
  };
}

function pixelAt(image, x, y) {
  if (x < 0 || x >= image.width || y < 0 || y >= image.height) return { r: 0, g: 0, b: 0, a: 0 };
  const offset = ((Math.round(y) * image.width) + Math.round(x)) * 4;
  return {
    r: image.data[offset],
    g: image.data[offset + 1],
    b: image.data[offset + 2],
    a: image.data[offset + 3],
  };
}

function emptyImage(width, height) {
  return { width, height, data: Buffer.alloc(width * height * 4) };
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

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

main();
