#!/usr/bin/env node
// DevLens API-map generator. Scans an Angular project's *.ts files and writes a
// selector -> [{service, method, path}] map for the "API call mapping" feature. DEV ONLY.
//
// Usage: node tools/dl-api-map/cli.mjs [srcDir] [outFile]
// Defaults: srcDir = "src", outFile = "src/assets/devlens-api-map.json"
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { buildApiMap } from './scan.mjs';

const srcDir = path.resolve(process.argv[2] ?? 'src');
const outFile = path.resolve(process.argv[3] ?? 'src/assets/devlens-api-map.json');

function walk(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...walk(full));
    else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts') && !entry.endsWith('.d.ts')) found.push(full);
  }
  return found;
}

const files = walk(srcDir).map((fileName) => ({ fileName, code: readFileSync(fileName, 'utf8') }));
const map = buildApiMap(files);

mkdirSync(path.dirname(outFile), { recursive: true });
writeFileSync(outFile, JSON.stringify(map, null, 2));

const serviceCount = Object.keys(map.services).length;
const componentCount = Object.keys(map.components).length;
console.log(
  `DevLens API map: ${componentCount} components, ${serviceCount} services from ${files.length} files → ${outFile}`,
);
