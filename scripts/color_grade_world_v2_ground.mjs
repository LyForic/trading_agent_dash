import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const [, , sourcePath, referencePath, outPath, ...options] = process.argv;
if (!sourcePath || !referencePath || !outPath) {
  throw new Error('Usage: node scripts/color_grade_world_v2_ground.mjs <source.png> <reference.png> <out.png> [--strength=0.65]');
}

const optionMap = new Map(options.map((option) => {
  const [key, value] = option.replace(/^--/, '').split('=');
  return [key, value ?? 'true'];
}));
const strength = Number(optionMap.get('strength') ?? 0.65);
const saturationBoost = Number(optionMap.get('saturation') ?? 1.12);
const warmth = Number(optionMap.get('warmth') ?? 0.055);
const lift = Number(optionMap.get('lift') ?? 8);
const gamma = Number(optionMap.get('gamma') ?? 0.9);

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const crcTable = new Uint32Array(256).map((_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
  }
  return crc >>> 0;
});

const source = readPng(sourcePath);
const reference = readPng(referencePath);
if (source.width !== reference.width || source.height !== reference.height) {
  throw new Error('Source and reference must have the same dimensions');
}

const sourceStats = rgbStats(source);
const referenceStats = rgbStats(reference);
const output = {
  width: source.width,
  height: source.height,
  data: Buffer.alloc(source.data.length),
};

for (let offset = 0; offset < source.data.length; offset += 4) {
  const original = [
    source.data[offset],
    source.data[offset + 1],
    source.data[offset + 2],
  ];

  const matched = original.map((channel, index) => {
    const normalized = (channel - sourceStats.mean[index]) / Math.max(1, sourceStats.std[index]);
    return referenceStats.mean[index] + (normalized * referenceStats.std[index]);
  });

  const graded = original.map((channel, index) => lerp(channel, matched[index], strength));
  let [r, g, b] = graded;

  r = applyGammaAndLift(r, gamma, lift);
  g = applyGammaAndLift(g, gamma, lift);
  b = applyGammaAndLift(b, gamma, lift * 0.55);

  r *= 1 + warmth;
  g *= 1 + (warmth * 0.28);
  b *= 1 - (warmth * 0.5);

  const luma = (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
  r = luma + ((r - luma) * saturationBoost);
  g = luma + ((g - luma) * saturationBoost);
  b = luma + ((b - luma) * saturationBoost);

  output.data[offset] = clampByte(r);
  output.data[offset + 1] = clampByte(g);
  output.data[offset + 2] = clampByte(b);
  output.data[offset + 3] = source.data[offset + 3];
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
writePng(outPath, output);

function rgbStats(image) {
  const sum = [0, 0, 0];
  const squared = [0, 0, 0];
  const count = image.width * image.height;
  for (let offset = 0; offset < image.data.length; offset += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      const value = image.data[offset + channel];
      sum[channel] += value;
      squared[channel] += value * value;
    }
  }

  const mean = sum.map((value) => value / count);
  const std = squared.map((value, index) => Math.sqrt(Math.max(0, (value / count) - (mean[index] * mean[index]))));
  return { mean, std };
}

function applyGammaAndLift(value, gammaValue, liftValue) {
  return (255 * ((clamp(value, 0, 255) / 255) ** gammaValue)) + liftValue;
}

function lerp(start, end, amount) {
  return start + ((end - start) * amount);
}

function clampByte(value) {
  return Math.round(clamp(value, 0, 255));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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
