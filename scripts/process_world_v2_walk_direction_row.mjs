import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const FRAME_WIDTH = 96;
const FRAME_HEIGHT = 112;
const FRAME_COUNT = 6;
const DIRECTIONS = ['down', 'left', 'right', 'up'];
const ROOT = process.cwd();

const args = process.argv.filter((arg) => !arg.startsWith('--'));
const replace = process.argv.includes('--replace');
const [slug, direction, explicitSourcePath] = args.slice(2);

if (!slug || !direction || !DIRECTIONS.includes(direction)) {
  throw new Error('Usage: node scripts/process_world_v2_walk_direction_row.mjs <slug> <down|left|right|up> [sourcePath] [--replace]');
}

const sourceSuffix = process.env.WALK_ROW_SOURCE_SUFFIX ?? 'walk-row-source';
const outputSuffix = process.env.WALK_ROW_OUTPUT_SUFFIX ?? 'walk-pilot';
const directionIndex = DIRECTIONS.indexOf(direction);
const referencePath = path.join(ROOT, 'public/world-v2/actors', `${slug}.png`);
const baselinePath = path.join(ROOT, 'public/world-v2/actors/walk', `${slug}-walk.png`);
const sourcePath = explicitSourcePath
  ? path.resolve(ROOT, explicitSourcePath)
  : path.join(ROOT, 'private/world-v2/actors/walk/raw', `${slug}-${direction}-${sourceSuffix}.png`);
const outputPath = replace
  ? baselinePath
  : path.join(ROOT, 'private/world-v2/actors/walk/pilots', `${slug}-${direction}-${outputSuffix}.png`);

