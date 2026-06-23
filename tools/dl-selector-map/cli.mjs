#!/usr/bin/env node
// DevLens selector-map generator.
// Scans an Angular project's *.component.ts files and writes a selector → "relpath:line"
// map that the DevLens extension fetches to power "Open in IDE". DEV ONLY.
//
// Usage:
//   node tools/dl-selector-map/cli.mjs [srcDir] [outFile]
// Defaults:
//   srcDir  = "src"
//   outFile = "src/assets/devlens-map.json"
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { buildMap } from './scan.mjs';

const srcDir = path.resolve(process.argv[2] ?? 'src');
const outFile = path.resolve(process.argv[3] ?? 'src/assets/devlens-map.json');
const rootDir = process.cwd();

function walk(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) found.push(...walk(full));
    else if (entry.endsWith('.component.ts')) found.push(full);
  }
  return found;
}

const files = walk(srcDir).map((fileName) => ({ fileName, code: readFileSync(fileName, 'utf8') }));
const map = buildMap(files, rootDir);

mkdirSync(path.dirname(outFile), { recursive: true });
writeFileSync(outFile, JSON.stringify(map, null, 2));

console.log(`DevLens: indexed ${Object.keys(map).length} selectors from ${files.length} files → ${outFile}`);
