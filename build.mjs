import { build } from 'esbuild';
import { mkdir, rm, copyFile, writeFile, readFile, cp } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith('--')); // 'chromium' | 'firefox'
if (!['chromium', 'firefox'].includes(target)) {
  console.error('Usage: node build.mjs <chromium|firefox> [--prod|--dev]');
  process.exit(1);
}
// Default is dev (readable). --prod minifies the shipped JS.
const prod = args.includes('--prod');

const outdir = `dist/${target}`;
await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

await build({
  entryPoints: {
    background: 'src/background.ts',
    content: 'src/content/entry.ts',
    bridge: 'src/bridge/main.ts',
    options: 'src/options/options.ts',
  },
  bundle: true,
  format: 'iife',
  target: 'es2021',
  outdir,
  minify: prod,
  logLevel: 'info',
});

await copyFile('src/options/options.html', `${outdir}/options.html`);
if (existsSync('icons')) await cp('icons', `${outdir}/icons`, { recursive: true });
const manifest = await readFile(`manifest.${target}.json`, 'utf8');
await writeFile(`${outdir}/manifest.json`, manifest);

console.log(`Built ${target} (${prod ? 'prod/minified' : 'dev/readable'}) → ${outdir}`);
if (!existsSync(`${outdir}/manifest.json`)) process.exit(1);
