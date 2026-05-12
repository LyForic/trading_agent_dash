import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(root, 'private/world-v2/source/generated-props-sheet.png');
const outDir = path.join(root, 'public/world-v2/foreground');

const sprites = {
  bench: [460, 789, 548, 864],
  'low-fence': [580, 789, 675, 864],
};

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const crcTable = new Uint32Array(256).map((_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
  }
  return crc >>> 0;
});

function main() {
  const sheet = readPng(sourcePath);
  for (const [name, bbox] of Object.entries(sprites)) {
    const image = cropKeyed(sheet, bbox);
    writePng(path.join(outDir, `${name}.png`), image);
    console.log(`Wrote ${name}.png ${image.width}x${image.height}`);
  }
}

function cropKeyed(source, [x1, y1, x2, y2]) {
  const width = x2 - x1;
  const height = y2 - y1;
  const data = Buffer.alloc(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceOffset = (((y1 + y) * source.width) + x1 + x) * source.channels;
      const targetOffset = ((y * width) + x) * 4;
      const r = source.data[sourceOffset];
      const g = source.data[sourceOffset + 1];
      const b = source.data[sourceOffset + 2];
      const alpha = isChromaLike(r, g, b) ? 0 : 255;
      data[targetOffset] = alpha === 0 ? 0 : r;
      data[targetOffset + 1] = alpha === 0 ? 0 : g;
      data[targetOffset + 2] = alpha === 0 ? 0 : b;
      data[targetOffset + 3] = alpha;
    }
  }

  return trimTransparent({ width, height, data });
}

function trimTransparent(image) {
  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const alpha = image.data[((y * image.width) + x) * 4 + 3];
      if (alpha === 0) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) return image;
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceOffset = (((minY + y) * image.width) + minX + x) * 4;
      const targetOffset = ((y * width) + x) * 4;
      image.data.copy(data, targetOffset, sourceOffset, sourceOffset + 4);
    }
  }
  return { width, height, data };
}

function isChromaLike(r, g, b) {
  return r > 135 && b > 120 && g < 145 && Math.abs(r - b) < 125 && (r + b - g * 2) > 110;
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
    channels,
    data: unfilterPngData(zlib.inflateSync(Buffer.concat(idat)), width, height, channels),
  };
}

function unfilterPngData(raw, width, height, channels) {
  const stride = width * channels;
  const pixels = Buffer.alloc(width * height * channels);
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
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

main();
