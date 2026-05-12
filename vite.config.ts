import type {} from 'vitest/config';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import fs from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import type { Plugin } from 'vite';

const ENABLE_WORLD_V2_EDITOR_API = process.env.WORLD_V2_ENABLE_EDITOR_API === '1';
const EDITOR_WRITE_HEADER = 'x-world-v2-editor';
const MAX_JSON_BODY_BYTES = 1_000_000;
const MAX_SPRITE_BODY_BYTES = 8_000_000;
const WORLD_V2_PRIVATE_SOURCE_DIR = path.resolve(__dirname, 'private/world-v2/source');
const WORLD_V2_PRIVATE_ACTOR_WALK_DIR = path.resolve(__dirname, 'private/world-v2/actors/walk');
const WORLD_V2_PRIVATE_SPRITE_PILOT_DIR = path.resolve(WORLD_V2_PRIVATE_ACTOR_WALK_DIR, 'pilots');

function sendJson(res: ServerResponse, statusCode: number, payload: unknown) {
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(payload));
}

function isLocalHostname(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]';
}

function isLocalEditorRequest(req: IncomingMessage) {
  const hostHeader = req.headers.host;
  if (!hostHeader) return false;

  let host: URL;
  try {
    host = new URL(`http://${hostHeader}`);
  } catch {
    return false;
  }
  if (!isLocalHostname(host.hostname)) return false;

  const originHeader = req.headers.origin;
  if (!originHeader) return true;

  try {
    const origin = new URL(originHeader);
    return isLocalHostname(origin.hostname) && origin.host === host.host;
  } catch {
    return false;
  }
}

function requireEditorWrite(req: IncomingMessage, res: ServerResponse) {
  if (!isLocalEditorRequest(req)) {
    sendJson(res, 403, { ok: false, error: 'Editor API is local-only' });
    return false;
  }
  if (req.headers[EDITOR_WRITE_HEADER] !== '1') {
    sendJson(res, 403, { ok: false, error: 'Missing editor write header' });
    return false;
  }
  const contentType = String(req.headers['content-type'] ?? '');
  if (!contentType.includes('application/json')) {
    sendJson(res, 415, { ok: false, error: 'Expected application/json' });
    return false;
  }
  return true;
}

async function readRequestBody(req: IncomingMessage, maxBytes: number) {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.byteLength;
    if (totalBytes > maxBytes) {
      throw new Error(`Request body exceeds ${maxBytes} bytes`);
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function assertPlainObject(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
}

function contentTypeForPath(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.json') return 'application/json';
  if (ext === '.txt' || ext === '.md') return 'text/plain; charset=utf-8';
  return 'application/octet-stream';
}

function privateFilePathFromRequest(rootDir: string, req: IncomingMessage) {
  const requestUrl = new URL(req.url ?? '/', 'http://local');
  const relativePath = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, '');
  const filePath = path.resolve(rootDir, relativePath);
  const relativeToRoot = path.relative(rootDir, filePath);
  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
    throw new Error('Invalid private asset path');
  }
  return filePath;
}

async function serveLocalPrivateAsset(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
  rootDir: string,
  deniedMessage: string,
) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendJson(res, 405, { ok: false, error: 'Method not allowed' });
    return;
  }
  if (!isLocalEditorRequest(req)) {
    sendJson(res, 403, { ok: false, error: deniedMessage });
    return;
  }

  try {
    const filePath = privateFilePathFromRequest(rootDir, req);
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) {
      next();
      return;
    }
    res.setHeader('cache-control', 'no-store');
    res.setHeader('content-type', contentTypeForPath(filePath));
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    res.end(await fs.readFile(filePath));
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      next();
      return;
    }
    sendJson(res, 400, { ok: false, error: error instanceof Error ? error.message : 'Invalid private asset request' });
  }
}

