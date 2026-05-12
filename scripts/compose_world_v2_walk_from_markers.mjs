import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const FRAME_WIDTH = 96;
const FRAME_HEIGHT = 112;
const FRAME_COUNT = 6;
const DIRECTIONS = ['down', 'left', 'right', 'up'];
const DEFAULT_POSE_SEQUENCE = ['left-forward', 'passing', 'right-forward', 'passing-alt', 'left-forward', 'passing'];
const ROOT = process.cwd();
const GUIDE_PATH = path.join(ROOT, 'private/world-v2/actors/walk/pose-guide.json');

const replace = process.argv.includes('--replace');
const useDefaults = process.argv.includes('--defaults');
const sourceMarkers = process.argv.includes('--source-markers');
const args = process.argv.filter((arg) => !arg.startsWith('--'));
const [slug, direction] = args.slice(2);

if (!slug || !DIRECTIONS.includes(direction)) {
  throw new Error('Usage: node scripts/compose_world_v2_walk_from_markers.mjs <slug> <down|left|right|up> [--defaults] [--source-markers] [--replace]');
}

const directionIndex = DIRECTIONS.indexOf(direction);
const sheetPath = path.join(ROOT, 'public/world-v2/actors/walk', `${slug}-walk.png`);
const guide = JSON.parse(await readFile(GUIDE_PATH, 'utf8'));
const directionFrames = guide.actors?.[slug]?.directions?.[direction] ?? [];
const targetFrames = Array.from({ length: FRAME_COUNT }, (_, frameIndex) => {
  const frame = directionFrames[frameIndex] ?? {};
  const hasMarkers = frame.leftFoot && frame.rightFoot;
  const defaultTargets = defaultFootTargets(direction, frameIndex);
  return {
    pose: frame.pose ?? DEFAULT_POSE_SEQUENCE[frameIndex],
    sourceLeftFoot: sourceMarkers && hasMarkers ? frame.leftFoot : null,
    sourceRightFoot: sourceMarkers && hasMarkers ? frame.rightFoot : null,
    leftFoot: sourceMarkers ? defaultTargets.leftFoot : hasMarkers ? frame.leftFoot : useDefaults ? defaultTargets.leftFoot : null,
    rightFoot: sourceMarkers ? defaultTargets.rightFoot : hasMarkers ? frame.rightFoot : useDefaults ? defaultTargets.rightFoot : null,
  };
});

const outputPath = replace
  ? sheetPath
  : path.join(ROOT, 'private/world-v2/actors/walk/pilots', `${slug}-${direction}-marker-compose.png`);

