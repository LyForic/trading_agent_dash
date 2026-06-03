import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = path.join(root, 'public/world-v2/runtime/manifest-bacon-fullmap/sprite-index.json');
const fullMapBounds = { x: -1024, y: 0, width: 2560, height: 1536 };
const variants = {
  sunset: {
    src: '/world-v2/layers/generated-candidates/fullmap-sunset-gpt2-v2.png',
    sourceDrawOffsetX: -70,
  },
  night: {
    src: '/world-v2/layers/generated-candidates/fullmap-night-gpt2-v2.png',
    sourceDrawOffsetX: 0,
  },
};

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const crcTable = new Uint32Array(256).map((_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function main() {
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const sprites = index.sprites ?? [];
  if (sprites.length === 0) throw new Error(`${indexPath} has no sprites`);

  for (const [variant, config] of Object.entries(variants)) {
    const fullMap = readFullMap(config.src);
    const outDir = path.join(root, 'public/world-v2/runtime/manifest-bacon-fullmap/generated-sprites', variant);
    fs.rmSync(outDir, { recursive: true, force: true });
    fs.mkdirSync(outDir, { recursive: true });

    for (const sprite of sprites) {
      const daySprite = readPng(path.join(root, 'public', sprite.sprite.replace(/^\/+/, '')));
      const output = cropVariantSprite(fullMap, daySprite, sprite, config.sourceDrawOffsetX);
      writePng(path.join(outDir, `${sprite.id}.png`), output);
    }

    console.log(`Built ${sprites.length} ${variant} manifest runtime sprites at ${path.relative(root, outDir)}`);
  }
}

function readFullMap(src) {
  const filePath = path.join(root, 'public', src.replace(/^\/+/, ''));
  const image = readPng(filePath);
  if (image.width !== fullMapBounds.width || image.height !== fullMapBounds.height) {
    throw new Error(`${src} must be ${fullMapBounds.width}x${fullMapBounds.height}`);
  }
  return image;
}

function cropVariantSprite(fullMap, daySprite, sprite, sourceDrawOffsetX) {
  const output = {
    width: daySprite.width,
    height: daySprite.height,
    data: Buffer.alloc(daySprite.width * daySprite.height * 4),
  };
  const drawX = fullMapBounds.x + sourceDrawOffsetX;

  for (let y = 0; y < output.height; y += 1) {
    for (let x = 0; x < output.width; x += 1) {
      const targetOffset = ((y * output.width) + x) * 4;
      const alpha = daySprite.data[targetOffset + 3];
      if (alpha === 0) continue;

      const sourceX = Math.round(sprite.x + x - drawX);
      const sourceY = Math.round(sprite.y + y - fullMapBounds.y);
      if (sourceX < 0 || sourceX >= fullMap.width || sourceY < 0 || sourceY >= fullMap.height) continue;

      const sourceOffset = ((sourceY * fullMap.width) + sourceX) * 4;
      output.data[targetOffset] = fullMap.data[sourceOffset];
      output.data[targetOffset + 1] = fullMap.data[sourceOffset + 1];
      output.data[targetOffset + 2] = fullMap.data[sourceOffset + 2];
      output.data[targetOffset + 3] = alpha;
    }
  }

  return output;
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
