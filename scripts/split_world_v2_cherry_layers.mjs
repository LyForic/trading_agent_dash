import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public/world-v2/foreground');

const trees = ['cherry-tree-large', 'cherry-tree-small'];

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const crcTable = new Uint32Array(256).map((_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
  }
  return crc >>> 0;
});

function main() {
  for (const tree of trees) {
    const source = readPng(path.join(outDir, `${tree}.png`));
    const layers = splitCherryTree(source);
    for (const [name, data] of Object.entries(layers.data)) {
      writePng(path.join(outDir, `${tree}-${name}.png`), {
        width: source.width,
        height: source.height,
        data,
      });
    }
    console.log(`Split ${tree} into ${JSON.stringify(layers.counts)}`);
  }
}

function splitCherryTree(source) {
  const data = {
    canopy: Buffer.alloc(source.data.length),
    trunk: Buffer.alloc(source.data.length),
    base: Buffer.alloc(source.data.length),
  };
  const counts = { canopy: 0, trunk: 0, base: 0, dropped: 0 };

  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const offset = ((y * source.width) + x) * 4;
      const r = source.data[offset];
      const g = source.data[offset + 1];
      const b = source.data[offset + 2];
      const alpha = cleanedAlpha(r, g, b, source.data[offset + 3]);
      if (alpha < 4) {
        counts.dropped += 1;
        continue;
      }

      const target = chooseCherryLayer(source, r, g, b, y);
      const targetData = data[target];
      targetData[offset] = r;
      targetData[offset + 1] = g;
      targetData[offset + 2] = b;
      targetData[offset + 3] = alpha;
      counts[target] += 1;
    }
  }

  return { data, counts };
}

function chooseCherryLayer(source, r, g, b, y) {
  const trunkStart = Math.round(source.height * 0.33);
  const baseStart = Math.round(source.height * 0.745);
  const isBrown = r > 38 && r < 185 && g > 18 && g < 128 && b < 105 && r >= g * 0.8 && r > b * 0.9;
  const isDarkBranch = r < 95 && g < 75 && b < 85 && y > trunkStart - 8;
  const isGroundBase = y >= baseStart && !isBrown && !isDarkBranch;

  if ((isBrown || isDarkBranch) && y >= trunkStart) return 'trunk';
  if (isGroundBase) return 'base';
  return 'canopy';
}

function cleanedAlpha(r, g, b, alpha) {
  if (alpha === 0) return 0;
  const isChromaFringe = r > 215 && b > 215 && g < 55 && Math.abs(r - b) < 65;
  return isChromaFringe ? 0 : alpha;
}

function readPng(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (!buffer.subarray(0, 8).equals(pngSignature)) {
    throw new Error(`${filePath} is not a PNG`);
  }

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

  if (bitDepth !== 8 || colorType !== 6) {
    throw new Error(`${filePath} must be an 8-bit RGBA PNG`);
  }

  return {
    width,
    height,
    data: unfilterPngData(zlib.inflateSync(Buffer.concat(idat)), width, height),
  };
}

function unfilterPngData(raw, width, height) {
  const stride = width * 4;
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
      const left = x >= 4 ? current[x - 4] : 0;
      const up = previous[x];
      const upperLeft = x >= 4 ? previous[x - 4] : 0;
      current[x] = reconstructPngByte(filter, value, left, up, upperLeft);
    }

    current.copy(pixels, y * stride);
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
