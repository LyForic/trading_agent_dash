import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FRAME_WIDTH = 96;
const FRAME_HEIGHT = 112;
const COLUMNS = 6;
const ROWS = 4;

const SOURCES = [
  {
    slug: 'bacon-idle',
    source: 'private/world-v2/actors/walk/raw/bacon-idle-walk-source-v2.png',
    actor: 'public/world-v2/actors/bacon-idle.png',
    walk: 'public/world-v2/actors/walk/bacon-idle-walk.png',
    targetWidth: 76,
    targetHeight: 100,
    sideTargetWidth: 58,
    bottomPadding: 6,
  },
  {
    slug: 'bacon-helper-idle',
    source: 'private/world-v2/actors/walk/raw/bacon-helper-idle-walk-source-v2.png',
    actor: 'public/world-v2/actors/bacon-helper-idle.png',
    walk: 'public/world-v2/actors/walk/bacon-helper-idle-walk.png',
    targetWidth: 74,
    targetHeight: 96,
    sideTargetWidth: 58,
    bottomPadding: 6,
  },
  {
    slug: 'bacon-helper-basket',
    source: 'private/world-v2/actors/walk/raw/bacon-helper-basket-walk-source-v2.png',
    actor: 'public/world-v2/actors/bacon-helper-basket.png',
    walk: 'public/world-v2/actors/walk/bacon-helper-basket-walk.png',
    targetWidth: 78,
    targetHeight: 96,
    sideTargetWidth: 60,
    bottomPadding: 6,
  },
  {
    slug: 'bacon-helper-stir',
    source: 'private/world-v2/actors/walk/raw/bacon-helper-stir-walk-source-v2.png',
    actor: 'public/world-v2/actors/bacon-helper-stir.png',
    walk: 'public/world-v2/actors/walk/bacon-helper-stir-walk.png',
    targetWidth: 76,
    targetHeight: 96,
    sideTargetWidth: 60,
    bottomPadding: 6,
  },
];

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const crcTable = new Uint32Array(256).map((_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

for (const source of SOURCES) {
  const image = readPng(path.join(ROOT, source.source));
  const detectedFrames = detectFrameBounds(image);
  const walkSheet = {
    width: FRAME_WIDTH * COLUMNS,
    height: FRAME_HEIGHT * ROWS,
    data: Buffer.alloc(FRAME_WIDTH * COLUMNS * FRAME_HEIGHT * ROWS * 4),
  };
  let firstFrame = null;

  for (let row = 0; row < ROWS; row += 1) {
    for (let column = 0; column < COLUMNS; column += 1) {
      const frame = fitSourceCellToFrame(image, source, detectedFrames[row][column]);
      removeStrayEdgeComponents(frame);
      if (row === 1 || row === 2) {
        normalizeSideFrame(frame, source);
        removeStrayEdgeComponents(frame);
      }
      pasteImage(walkSheet, frame, column * FRAME_WIDTH, row * FRAME_HEIGHT);
      if (row === 0 && column === 0) firstFrame = frame;
    }
  }

  if (!firstFrame) throw new Error(`Could not extract first frame for ${source.slug}`);

  writePng(path.join(ROOT, source.actor), firstFrame);
  writePng(path.join(ROOT, source.walk), walkSheet);
  console.log(`wrote ${source.actor} and ${source.walk}`);
}

function fitSourceCellToFrame(image, profile, bounds) {
  const paddingX = Math.max(8, Math.round(bounds.width * 0.08));
  const paddingY = Math.max(8, Math.round(bounds.height * 0.08));
  const crop = {
    x: Math.max(0, bounds.x - paddingX),
    y: Math.max(0, bounds.y - paddingY),
    width: Math.min(image.width, bounds.x + bounds.width + paddingX) - Math.max(0, bounds.x - paddingX),
    height: Math.min(image.height, bounds.y + bounds.height + paddingY) - Math.max(0, bounds.y - paddingY),
  };
  const scale = Math.min(profile.targetWidth / bounds.width, profile.targetHeight / bounds.height);
  const foregroundCenterX = ((bounds.x + bounds.x + bounds.width) / 2) - crop.x;
  const foregroundBottom = bounds.y + bounds.height - crop.y;
  const destX = Math.round((FRAME_WIDTH / 2) - (foregroundCenterX * scale));
  const destY = Math.round(FRAME_HEIGHT - profile.bottomPadding - (foregroundBottom * scale));
  const frame = {
    width: FRAME_WIDTH,
    height: FRAME_HEIGHT,
    data: Buffer.alloc(FRAME_WIDTH * FRAME_HEIGHT * 4),
  };

  drawScaledCrop(frame, image, crop, destX, destY, scale);
  trimEdgeKeyPixels(frame);
  return frame;
}

function normalizeSideFrame(frame, profile) {
  const bounds = imageAlphaBounds(frame);
  if (!bounds) return;

  const targetSideHeight = profile.targetHeight;
  const scaleY = Math.min(1.26, targetSideHeight / bounds.height);
  const scaleX = profile.sideTargetWidth / bounds.width;
  const target = {
    width: frame.width,
    height: frame.height,
    data: Buffer.alloc(frame.width * frame.height * 4),
  };
  const drawWidth = Math.round(bounds.width * scaleX);
  const drawHeight = Math.round(bounds.height * scaleY);
  const drawX = Math.round((FRAME_WIDTH - drawWidth) / 2);
  const drawY = Math.max(4, Math.round(FRAME_HEIGHT - profile.bottomPadding - drawHeight));

  for (let y = 0; y < drawHeight; y += 1) {
    const sourceY = bounds.y + ((y + 0.5) / scaleY) - 0.5;
    const targetY = drawY + y;
    if (targetY < 0 || targetY >= target.height) continue;

    for (let x = 0; x < drawWidth; x += 1) {
      const sourceX = bounds.x + ((x + 0.5) / scaleX) - 0.5;
      const targetX = drawX + x;
      if (targetX < 0 || targetX >= target.width) continue;
      const pixel = sampleBilinear(frame, sourceX, sourceY);
      if (pixel.a <= 2) continue;
      blendPixel(target, targetX, targetY, pixel);
    }
  }

  target.data.copy(frame.data);
}

function imageAlphaBounds(image) {
  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const alpha = image.data[((y * image.width) + x) * 4 + 3];
      if (alpha <= 0) continue;
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

function removeStrayEdgeComponents(image) {
  const components = alphaComponents(image);
  if (components.length <= 1) return;

  const largest = components[0];
  for (const component of components.slice(1)) {
    const separatedVertically = component.maxY < largest.minY - 2 || component.minY > largest.maxY + 2;
    if (component.pixels.length < largest.pixels.length * 0.08 && separatedVertically) {
      for (const pixel of component.pixels) {
        image.data[((pixel.y * image.width) + pixel.x) * 4 + 3] = 0;
      }
    }
  }
}

function alphaComponents(image) {
  const visited = new Uint8Array(image.width * image.height);
  const components = [];
  const queue = [];

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const start = (y * image.width) + x;
      if (visited[start] || image.data[start * 4 + 3] <= 0) continue;

      visited[start] = 1;
      queue.length = 0;
      queue.push({ x, y });
      const pixels = [];
      let minX = x;
      let minY = y;
      let maxX = x;
      let maxY = y;

      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const point = queue[cursor];
        pixels.push(point);
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);

        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = point.x + dx;
          const ny = point.y + dy;
          if (nx < 0 || nx >= image.width || ny < 0 || ny >= image.height) continue;
          const next = (ny * image.width) + nx;
          if (visited[next] || image.data[next * 4 + 3] <= 0) continue;
          visited[next] = 1;
          queue.push({ x: nx, y: ny });
        }
      }

      components.push({ pixels, minX, minY, maxX, maxY });
    }
  }

  return components.sort((left, right) => right.pixels.length - left.pixels.length);
}