function worldV2ManifestEditorPlugin(): Plugin {
  const manifestPath = path.resolve(__dirname, 'public/world-v2/maps/world-v2-object-manifest.json');
  const walkCycleGuidePath = path.resolve(WORLD_V2_PRIVATE_ACTOR_WALK_DIR, 'pose-guide.json');
  const spriteCandidateDir = WORLD_V2_PRIVATE_SPRITE_PILOT_DIR;

  return {
    name: 'world-v2-manifest-editor',
    configureServer(server) {
      server.watcher.unwatch(manifestPath);
      server.watcher.unwatch(walkCycleGuidePath);
      server.watcher.add(WORLD_V2_PRIVATE_SOURCE_DIR);
      server.watcher.add(WORLD_V2_PRIVATE_ACTOR_WALK_DIR);

      server.middlewares.use('/world-v2/source', async (req, res, next) => {
        await serveLocalPrivateAsset(req, res, next, WORLD_V2_PRIVATE_SOURCE_DIR, 'Source assets are local-only');
      });

      server.middlewares.use('/world-v2/actors/walk/pilots', async (req, res, next) => {
        await serveLocalPrivateAsset(req, res, next, WORLD_V2_PRIVATE_SPRITE_PILOT_DIR, 'Sprite candidates are local-only');
      });

      server.middlewares.use('/api/world-v2/object-manifest', async (req, res, next) => {
        if (!isLocalEditorRequest(req)) {
          sendJson(res, 403, { ok: false, error: 'Editor API is local-only' });
          return;
        }

        if (req.method === 'GET') {
          try {
            const contents = await fs.readFile(manifestPath, 'utf8');
            res.setHeader('content-type', 'application/json');
            res.end(contents);
          } catch (error) {
            next(error);
          }
          return;
        }

        if (req.method === 'POST') {
          if (!requireEditorWrite(req, res)) return;
          try {
            const raw = await readRequestBody(req, MAX_JSON_BODY_BYTES);
            const parsed = JSON.parse(raw) as unknown;
            assertPlainObject(parsed, 'Manifest');
            if (!Array.isArray(parsed.objects)) {
              throw new Error('Manifest must include an objects array');
            }
            await fs.writeFile(manifestPath, `${JSON.stringify(parsed, null, 2)}\n`);
            sendJson(res, 200, { ok: true });
          } catch (error) {
            sendJson(res, 400, { ok: false, error: error instanceof Error ? error.message : 'Invalid manifest' });
          }
          return;
        }

        next();
      });

      server.middlewares.use('/api/world-v2/walk-cycle-guide', async (req, res, next) => {
        if (!isLocalEditorRequest(req)) {
          sendJson(res, 403, { ok: false, error: 'Editor API is local-only' });
          return;
        }

        if (req.method === 'GET') {
          try {
            const contents = await fs.readFile(walkCycleGuidePath, 'utf8');
            res.setHeader('content-type', 'application/json');
            res.end(contents);
          } catch (error) {
            next(error);
          }
          return;
        }

        if (req.method === 'POST') {
          if (!requireEditorWrite(req, res)) return;
          try {
            const raw = await readRequestBody(req, MAX_JSON_BODY_BYTES);
            const parsed = JSON.parse(raw) as unknown;
            assertPlainObject(parsed, 'Walk-cycle guide');
            if (!Array.isArray(parsed.actors)) {
              throw new Error('Walk-cycle guide must include an actors array');
            }
            await fs.writeFile(walkCycleGuidePath, `${JSON.stringify(parsed, null, 2)}\n`);
            sendJson(res, 200, { ok: true });
          } catch (error) {
            sendJson(res, 400, { ok: false, error: error instanceof Error ? error.message : 'Invalid walk-cycle guide' });
          }
          return;
        }

        next();
      });

      server.middlewares.use('/api/world-v2/sprite-sheet-candidate', async (req, res) => {
        if (req.method !== 'POST') {
          sendJson(res, 405, { ok: false, error: 'Method not allowed' });
          return;
        }
        if (!requireEditorWrite(req, res)) return;

        try {
          const raw = await readRequestBody(req, MAX_SPRITE_BODY_BYTES);
          const parsed = JSON.parse(raw) as { slug?: string; dataUrl?: string };
          if (!parsed.slug || !/^[a-z0-9-]+$/.test(parsed.slug)) {
            throw new Error('Invalid sprite slug');
          }
          const base64 = parsed.dataUrl?.replace(/^data:image\/png;base64,/, '');
          if (!base64 || base64 === parsed.dataUrl) {
            throw new Error('Expected PNG data URL');
          }
          const stamp = new Date().toISOString().replace(/[:.]/g, '-');
          const filename = `${parsed.slug}-manual-edit-${stamp}.png`;
          const filePath = path.join(spriteCandidateDir, filename);
          if (!filePath.startsWith(spriteCandidateDir)) {
            throw new Error('Invalid output path');
          }
          await fs.mkdir(spriteCandidateDir, { recursive: true });
          await fs.writeFile(filePath, Buffer.from(base64, 'base64'));
          sendJson(res, 200, {
            ok: true,
            path: `/world-v2/actors/walk/pilots/${filename}`,
          });
        } catch (error) {
          sendJson(res, 400, { ok: false, error: error instanceof Error ? error.message : 'Invalid sprite sheet candidate' });
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [
    ...(ENABLE_WORLD_V2_EDITOR_API ? [worldV2ManifestEditorPlugin()] : []),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    alias: {
      'framer-motion': path.resolve(__dirname, './src/test/framer-motion-mock.tsx'),
    },
  },
});