const [reference, baseline, source] = await Promise.all([
  readFile(referencePath),
  readFile(baselinePath),
  readFile(sourcePath),
]);

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.setContent('<!doctype html><html><body></body></html>');

  const outputDataUrl = await page.evaluate(
    async ({ referenceDataUrl, baselineDataUrl, sourceDataUrl, directionIndex, frameWidth, frameHeight, frameCount }) => {
      const loadImage = (src) => new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = src;
      });

      const [referenceImage, baselineImage, sourceImage] = await Promise.all([
        loadImage(referenceDataUrl),
        loadImage(baselineDataUrl),
        loadImage(sourceDataUrl),
      ]);

      const out = document.createElement('canvas');
      out.width = baselineImage.width;
      out.height = baselineImage.height;
      const outCtx = out.getContext('2d', { willReadFrequently: true });
      outCtx.clearRect(0, 0, out.width, out.height);
      outCtx.drawImage(baselineImage, 0, 0);
      outCtx.clearRect(0, directionIndex * frameHeight, frameWidth * frameCount, frameHeight);

      const referenceBounds = imageBounds(referenceImage, 'alpha');
      const referenceWidth = referenceBounds.maxX - referenceBounds.minX + 1;
      const referenceHeight = referenceBounds.maxY - referenceBounds.minY + 1;
      const referenceBottomPadding = Math.max(2, frameHeight - referenceBounds.maxY - 1);
      const targetMaxWidth = Math.min(frameWidth - 8, Math.max(referenceWidth + 8, 56));
      const targetMaxHeight = Math.min(frameHeight - 6, Math.max(referenceHeight + 8, 78));
      const sourceBounds = sourceFrameBounds(sourceImage, frameCount);

      outCtx.imageSmoothingEnabled = true;
      outCtx.imageSmoothingQuality = 'high';

      for (let column = 0; column < frameCount; column += 1) {
        const bounds = sourceBounds[column];
        const sourcePaddingX = Math.max(8, Math.round(bounds.width * 0.08));
        const sourcePaddingY = Math.max(8, Math.round(bounds.height * 0.08));
        const cropX = Math.max(0, bounds.x - sourcePaddingX);
        const cropY = Math.max(0, bounds.y - sourcePaddingY);
        const cropRight = Math.min(sourceImage.width, bounds.x + bounds.width + sourcePaddingX);
        const cropBottom = Math.min(sourceImage.height, bounds.y + bounds.height + sourcePaddingY);
        const cropWidth = Math.max(1, cropRight - cropX);
        const cropHeight = Math.max(1, cropBottom - cropY);
        const scale = Math.min(targetMaxWidth / cropWidth, targetMaxHeight / cropHeight);
        const drawWidth = Math.max(1, Math.round(cropWidth * scale));
        const drawHeight = Math.max(1, Math.round(cropHeight * scale));
        const drawX = Math.round((frameWidth - drawWidth) / 2) + (column * frameWidth);
        const drawY = Math.round(frameHeight - referenceBottomPadding - drawHeight) + (directionIndex * frameHeight);

        outCtx.drawImage(
          sourceImage,
          cropX,
          cropY,
          cropWidth,
          cropHeight,
          drawX,
          drawY,
          drawWidth,
          drawHeight,
        );
      }

      const imageData = outCtx.getImageData(0, 0, out.width, out.height);
      const pixels = imageData.data;
      for (let index = 0; index < pixels.length; index += 4) {
        const r = pixels[index];
        const g = pixels[index + 1];
        const b = pixels[index + 2];
        if (g > 88 && g > r * 1.18 && g > b * 1.18) {
          pixels[index + 3] = 0;
          continue;
        }
        if (g > r * 1.1 && g > b * 1.1) {
          pixels[index + 1] = Math.max(r, b);
        }
      }
      outCtx.putImageData(imageData, 0, 0);

      return out.toDataURL('image/png');

      function imageBounds(image, mode, rect = { x: 0, y: 0, width: image.width, height: image.height }) {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(rect.width));
        canvas.height = Math.max(1, Math.round(rect.height));
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height, 0, 0, canvas.width, canvas.height);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let minX = canvas.width;
        let minY = canvas.height;
        let maxX = -1;
        let maxY = -1;

        for (let y = 0; y < canvas.height; y += 1) {
          for (let x = 0; x < canvas.width; x += 1) {
            const index = (y * canvas.width + x) * 4;
            const r = data[index];
            const g = data[index + 1];
            const b = data[index + 2];
            const a = data[index + 3];
            const occupied = mode === 'alpha'
              ? a > 16
              : !(g > 96 && g > r * 1.22 && g > b * 1.22);
            if (!occupied) continue;
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
        }

        return maxX >= minX && maxY >= minY
          ? { minX, minY, maxX, maxY }
          : { minX: 0, minY: 0, maxX: canvas.width - 1, maxY: canvas.height - 1 };
      }

      function sourceFrameBounds(image, columns) {
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(image, 0, 0);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const isForeground = (x, y) => {
          const index = (y * canvas.width + x) * 4;
          const r = data[index];
          const g = data[index + 1];
          const b = data[index + 2];
          const a = data[index + 3];
          return a > 16 && !(g > 96 && g > r * 1.22 && g > b * 1.22);
        };
        const columnCounts = Array.from({ length: canvas.width }, () => 0);
        for (let y = 0; y < canvas.height; y += 1) {
          for (let x = 0; x < canvas.width; x += 1) {
            if (isForeground(x, y)) columnCounts[x] += 1;
          }
        }

        const smoothedCounts = columnCounts.map((_, x) => {
          let total = 0;
          let samples = 0;
          for (let sx = Math.max(0, x - 4); sx <= Math.min(canvas.width - 1, x + 4); sx += 1) {
            total += columnCounts[sx];
            samples += 1;
          }
          return total / samples;
        });
        const threshold = Math.max(5, Math.round(canvas.height * 0.03));
        const runs = [];
        let runStart = null;
        for (let x = 0; x < smoothedCounts.length; x += 1) {
          if (smoothedCounts[x] >= threshold && runStart === null) {
            runStart = x;
          } else if ((smoothedCounts[x] < threshold || x === smoothedCounts.length - 1) && runStart !== null) {
            const runEnd = smoothedCounts[x] < threshold ? x - 1 : x;
            if (runEnd - runStart > 12) runs.push({ start: runStart, end: runEnd });
            runStart = null;
          }
        }

        const selectedRuns = runs
          .map((run) => ({ ...run, width: run.end - run.start + 1 }))
          .sort((a, b) => b.width - a.width)
          .slice(0, columns)
          .sort((a, b) => ((a.start + a.end) / 2) - ((b.start + b.end) / 2));

        if (selectedRuns.length !== columns) {
          return Array.from({ length: columns }, (_, column) => ({
            x: column * (canvas.width / columns),
            y: 0,
            width: canvas.width / columns,
            height: canvas.height,
          }));
        }

        return selectedRuns.map((run) => {
          let minX = canvas.width;
          let minY = canvas.height;
          let maxX = -1;
          let maxY = -1;
          for (let y = 0; y < canvas.height; y += 1) {
            for (let x = run.start; x <= run.end; x += 1) {
              if (!isForeground(x, y)) continue;
              minX = Math.min(minX, x);
              minY = Math.min(minY, y);
              maxX = Math.max(maxX, x);
              maxY = Math.max(maxY, y);
            }
          }
          return maxX >= minX && maxY >= minY
            ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
            : { x: run.start, y: 0, width: run.end - run.start + 1, height: canvas.height };
        });
      }
    },
    {
      referenceDataUrl: `data:image/png;base64,${reference.toString('base64')}`,
      baselineDataUrl: `data:image/png;base64,${baseline.toString('base64')}`,
      sourceDataUrl: `data:image/png;base64,${source.toString('base64')}`,
      directionIndex,
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