function detectFrameBounds(image) {
  return Array.from({ length: ROWS }, (_, row) => {
    const rowTop = Math.floor((row * image.height) / ROWS);
    const rowBottom = Math.floor(((row + 1) * image.height) / ROWS);
    const rowHeight = rowBottom - rowTop;
    const columnCounts = Array.from({ length: image.width }, () => 0);

    for (let y = rowTop; y < rowBottom; y += 1) {
      for (let x = 0; x < image.width; x += 1) {
        if (keyedPixelAt(image, x, y).a > 12) columnCounts[x] += 1;
      }
    }

    const smoothedCounts = columnCounts.map((_, x) => {
      let total = 0;
      let samples = 0;
      for (let sx = Math.max(0, x - 4); sx <= Math.min(image.width - 1, x + 4); sx += 1) {
        total += columnCounts[sx];
        samples += 1;
      }
      return total / samples;
    });
    const threshold = Math.max(5, Math.round(rowHeight * 0.03));
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
      .sort((left, right) => right.width - left.width)
      .slice(0, COLUMNS)
      .sort((left, right) => ((left.start + left.end) / 2) - ((right.start + right.end) / 2));

    if (selectedRuns.length !== COLUMNS) {
      return Array.from({ length: COLUMNS }, (_, column) => (
        foregroundBounds(image, sourceCellBounds(image, column, row)) ?? sourceCellBounds(image, column, row)
      ));
    }

    return selectedRuns.map((run) => {
      const scan = {
        x: Math.max(0, run.start - 8),
        y: rowTop,
        width: Math.min(image.width, run.end + 9) - Math.max(0, run.start - 8),
        height: rowBottom - rowTop,
      };
      return foregroundBounds(image, scan) ?? scan;
    });
  });
}