const sheet = await readFile(sheetPath);
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.setContent('<!doctype html><html><body></body></html>');

  const outputDataUrl = await page.evaluate(
    async ({ sheetDataUrl, directionIndex, targetFrames, frameWidth, frameHeight, frameCount }) => {
      const loadImage = (src) => new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = src;
      });

      const sheetImage = await loadImage(sheetDataUrl);
      const out = document.createElement('canvas');
      out.width = sheetImage.width;
      out.height = sheetImage.height;
      const outCtx = out.getContext('2d', { willReadFrequently: true });
      outCtx.clearRect(0, 0, out.width, out.height);
      outCtx.drawImage(sheetImage, 0, 0);

      for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
        const target = targetFrames[frameIndex];
          if (!target.leftFoot || !target.rightFoot) continue;

          const cell = outCtx.getImageData(
            frameIndex * frameWidth,
            directionIndex * frameHeight,
            frameWidth,
            frameHeight,
          );
        const sourcePoints = target.sourceLeftFoot && target.sourceRightFoot
          ? [target.sourceLeftFoot, target.sourceRightFoot]
          : null;
        const composed = sourcePoints
          ? composeFrameFromSourceMarkers(cell, sourcePoints, [target.leftFoot, target.rightFoot], frameWidth, frameHeight)
          : composeFrame(cell, [target.leftFoot, target.rightFoot], frameWidth, frameHeight);
          outCtx.putImageData(composed, frameIndex * frameWidth, directionIndex * frameHeight);
        }

      return out.toDataURL('image/png');

      function composeFrame(cell, targetPoints, width, height) {
        const data = new Uint8ClampedArray(cell.data);
        const bounds = alphaBounds(data, width, height);
        if (!bounds) return cell;

        const components = detectFootComponents(data, width, height, bounds)
          .sort((a, b) => a.centerX - b.centerX)
          .slice(0, 2);
        if (components.length === 0) return cell;

        const sortedTargets = [...targetPoints].sort((a, b) => a.x - b.x);
        const assignments = components.map((component, index) => ({
          component,
          target: sortedTargets[Math.min(index, sortedTargets.length - 1)],
        }));

        const patches = assignments.map(({ component, target }) => ({
          patch: readPatch(data, width, height, { x: component.centerX, y: component.centerY }, 20, 24),
          target,
        }));
        for (const { patch } of patches) {
          erasePatch(data, width, height, patch);
        }
        for (const { patch, target } of patches) {
          drawPatch(data, width, height, patch, target.x, target.y);
        }

        return new ImageData(data, width, height);
      }

      function composeFrameFromSourceMarkers(cell, sourcePoints, targetPoints, width, height) {
        const data = new Uint8ClampedArray(cell.data);
        const patchWidth = 18;
        const patchHeight = 10;
        const sourcePairs = [...sourcePoints].sort((a, b) => a.x - b.x);
        const targetPairs = [...targetPoints].sort((a, b) => a.x - b.x);
        const patches = sourcePairs.map((point) => readPatch(data, width, height, point, patchWidth, patchHeight));

        for (const patch of patches) {
          erasePatch(data, width, height, patch);
        }
        patches.forEach((patch, index) => {
          const target = targetPairs[Math.min(index, targetPairs.length - 1)];
          drawPatch(data, width, height, patch, target.x, target.y);
        });

        return new ImageData(data, width, height);
      }

      function alphaBounds(data, width, height) {
        let minX = width;
        let minY = height;
        let maxX = -1;
        let maxY = -1;
        for (let y = 0; y < height; y += 1) {
          for (let x = 0; x < width; x += 1) {
            const index = ((y * width) + x) * 4;
            if (data[index + 3] <= 16) continue;
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
        }
        return maxX >= minX ? { minX, minY, maxX, maxY } : null;
      }

      function detectFootComponents(data, width, height, bounds) {
        const seedTop = Math.max(bounds.minY, bounds.maxY - 18);
        const regionTop = Math.max(bounds.minY, bounds.maxY - 27);
        const regionMinX = Math.max(0, bounds.minX - 6);
        const regionMaxX = Math.min(width - 1, bounds.maxX + 6);
        const seedMask = new Uint8Array(width * height);
        const visited = new Uint8Array(width * height);

        for (let y = seedTop; y <= bounds.maxY; y += 1) {
          for (let x = regionMinX; x <= regionMaxX; x += 1) {
            const index = ((y * width) + x) * 4;
            if (data[index + 3] <= 24) continue;
            const r = data[index];
            const g = data[index + 1];
            const b = data[index + 2];
            if (isLikelyFootColor(r, g, b, y, bounds)) seedMask[(y * width) + x] = 1;
          }
        }

        const components = [];
        const queue = [];
        for (let y = regionTop; y <= bounds.maxY; y += 1) {
          for (let x = regionMinX; x <= regionMaxX; x += 1) {
            const start = (y * width) + x;
            if (!seedMask[start] || visited[start]) continue;
            queue.length = 0;
            queue.push({ x, y });
            visited[start] = 1;
            const pixels = [];
            let minX = x;
            let minY = y;
            let maxX = x;
            let maxY = y;

            for (let cursor = 0; cursor < queue.length; cursor += 1) {
              const point = queue[cursor];
              const rgba = readRgba(data, width, point.x, point.y);
              pixels.push({ x: point.x, y: point.y, rgba });
              minX = Math.min(minX, point.x);
              minY = Math.min(minY, point.y);
              maxX = Math.max(maxX, point.x);
              maxY = Math.max(maxY, point.y);

              for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nx = point.x + dx;
                const ny = point.y + dy;
                if (nx < regionMinX || nx > regionMaxX || ny < regionTop || ny > bounds.maxY) continue;
                const next = (ny * width) + nx;
                if (visited[next]) continue;
                const index = next * 4;
                if (data[index + 3] <= 24) continue;
                const r = data[index];
                const g = data[index + 1];
                const b = data[index + 2];
                if (!seedMask[next]) continue;
                visited[next] = 1;
                queue.push({ x: nx, y: ny });
              }
            }

            const componentWidth = maxX - minX + 1;
            const componentHeight = maxY - minY + 1;
            if (pixels.length >= 6 && componentWidth <= 26 && componentHeight <= 25) {
              components.push({
                pixels,
                minX,
                minY,
                maxX,
                maxY,
                centerX: (minX + maxX) / 2,
                centerY: (minY + maxY) / 2,
                area: pixels.length,
              });
            }
          }
        }

        return components
          .map((component) => ({
            ...component,
            score: component.area + component.maxY * 3,
          }))
          .sort((a, b) => b.score - a.score);
      }

      function readPatch(data, width, height, point, patchWidth, patchHeight) {
        const x = Math.round(point.x - patchWidth / 2);
        const y = Math.round(point.y - patchHeight / 2);
        const pixels = [];
        for (let py = 0; py < patchHeight; py += 1) {
          for (let px = 0; px < patchWidth; px += 1) {
            const sx = x + px;
            const sy = y + py;
            if (sx < 0 || sx >= width || sy < 0 || sy >= height) continue;
            const rgba = readRgba(data, width, sx, sy);
            if (rgba[3] <= 8) continue;
            pixels.push({ x: sx, y: sy, px, py, rgba });
          }
        }
        return {
          x,
          y,
          width: patchWidth,
          height: patchHeight,
          centerX: point.x,
          centerY: point.y,
          pixels,
        };
      }

      function erasePatch(data, width, height, patch) {
        for (let y = patch.y - 1; y < patch.y + patch.height + 1; y += 1) {
          for (let x = patch.x - 1; x < patch.x + patch.width + 1; x += 1) {
            if (x < 0 || x >= width || y < 0 || y >= height) continue;
            if (Math.abs(x - patch.centerX) > patch.width * 0.62 || Math.abs(y - patch.centerY) > patch.height * 0.72) continue;
            const index = ((y * width) + x) * 4;
            data[index + 3] = 0;
          }
        }
      }

      function drawPatch(data, width, height, patch, targetX, targetY) {
        const dx = Math.round(targetX - patch.centerX);
        const dy = Math.round(targetY - patch.centerY);
        for (const pixel of patch.pixels) {
          const x = pixel.x + dx;
          const y = pixel.y + dy;
          if (x < 0 || x >= width || y < 0 || y >= height) continue;
          const index = ((y * width) + x) * 4;
          const alpha = pixel.rgba[3] / 255;
          const inverse = 1 - alpha;
          data[index] = Math.round(pixel.rgba[0] * alpha + data[index] * inverse);
          data[index + 1] = Math.round(pixel.rgba[1] * alpha + data[index + 1] * inverse);
          data[index + 2] = Math.round(pixel.rgba[2] * alpha + data[index + 2] * inverse);
          data[index + 3] = Math.max(data[index + 3], pixel.rgba[3]);
        }
      }

      function drawComponent(data, width, height, component, targetX, targetY) {
        const dx = Math.round(targetX - component.centerX);
        const dy = Math.round(targetY - component.centerY);
        for (const pixel of component.pixels) {
          const x = pixel.x + dx;
          const y = pixel.y + dy;
          if (x < 0 || x >= width || y < 0 || y >= height) continue;
          const index = ((y * width) + x) * 4;
          const alpha = pixel.rgba[3] / 255;
          const inverse = 1 - alpha;
          data[index] = Math.round(pixel.rgba[0] * alpha + data[index] * inverse);
          data[index + 1] = Math.round(pixel.rgba[1] * alpha + data[index + 1] * inverse);
          data[index + 2] = Math.round(pixel.rgba[2] * alpha + data[index + 2] * inverse);
          data[index + 3] = Math.max(data[index + 3], pixel.rgba[3]);
        }
      }

      function isLikelyFootColor(r, g, b, y, bounds) {
        const warmBrown = r > 45 && g > 20 && b < 90 && r > b * 1.1 && g > b * 0.65;
        const orange = r > 118 && g > 58 && b < 82;
        const lowerDark = y > bounds.maxY - 10 && r < 100 && g < 85 && b < 76 && r > b * 0.75;
        return warmBrown || orange || lowerDark;
      }

      function readRgba(data, width, x, y) {
        const index = ((y * width) + x) * 4;
        return [data[index], data[index + 1], data[index + 2], data[index + 3]];
      }
    },
    {
      sheetDataUrl: `data:image/png;base64,${sheet.toString('base64')}`,
      directionIndex,
      targetFrames,
      frameWidth: FRAME_WIDTH,
      frameHeight: FRAME_HEIGHT,
      frameCount: FRAME_COUNT,
    },
  );

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, Buffer.from(outputDataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
  console.log(`wrote ${path.relative(ROOT, outputPath)}`);
} finally {
  await browser.close();
}

