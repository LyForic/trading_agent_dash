import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const FRAME_WIDTH = 96;
const FRAME_HEIGHT = 112;
const COLUMNS = Number.parseInt(process.env.WALK_COLUMNS ?? '6', 10);
const ROWS = 4;
const ROOT = process.cwd();
const SOURCE_SUFFIX = process.env.WALK_SOURCE_SUFFIX ?? 'walk-source-v2';
const OUTPUT_SUFFIX = process.env.WALK_OUTPUT_SUFFIX ?? 'walk';

const requestedSlugs = process.argv.slice(2);
const slugs = requestedSlugs.length > 0
  ? requestedSlugs
  : [
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
    ];

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.setContent('<!doctype html><html><body></body></html>');

  for (const slug of slugs) {
    const referencePath = path.join(ROOT, 'public/world-v2/actors', `${slug}.png`);
    const sourcePath = path.join(ROOT, 'private/world-v2/actors/walk/raw', `${slug}-${SOURCE_SUFFIX}.png`);
    const outputPath = path.join(ROOT, 'public/world-v2/actors/walk', `${slug}-${OUTPUT_SUFFIX}.png`);

    const [reference, source] = await Promise.all([
      readFile(referencePath),
      readFile(sourcePath),
    ]);

    const outputDataUrl = await page.evaluate(
      async ({ referenceDataUrl, sourceDataUrl, frameWidth, frameHeight, columns, rows }) => {
        const loadImage = (src) => new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = reject;
          image.src = src;
        });

        const referenceImage = await loadImage(referenceDataUrl);
        const sourceImage = await loadImage(sourceDataUrl);

        const imageBounds = (image, mode, rect = { x: 0, y: 0, width: image.width, height: image.height }) => {
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(rect.width));
          canvas.height = Math.max(1, Math.round(rect.height));
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(
            image,
            rect.x,
            rect.y,
            rect.width,
            rect.height,
            0,
            0,
            canvas.width,
            canvas.height,
          );
          const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          const columnCounts = Array.from({ length: canvas.width }, () => 0);
          const rowCounts = Array.from({ length: canvas.height }, () => 0);
          let minX = canvas.width;
          let minY = canvas.height;
          let maxX = -1;
          let maxY = -1;

          for (let y = 0; y < canvas.height; y += 1) {
            for (let x = 0; x < canvas.width; x += 1) {
              const index = (y * canvas.width + x) * 4;
              const r = pixels[index];
              const g = pixels[index + 1];
              const b = pixels[index + 2];
              const a = pixels[index + 3];
              const occupied = mode === 'alpha'
                ? a > 16
                : !(g > 96 && g > r * 1.22 && g > b * 1.22);
              if (!occupied) continue;
              columnCounts[x] += 1;
              rowCounts[y] += 1;
              minX = Math.min(minX, x);
              minY = Math.min(minY, y);
              maxX = Math.max(maxX, x);
              maxY = Math.max(maxY, y);
            }
          }

          if (maxX < minX || maxY < minY) {
            return { minX: 0, minY: 0, maxX: canvas.width - 1, maxY: canvas.height - 1 };
          }
          if (mode === 'green') {
            const columnThreshold = Math.max(4, Math.round(canvas.height * 0.025));
            const rowThreshold = Math.max(4, Math.round(canvas.width * 0.025));
            const denseMinX = columnCounts.findIndex((count) => count >= columnThreshold);
            const denseMaxX = columnCounts.findLastIndex((count) => count >= columnThreshold);
            const denseMinY = rowCounts.findIndex((count) => count >= rowThreshold);
            const denseMaxY = rowCounts.findLastIndex((count) => count >= rowThreshold);
            if (denseMinX >= 0 && denseMaxX >= denseMinX && denseMinY >= 0 && denseMaxY >= denseMinY) {
              return {
                minX: denseMinX,
                minY: denseMinY,
                maxX: denseMaxX,
                maxY: denseMaxY,
              };
            }
          }
          return { minX, minY, maxX, maxY };
        };

        const referenceBounds = imageBounds(referenceImage, 'alpha');
        const referenceWidth = referenceBounds.maxX - referenceBounds.minX + 1;
        const referenceHeight = referenceBounds.maxY - referenceBounds.minY + 1;
        const referenceBottomPadding = Math.max(2, frameHeight - referenceBounds.maxY - 1);
        const targetMaxWidth = Math.min(frameWidth - 8, Math.max(referenceWidth + 8, 56));
        const targetMaxHeight = Math.min(frameHeight - 6, Math.max(referenceHeight + 8, 78));

        const out = document.createElement('canvas');
        out.width = frameWidth * columns;
        out.height = frameHeight * rows;
        const outCtx = out.getContext('2d', { willReadFrequently: true });
        outCtx.clearRect(0, 0, out.width, out.height);
        outCtx.imageSmoothingEnabled = true;
        outCtx.imageSmoothingQuality = 'high';

        const cellHeight = sourceImage.height / rows;

        const sourceFrameBounds = () => {
          const canvas = document.createElement('canvas');
          canvas.width = sourceImage.width;
          canvas.height = sourceImage.height;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(sourceImage, 0, 0);
          const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          const isForeground = (x, y) => {
            const index = (y * canvas.width + x) * 4;
            const r = pixels[index];
            const g = pixels[index + 1];
            const b = pixels[index + 2];
            return !(g > 96 && g > r * 1.22 && g > b * 1.22);
          };

          return Array.from({ length: rows }, (_, row) => {
            const rowTop = Math.max(0, Math.floor(row * cellHeight));
            const rowBottom = Math.min(canvas.height, Math.ceil((row + 1) * cellHeight));
            const columnCounts = Array.from({ length: canvas.width }, () => 0);

            for (let y = rowTop; y < rowBottom; y += 1) {
              for (let x = 0; x < canvas.width; x += 1) {
                if (isForeground(x, y)) columnCounts[x] += 1;
              }
            }

            const smoothedCounts = columnCounts.map((_, x) => {
              let total = 0;
              for (let sx = Math.max(0, x - 4); sx <= Math.min(canvas.width - 1, x + 4); sx += 1) {
                total += columnCounts[sx];
              }
              return total / 9;
            });
            const threshold = Math.max(5, Math.round((rowBottom - rowTop) * 0.03));
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
                y: rowTop,
                width: canvas.width / columns,
                height: rowBottom - rowTop,
                rowTop,
                rowBottom,
              }));
            }

            return selectedRuns.map((run) => {
              const rowCounts = Array.from({ length: rowBottom - rowTop }, () => 0);
              for (let y = rowTop; y < rowBottom; y += 1) {
                for (let x = run.start; x <= run.end; x += 1) {
                  if (isForeground(x, y)) rowCounts[y - rowTop] += 1;
                }
              }
              const smoothedRows = rowCounts.map((_, y) => {
                let total = 0;
                let samples = 0;
                for (let sy = Math.max(0, y - 3); sy <= Math.min(rowCounts.length - 1, y + 3); sy += 1) {
                  total += rowCounts[sy];
                  samples += 1;
                }
                return total / samples;
              });
              const rowRunThreshold = Math.max(2, Math.round((run.end - run.start + 1) * 0.018));
              const rowRuns = [];
              let verticalStart = null;
              for (let y = 0; y < smoothedRows.length; y += 1) {
                if (smoothedRows[y] >= rowRunThreshold && verticalStart === null) {
                  verticalStart = y;
                } else if ((smoothedRows[y] < rowRunThreshold || y === smoothedRows.length - 1) && verticalStart !== null) {
                  const verticalEnd = smoothedRows[y] < rowRunThreshold ? y - 1 : y;
                  if (verticalEnd - verticalStart > 5) rowRuns.push({ start: verticalStart, end: verticalEnd });
                  verticalStart = null;
                }
              }
              for (let index = 1; index < rowRuns.length; index += 1) {
                const previous = rowRuns[index - 1];
                const current = rowRuns[index];
                if (current.start - previous.end <= 8) {
                  previous.end = current.end;
                  rowRuns.splice(index, 1);
                  index -= 1;
                }
              }
              const mainRowRun = rowRuns
                .map((candidate) => ({
                  ...candidate,
                  weight: rowCounts
                    .slice(candidate.start, candidate.end + 1)
                    .reduce((total, count) => total + count, 0),
                }))
                .sort((a, b) => b.weight - a.weight)[0];
              const verticalPadding = 4;
              const scanTop = mainRowRun
                ? Math.max(rowTop, rowTop + mainRowRun.start - verticalPadding)
                : rowTop;
              const scanBottom = mainRowRun
                ? Math.min(rowBottom, rowTop + mainRowRun.end + verticalPadding + 1)
                : rowBottom;
              let minX = canvas.width;
              let minY = scanBottom;
              let maxX = -1;
              let maxY = -1;
              for (let y = scanTop; y < scanBottom; y += 1) {
                for (let x = run.start; x <= run.end; x += 1) {
                  if (!isForeground(x, y)) continue;
                  minX = Math.min(minX, x);
                  minY = Math.min(minY, y);
                  maxX = Math.max(maxX, x);
                  maxY = Math.max(maxY, y);
                }
              }
              if (maxX < minX || maxY < minY) {
                minX = run.start;
                minY = rowTop;
                maxX = run.end;
                maxY = rowBottom - 1;
              }
              return {
                x: minX,
                y: minY,
                width: Math.max(1, maxX - minX + 1),
                height: Math.max(1, maxY - minY + 1),
                rowTop,
                rowBottom,
              };
            });
          });
        };

        const frameBounds = sourceFrameBounds();

        for (let row = 0; row < rows; row += 1) {
          for (let column = 0; column < columns; column += 1) {
            const bounds = frameBounds[row][column];
            const sourcePaddingX = Math.max(8, Math.round(bounds.width * 0.08));
            const sourcePaddingY = Math.max(8, Math.round(bounds.height * 0.08));
            const cropX = Math.max(0, bounds.x - sourcePaddingX);
            const cropY = Math.max(bounds.rowTop, bounds.y - sourcePaddingY);
            const cropRight = Math.min(sourceImage.width, bounds.x + bounds.width + sourcePaddingX);
            const cropBottom = Math.min(bounds.rowBottom, bounds.y + bounds.height + sourcePaddingY);
            const cropWidth = Math.max(1, cropRight - cropX);
            const cropHeight = Math.max(1, cropBottom - cropY);
            const scale = Math.min(targetMaxWidth / cropWidth, targetMaxHeight / cropHeight);
            const drawWidth = Math.max(1, Math.round(cropWidth * scale));
            const drawHeight = Math.max(1, Math.round(cropHeight * scale));
            const drawX = Math.round((frameWidth - drawWidth) / 2) + (column * frameWidth);
            const drawY = Math.round(frameHeight - referenceBottomPadding - drawHeight) + (row * frameHeight);

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
      },
      {
        referenceDataUrl: `data:image/png;base64,${reference.toString('base64')}`,
        sourceDataUrl: `data:image/png;base64,${source.toString('base64')}`,
        frameWidth: FRAME_WIDTH,
        frameHeight: FRAME_HEIGHT,
        columns: COLUMNS,
        rows: ROWS,
      },
    );

    await mkdir(path.dirname(outputPath), { recursive: true });
    const base64 = outputDataUrl.replace(/^data:image\/png;base64,/, '');
    await writeFile(outputPath, Buffer.from(base64, 'base64'));
    console.log(`wrote ${path.relative(ROOT, outputPath)}`);
  }
} finally {
  await browser.close();
}