function sourceCellBounds(image, column, row) {
  const x = Math.floor((column * image.width) / COLUMNS);
  const y = Math.floor((row * image.height) / ROWS);
  const right = Math.floor(((column + 1) * image.width) / COLUMNS);
  const bottom = Math.floor(((row + 1) * image.height) / ROWS);
  return {
    x,
    y,
    width: right - x,
    height: bottom - y,
  };
}

function foregroundBounds(image, rect) {
  let minX = rect.x + rect.width;
  let minY = rect.y + rect.height;
  let maxX = rect.x - 1;
  let maxY = rect.y - 1;

  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      const pixel = keyedPixelAt(image, x, y);
      if (pixel.a <= 12) continue;
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

function drawScaledCrop(target, source, crop, destX, destY, scale) {
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
      const pixel = sampleBilinear(source, sourceX, sourceY);
      if (pixel.a <= 2) continue;
      blendPixel(target, targetX, targetY, pixel);
    }
  }
}

function sampleBilinear(image, x, y) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = x - x0;
  const ty = y - y0;
  const samples = [
    { pixel: keyedPixelAt(image, x0, y0), weight: (1 - tx) * (1 - ty) },
    { pixel: keyedPixelAt(image, x0 + 1, y0), weight: tx * (1 - ty) },
    { pixel: keyedPixelAt(image, x0, y0 + 1), weight: (1 - tx) * ty },
    { pixel: keyedPixelAt(image, x0 + 1, y0 + 1), weight: tx * ty },
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

function keyedPixelAt(image, x, y) {
  if (x < 0 || x >= image.width || y < 0 || y >= image.height) return { r: 0, g: 0, b: 0, a: 0 };
  const offset = ((Math.round(y) * image.width) + Math.round(x)) * 4;
  const r = image.data[offset];
  const g = image.data[offset + 1];
  const b = image.data[offset + 2];
  const a = image.data[offset + 3];
  if (a <= 8 || isChromaGreen(r, g, b)) return { r: 0, g: 0, b: 0, a: 0 };
  return {
    r,
    g: g > r * 1.08 && g > b * 1.08 ? Math.max(r, b) : g,
    b,
    a,
  };
}

function isChromaGreen(r, g, b) {
  return g > 82 && g > r * 1.14 && g > b * 1.14;
}

function trimEdgeKeyPixels(image) {
  for (let index = 0; index < image.data.length; index += 4) {
    const r = image.data[index];
    const g = image.data[index + 1];
    const b = image.data[index + 2];
    if (isChromaGreen(r, g, b)) {
      image.data[index + 3] = 0;
    }
  }
}

function blendPixel(image, x, y, pixel) {
  const offset = ((y * image.width) + x) * 4;
  const sourceAlpha = pixel.a / 255;
  const targetAlpha = image.data[offset + 3] / 255;
  const outAlpha = sourceAlpha + (targetAlpha * (1 - sourceAlpha));
  if (outAlpha <= 0) return;

  image.data[offset] = clampByte(((pixel.r * sourceAlpha) + (image.data[offset] * targetAlpha * (1 - sourceAlpha))) / outAlpha);
  image.data[offset + 1] = clampByte(((pixel.g * sourceAlpha) + (image.data[offset + 1] * targetAlpha * (1 - sourceAlpha))) / outAlpha);
  image.data[offset + 2] = clampByte(((pixel.b * sourceAlpha) + (image.data[offset + 2] * targetAlpha * (1 - sourceAlpha))) / outAlpha);
  image.data[offset + 3] = clampByte(outAlpha * 255);
}

function pasteImage(target, source, targetX, targetY) {
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const sourceOffset = ((y * source.width) + x) * 4;
      const targetOffset = (((targetY + y) * target.width) + targetX + x) * 4;
      target.data[targetOffset] = source.data[sourceOffset];
      target.data[targetOffset + 1] = source.data[sourceOffset + 1];
      target.data[targetOffset + 2] = source.data[sourceOffset + 2];
      target.data[targetOffset + 3] = source.data[sourceOffset + 3];
    }
  }
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
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
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
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