function defaultFootTargets(direction, frameIndex) {
  const pose = DEFAULT_POSE_SEQUENCE[frameIndex];
  const passing = pose === 'passing' || pose === 'passing-alt';
  const secondContact = pose === 'right-forward';

  if (direction === 'right') {
    if (passing) return { leftFoot: { x: 50, y: 94 }, rightFoot: { x: 58, y: 94 } };
    return secondContact
      ? { leftFoot: { x: 39, y: 95 }, rightFoot: { x: 65, y: 92 } }
      : { leftFoot: { x: 64, y: 92 }, rightFoot: { x: 39, y: 95 } };
  }
  if (direction === 'left') {
    if (passing) return { leftFoot: { x: 46, y: 94 }, rightFoot: { x: 54, y: 94 } };
    return secondContact
      ? { leftFoot: { x: 57, y: 95 }, rightFoot: { x: 31, y: 92 } }
      : { leftFoot: { x: 32, y: 92 }, rightFoot: { x: 57, y: 95 } };
  }
  if (direction === 'up') {
    if (passing) return { leftFoot: { x: 43, y: 92 }, rightFoot: { x: 55, y: 92 } };
    return secondContact
      ? { leftFoot: { x: 43, y: 94 }, rightFoot: { x: 55, y: 89 } }
      : { leftFoot: { x: 43, y: 89 }, rightFoot: { x: 55, y: 94 } };
  }
  if (passing) return { leftFoot: { x: 42, y: 94 }, rightFoot: { x: 55, y: 94 } };
  return secondContact
    ? { leftFoot: { x: 42, y: 91 }, rightFoot: { x: 56, y: 96 } }
    : { leftFoot: { x: 42, y: 96 }, rightFoot: { x: 56, y: 91 } };
}
