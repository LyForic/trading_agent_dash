/**
 * Renders the four onboarding compositions to public/onboarding/<id>.mp4.
 * Uses the pre-installed system chromium so we don't need to download one.
 *
 *   node scripts/render-onboarding.mjs            # all
 *   node scripts/render-onboarding.mjs roster-pnl # one composition
 */
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const ALL = ['roster-pnl', 'battle-arena', 'trade-log', 'time-of-day'];
const wanted = process.argv.slice(2);
const ids = wanted.length ? wanted : ALL;

const CHROMIUM =
  process.env.CHROMIUM_PATH ??
  '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';

async function main() {
  const outDir = path.join(ROOT, 'public', 'onboarding');
  await fs.mkdir(outDir, { recursive: true });

  console.log('• bundling Remotion entry...');
  const serveUrl = await bundle({
    entryPoint: path.join(ROOT, 'remotion', 'index.ts'),
    publicDir: path.join(ROOT, 'public'),
    webpackOverride: (cfg) => cfg,
  });

  for (const id of ids) {
    console.log(`• rendering ${id}...`);
    const composition = await selectComposition({
      serveUrl,
      id,
      browserExecutable: CHROMIUM,
    });
    const outputLocation = path.join(outDir, `${id}.mp4`);
    await renderMedia({
      composition,
      serveUrl,
      codec: 'h264',
      outputLocation,
      browserExecutable: CHROMIUM,
      chromiumOptions: { ignoreCertificateErrors: false, gl: 'angle' },
      concurrency: 1,
      imageFormat: 'jpeg',
      jpegQuality: 90,
      onProgress: ({ progress }) => {
        process.stdout.write(`\r  ${(progress * 100).toFixed(0)}%   `);
      },
    });
    process.stdout.write(`\r  ✓ ${path.relative(ROOT, outputLocation)}\n`);
  }
  console.log('\n✓ onboarding videos written to public/onboarding/');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
