# DevLens API Call Mapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Git is DISABLED for this project per user instruction.** Each "Checkpoint" step replaces a commit: run the verification, confirm green, move on. Do NOT run `git`/`gh`.

**Goal:** When hovering a component in DevLens inspect mode, show the API endpoints it triggers, derived by static analysis of the project's services and imported into the extension.

**Architecture:** A new dev scanner (`tools/dl-api-map/`) statically maps `selector → [{service, method, path}]` by (1) extracting `this.http.<verb>(base + "literal")` endpoints per service class, then (2) attributing each service's endpoints to every component that injects it. The extension imports that map (storage.local), resolves the nearest *own* component on hover (reusing the breadcrumb walk), and renders an APIs section in the tooltip.

**Tech Stack:** TypeScript, esbuild, Vitest + jsdom, `webextension-polyfill`, the `typescript` compiler API (scanner).

---

## File Structure

```
tools/dl-api-map/scan.mjs        (new: extractEndpoints, extractInjections, buildApiMap)
tools/dl-api-map/scan.d.mts      (new: declarations)
tools/dl-api-map/cli.mjs         (new: walk src, write src/assets/devlens-api-map.json)
tools/dl-api-map/README.md       (new)
src/shared/types.ts              (modify: ApiEndpoint, ApiMap, Settings.showApis/apiLimit, DEFAULT)
src/shared/ide.ts                (modify: nearestSelectorInMap, resolveApisFor; refactor resolveOpenUrlFor)
src/options/map-store.ts         (modify: API_MAP_KEY + api map load/save/clear)
src/content/tooltip.ts           (modify: renderTooltipHTML gains apis param + APIs section)
src/content/controller.ts        (modify: resolveApis dep; pass apis to render)
src/content/entry.ts             (modify: load api map, wire resolveApis, reload on change)
src/options/options.html         (modify: Show APIs checkbox, API limit, API map import)
src/options/options.ts           (modify: numbers binding + API map import controls)
tests/tools/api-map.test.ts      (new)
tests/shared/ide.test.ts         (modify: nearestSelectorInMap + resolveApisFor)
tests/shared/types.test.ts       (modify: DEFAULT_SETTINGS)
tests/content/tooltip.test.ts    (modify: Settings literal + APIs section tests)
tests/content/controller.test.ts (modify: resolveApis dep)
tests/integration/inspect-loop.test.ts (modify: resolveApis dep)
tests/options/map-store.test.ts  (modify: api map round-trip)
```

---

## Task 1: Scanner core (`tools/dl-api-map/scan.mjs`)

**Files:**
- Create: `tools/dl-api-map/scan.mjs`, `tools/dl-api-map/scan.d.mts`
- Test: `tests/tools/api-map.test.ts`

- [ ] **Step 1: Write the failing tests** — `tests/tools/api-map.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { extractEndpoints, extractInjections, buildApiMap } from '../../tools/dl-api-map/scan.mjs';

describe('extractEndpoints', () => {
  it('extracts verb + path from this.http calls, dropping the base URL', () => {
    const code = `export class AnnouncementService {
      baseURL = environment.api;
      constructor(private http: HttpClient) {}
      getAll() { return this.http.get(this.baseURL + "Announcements/GetAll"); }
      add(i) { return this.http.post(this.baseURL + "Announcements/Add", i); }
      del(id) { return this.http.delete(this.baseURL + "Announcements/Delete/" + id); }
    }`;
    expect(extractEndpoints(code, '/p/announcement.service.ts')).toEqual([
      {
        className: 'AnnouncementService',
        endpoints: [
          { method: 'GET', path: 'Announcements/GetAll' },
          { method: 'POST', path: 'Announcements/Add' },
          { method: 'DELETE', path: 'Announcements/Delete/{param}' },
        ],
      },
    ]);
  });

  it('ignores non-http .get calls', () => {
    const code = `export class C { f(form) { return form.get("name"); } }`;
    expect(extractEndpoints(code, '/p/x.ts')).toEqual([]);
  });
});

describe('extractInjections', () => {
  it('returns the selector and injected constructor param type names', () => {
    const code = `@Component({ selector: 'app-x' })
    export class XComponent { constructor(private a: AnnouncementService, private r: Router) {} }`;
    expect(extractInjections(code, '/p/x.component.ts')).toEqual([
      { selector: 'app-x', serviceTypes: ['AnnouncementService', 'Router'] },
    ]);
  });
});

describe('buildApiMap', () => {
  it('maps a component selector to its injected services’ endpoints', () => {
    const files = [
      {
        fileName: '/p/announcement.service.ts',
        code: `export class AnnouncementService { constructor(private http: HttpClient){} a(){return this.http.get(this.baseURL + "Announcements/GetAll");} }`,
      },
      {
        fileName: '/p/x.component.ts',
        code: `@Component({ selector: 'app-x' }) export class XComponent { constructor(private a: AnnouncementService, private r: Router){} }`,
      },
    ];
    expect(buildApiMap(files)).toEqual({
      'app-x': [{ service: 'AnnouncementService', method: 'GET', path: 'Announcements/GetAll' }],
    });
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run tests/tools/api-map.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Create `tools/dl-api-map/scan.mjs`**

```js
import ts from 'typescript';

const VERBS = new Set(['get', 'post', 'put', 'delete', 'patch']);

function isComponentDecorator(dec) {
  const expr = dec.expression;
  return ts.isCallExpression(expr) && ts.isIdentifier(expr.expression) && expr.expression.text === 'Component';
}

function flattenPlus(node, parts) {
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    flattenPlus(node.left, parts);
    flattenPlus(node.right, parts);
  } else {
    parts.push(node);
  }
}

function isBaseExpr(node, sf) {
  return /baseurl|apiurl|environment\.api|apibase|baseapi/.test(node.getText(sf).toLowerCase());
}

function extractPath(arg, sf) {
  const parts = [];
  flattenPlus(arg, parts);
  let out = '';
  for (const p of parts) {
    if (ts.isStringLiteralLike(p)) {
      out += p.text;
    } else if (ts.isTemplateExpression(p)) {
      out += p.head.text;
      for (const span of p.templateSpans) out += '{param}' + span.literal.text;
    } else if (isBaseExpr(p, sf)) {
      // drop the base URL part
    } else {
      out += '{param}';
    }
  }
  return out.replace(/^\/+/, '');
}

export function extractEndpoints(code, fileName) {
  const sf = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const results = [];

  const visitClass = (cls) => {
    const className = cls.name.text;
    const endpoints = [];
    const seen = new Set();
    const walk = (node) => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const verb = node.expression.name.text;
        const objText = node.expression.expression.getText(sf).toLowerCase();
        if (VERBS.has(verb) && objText.includes('http') && node.arguments.length > 0) {
          const path = extractPath(node.arguments[0], sf);
          const method = verb.toUpperCase();
          const key = `${method} ${path}`;
          if (path && !seen.has(key)) {
            seen.add(key);
            endpoints.push({ method, path });
          }
        }
      }
      ts.forEachChild(node, walk);
    };
    walk(cls);
    if (endpoints.length) results.push({ className, endpoints });
  };

  const visit = (node) => {
    if (ts.isClassDeclaration(node) && node.name) visitClass(node);
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return results;
}

export function extractInjections(code, fileName) {
  const sf = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const out = [];

  const visit = (node) => {
    if (ts.isClassDeclaration(node)) {
      const dec = (ts.getDecorators?.(node) ?? []).find(isComponentDecorator);
      if (dec && ts.isCallExpression(dec.expression)) {
        const arg = dec.expression.arguments[0];
        if (arg && ts.isObjectLiteralExpression(arg)) {
          const selProp = arg.properties.find(
            (p) => p.name !== undefined && p.name.getText(sf).replace(/['"]/g, '') === 'selector',
          );
          if (selProp && ts.isPropertyAssignment(selProp) && ts.isStringLiteralLike(selProp.initializer)) {
            const selectors = selProp.initializer.text
              .split(',')
              .map((s) => s.trim())
              .filter((s) => /^[a-zA-Z][\w-]*$/.test(s));
            const serviceTypes = [];
            const ctor = node.members.find((m) => ts.isConstructorDeclaration(m));
            if (ctor) {
              for (const param of ctor.parameters) {
                if (param.type && ts.isTypeReferenceNode(param.type)) {
                  serviceTypes.push(param.type.typeName.getText(sf));
                }
              }
            }
            for (const selector of selectors) out.push({ selector, serviceTypes });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

export function buildApiMap(files) {
  const serviceIndex = {};
  for (const f of files) {
    for (const { className, endpoints } of extractEndpoints(f.code, f.fileName)) {
      serviceIndex[className] = endpoints;
    }
  }

  const map = {};
  for (const f of files) {
    for (const { selector, serviceTypes } of extractInjections(f.code, f.fileName)) {
      const list = [];
      const seen = new Set();
      for (const svc of serviceTypes) {
        const eps = serviceIndex[svc];
        if (!eps) continue;
        for (const ep of eps) {
          const key = `${svc}|${ep.method}|${ep.path}`;
          if (seen.has(key)) continue;
          seen.add(key);
          list.push({ service: svc, method: ep.method, path: ep.path });
        }
      }
      if (list.length) map[selector] = list;
    }
  }
  return map;
}
```

- [ ] **Step 4: Create `tools/dl-api-map/scan.d.mts`**

```ts
export interface Endpoint {
  method: string;
  path: string;
}
export interface ApiEndpoint {
  service: string;
  method: string;
  path: string;
}
export function extractEndpoints(
  code: string,
  fileName: string,
): { className: string; endpoints: Endpoint[] }[];
export function extractInjections(
  code: string,
  fileName: string,
): { selector: string; serviceTypes: string[] }[];
export function buildApiMap(files: { fileName: string; code: string }[]): Record<string, ApiEndpoint[]>;
```

- [ ] **Step 5: Run it — expect PASS**

Run: `npx vitest run tests/tools/api-map.test.ts`
Expected: 4 passing.

- [ ] **Step 6: Checkpoint (no git).**

---

## Task 2: Scanner CLI + README

**Files:**
- Create: `tools/dl-api-map/cli.mjs`, `tools/dl-api-map/README.md`

- [ ] **Step 1: Create `tools/dl-api-map/cli.mjs`**

```js
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

const endpoints = Object.values(map).reduce((n, list) => n + list.length, 0);
console.log(`DevLens: ${Object.keys(map).length} components, ${endpoints} endpoint links from ${files.length} files → ${outFile}`);
```

- [ ] **Step 2: Create `tools/dl-api-map/README.md`**

```markdown
# DevLens API map

Generates `selector -> [{ service, method, path }]` so DevLens can show the API
endpoints a hovered component triggers (the endpoints of the services it injects).
DEV ONLY. No source changes; works on any Angular build.

## Generate
```bash
node tools/dl-api-map/cli.mjs            # writes src/assets/devlens-api-map.json
```
Add a prestart hook (optional) to keep it fresh:
```jsonc
"scripts": { "prestart": "node tools/dl-selector-map/cli.mjs && node tools/dl-api-map/cli.mjs", "start": "ng serve -o" }
```

## Import
In DevLens **Options** → **API map**, import `src/assets/devlens-api-map.json`.
Enable **Show APIs**. Hover a component to see its endpoints.

## How it works / limits
- Extracts `this.http.get/post/put/delete/patch(base + "literal")` calls per service.
- Attributes a service's endpoints to every component that injects it (service-level).
- Static: shows referenced endpoints, not runtime calls. Fully dynamic URLs become
  `{param}`-heavy or are skipped.
```

- [ ] **Step 3: Checkpoint (no git).**

---

## Task 3: Types + shared resolution

**Files:**
- Modify: `src/shared/types.ts`, `src/shared/ide.ts`
- Modify (tests): `tests/shared/types.test.ts`, `tests/content/tooltip.test.ts`, `tests/shared/ide.test.ts`

- [ ] **Step 1: Add types + settings** — in `src/shared/types.ts`, add after `InspectResult`:

```ts
export interface ApiEndpoint {
  service: string;
  method: string;
  path: string;
}
export type ApiMap = Record<string, ApiEndpoint[]>;
```

In `Settings`, add two fields (place before `tooltipPosition`):

```ts
  showApis: boolean;
  apiLimit: number;
```

In `DEFAULT_SETTINGS`, add (before `tooltipPosition`):

```ts
  showApis: true,
  apiLimit: 10,
```

- [ ] **Step 2: Update type-literal tests** so the suite compiles.

In `tests/shared/types.test.ts`, replace the expected object:

```ts
    expect(DEFAULT_SETTINGS).toEqual({
      showName: true,
      showBreadcrumb: true,
      showIdentityPath: true,
      clickAction: 'copy',
      ide: 'vscode',
      ideUrlTemplate: 'vscode://file/{path}:{line}:{col}',
      projectRoot: '',
      showApis: true,
      apiLimit: 10,
      tooltipPosition: 'cursor',
    });
```

In `tests/content/tooltip.test.ts`, replace the `allOn` literal:

```ts
const allOn: Settings = {
  showName: true,
  showBreadcrumb: true,
  showIdentityPath: true,
  clickAction: 'copy',
  ide: 'vscode',
  ideUrlTemplate: 'vscode://file/{path}:{line}:{col}',
  projectRoot: '',
  showApis: true,
  apiLimit: 10,
  tooltipPosition: 'cursor',
};
```

- [ ] **Step 3: Write the failing tests** — add to `tests/shared/ide.test.ts` (alongside existing imports, extend the import line):

Change the import to:
```ts
import { buildOpenUrl, parseFileRef, resolveOpenUrlFor, resolveApisFor, nearestSelectorInMap } from '../../src/shared/ide';
```

Append these blocks:

```ts
describe('nearestSelectorInMap', () => {
  const map = { 'app-page': 'x', 'app-root': 'y' };
  it('returns the nearest breadcrumb selector present in the map', () => {
    expect(nearestSelectorInMap(['app-root', 'app-page', 'mat-card'], 'mat-card', map)).toBe('app-page');
  });
  it('falls back to selector when breadcrumb is empty', () => {
    expect(nearestSelectorInMap([], 'app-root', map)).toBe('app-root');
  });
  it('returns null when nothing matches or map is null', () => {
    expect(nearestSelectorInMap(['x-unknown'], 'x-unknown', map)).toBeNull();
    expect(nearestSelectorInMap(['app-page'], 'app-page', null)).toBeNull();
  });
});

describe('resolveApisFor', () => {
  const map = {
    'app-page': [{ service: 'S', method: 'GET', path: 'a' }],
  };
  it('returns the nearest own component’s endpoints', () => {
    const r = { framework: 'angular' as const, name: 'x', breadcrumb: ['app-root', 'app-page', 'mat-card'], identityPath: 'x', tag: 'div', selector: 'mat-card' };
    expect(resolveApisFor(r, map)).toEqual([{ service: 'S', method: 'GET', path: 'a' }]);
  });
  it('returns null when no component matches', () => {
    const r = { framework: 'angular' as const, name: 'x', breadcrumb: ['mat-card'], identityPath: 'x', tag: 'div', selector: 'mat-card' };
    expect(resolveApisFor(r, map)).toBeNull();
    expect(resolveApisFor(r, null)).toBeNull();
  });
});
```

- [ ] **Step 4: Run them — expect FAIL**

Run: `npx vitest run tests/shared/ide.test.ts`
Expected: FAIL (`nearestSelectorInMap` / `resolveApisFor` not exported).

- [ ] **Step 5: Implement in `src/shared/ide.ts`.**

Change the type import line to include the API types:
```ts
import type { ApiEndpoint, ApiMap, IdePreset, InspectResult, Settings } from './types';
```

Add the shared helper (place above `resolveOpenUrlFor`):

```ts
/** Nearest custom-element ancestor (breadcrumb, nearest-first) that is a key in the map. */
export function nearestSelectorInMap(
  breadcrumb: string[],
  selector: string | undefined,
  map: Record<string, unknown> | null | undefined,
): string | null {
  if (!map) return null;
  const candidates = breadcrumb.length ? [...breadcrumb].reverse() : selector ? [selector] : [];
  for (const sel of candidates) {
    if (Object.prototype.hasOwnProperty.call(map, sel)) return sel;
  }
  return null;
}
```

Replace the body of `resolveOpenUrlFor` (keep its signature) with:

```ts
export function resolveOpenUrlFor(
  settings: Settings,
  result: InspectResult,
  map: Record<string, string> | null | undefined,
): string | null {
  if (result.sourceFile) {
    return buildOpenUrl(settings, result.sourceFile, result.sourceLine);
  }
  const sel = nearestSelectorInMap(result.breadcrumb, result.selector, map);
  if (sel && map) {
    const { file, line } = parseFileRef(map[sel]);
    return buildOpenUrl(settings, file, line);
  }
  return null;
}
```

Append the API resolver:

```ts
/** Endpoints of the nearest own component for a hovered element, or null. */
export function resolveApisFor(result: InspectResult, map: ApiMap | null | undefined): ApiEndpoint[] | null {
  const sel = nearestSelectorInMap(result.breadcrumb, result.selector, map);
  return sel && map ? map[sel] : null;
}
```

- [ ] **Step 6: Run it — expect PASS**

Run: `npx vitest run tests/shared/ide.test.ts tests/shared/types.test.ts tests/content/tooltip.test.ts`
Expected: all passing (existing `resolveOpenUrlFor` tests still green after the refactor).

- [ ] **Step 7: Checkpoint (no git).**

---

## Task 4: API map storage

**Files:**
- Modify: `src/options/map-store.ts`
- Modify (test): `tests/options/map-store.test.ts`

- [ ] **Step 1: Add the failing test** — append to `tests/options/map-store.test.ts` (after the existing `describe`), and extend the import:

Change the import line to:
```ts
import {
  loadMapFromStorage,
  saveMapToStorage,
  clearMapFromStorage,
  loadApiMapFromStorage,
  saveApiMapToStorage,
  clearApiMapFromStorage,
} from '../../src/options/map-store';
```

Append:

```ts
describe('api map storage', () => {
  it('round-trips and clears an api map', async () => {
    expect(await loadApiMapFromStorage()).toBeNull();
    await saveApiMapToStorage({ 'app-x': [{ service: 'S', method: 'GET', path: 'a' }] });
    expect(await loadApiMapFromStorage()).toEqual({ 'app-x': [{ service: 'S', method: 'GET', path: 'a' }] });
    await clearApiMapFromStorage();
    expect(await loadApiMapFromStorage()).toBeNull();
  });
});
```

The existing mock's `get` only handles a single key string. Update the mock's `local.get` to also accept the api key — replace the mock `get` line with:
```ts
        get: vi.fn(async (key: string) => (key in local ? { [key]: local[key] } : {})),
```
(unchanged if already that; both keys are looked up the same way).

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run tests/options/map-store.test.ts`
Expected: FAIL (`loadApiMapFromStorage` not exported).

- [ ] **Step 3: Implement in `src/options/map-store.ts`** — append:

```ts
import type { ApiMap } from '../shared/types';

export const API_MAP_KEY = 'devlensApiMap';

export async function loadApiMapFromStorage(): Promise<ApiMap | null> {
  const stored = await browser.storage.local.get(API_MAP_KEY);
  const map = stored[API_MAP_KEY];
  return map && typeof map === 'object' && !Array.isArray(map) ? (map as ApiMap) : null;
}

export async function saveApiMapToStorage(map: ApiMap): Promise<void> {
  await browser.storage.local.set({ [API_MAP_KEY]: map });
}

export async function clearApiMapFromStorage(): Promise<void> {
  await browser.storage.local.remove(API_MAP_KEY);
}
```

(Move the `import type { ApiMap }` to the top with the other imports if your linter prefers; functionally either works.)

- [ ] **Step 4: Run it — expect PASS**

Run: `npx vitest run tests/options/map-store.test.ts`
Expected: all passing.

- [ ] **Step 5: Checkpoint (no git).**

---

## Task 5: Tooltip APIs section + controller/entry wiring

**Files:**
- Modify: `src/content/tooltip.ts`, `src/content/controller.ts`, `src/content/entry.ts`
- Modify (tests): `tests/content/tooltip.test.ts`, `tests/content/controller.test.ts`, `tests/integration/inspect-loop.test.ts`

- [ ] **Step 1: Write the failing tooltip tests** — append to `tests/content/tooltip.test.ts`:

```ts
import type { ApiEndpoint } from '../../src/shared/types';

const apis: ApiEndpoint[] = [
  { service: 'AnnouncementService', method: 'GET', path: 'Announcements/GetAll' },
  { service: 'AnnouncementService', method: 'POST', path: 'Announcements/Add' },
  { service: 'OtherService', method: 'DELETE', path: 'Other/Remove/{param}' },
];

describe('renderTooltipHTML APIs section', () => {
  it('renders endpoints grouped by service when showApis is on', () => {
    const html = renderTooltipHTML(result, allOn, apis);
    expect(html).toContain('APIs');
    expect(html).toContain('AnnouncementService');
    expect(html).toContain('GET');
    expect(html).toContain('Announcements/GetAll');
  });

  it('omits the APIs section when showApis is off', () => {
    expect(renderTooltipHTML(result, { ...allOn, showApis: false }, apis)).not.toContain('APIs');
  });

  it('caps the list at apiLimit and shows a +N more note', () => {
    const html = renderTooltipHTML(result, { ...allOn, apiLimit: 1 }, apis);
    expect(html).toContain('+2 more');
  });

  it('renders nothing extra when there are no apis', () => {
    expect(renderTooltipHTML(result, allOn, [])).not.toContain('APIs');
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run tests/content/tooltip.test.ts`
Expected: FAIL (`renderTooltipHTML` takes 2 args / no APIs section).

- [ ] **Step 3: Update `src/content/tooltip.ts`** — change the signature and append the APIs section. Replace the function signature line and add the section before `return rows.join('')`:

Change:
```ts
export function renderTooltipHTML(result: InspectResult, settings: Settings): string {
```
to:
```ts
import type { ApiEndpoint } from '../shared/types';

export function renderTooltipHTML(result: InspectResult, settings: Settings, apis?: ApiEndpoint[]): string {
```

(Keep the existing `import type { InspectResult, Settings }` line; add the `ApiEndpoint` import at the top.)

Then, immediately before `return rows.join('');`, insert:

```ts
  if (settings.showApis && apis && apis.length) {
    rows.push('<div class="dl-apis-title">APIs</div>');
    const limit = Math.max(0, settings.apiLimit);
    let shown = 0;
    let lastService = '';
    for (const ep of apis) {
      if (shown >= limit) break;
      if (ep.service !== lastService) {
        rows.push(`<div class="dl-api-svc">${escapeHtml(ep.service)}</div>`);
        lastService = ep.service;
      }
      rows.push(`<div class="dl-api"><span class="dl-api-m">${escapeHtml(ep.method)}</span> ${escapeHtml(ep.path)}</div>`);
      shown++;
    }
    if (apis.length > shown) {
      rows.push(`<div class="dl-api-more">+${apis.length - shown} more</div>`);
    }
  }
```

- [ ] **Step 4: Run it — expect PASS**

Run: `npx vitest run tests/content/tooltip.test.ts`
Expected: all passing.

- [ ] **Step 5: Add the `resolveApis` controller dep.** In `src/content/controller.ts`:

Add to the `import type` line for shared types so `ApiEndpoint` is available:
```ts
import type { Settings, InspectResult, ApiEndpoint } from '../shared/types';
```

Add to `ControllerDeps`:
```ts
  resolveApis: (result: InspectResult) => ApiEndpoint[] | null;
```

In `onBridgeMessage`, replace the render line:
```ts
    const html = renderTooltipHTML(data.result, this.deps.settings);
```
with:
```ts
    const apis = this.deps.settings.showApis ? this.deps.resolveApis(data.result) : null;
    const html = renderTooltipHTML(data.result, this.deps.settings, apis ?? undefined);
```

- [ ] **Step 6: Update controller + integration tests** to supply the new dep.

In `tests/content/controller.test.ts`, in `makeController`, add to the deps object:
```ts
    resolveApis: vi.fn(() => null),
```

In `tests/integration/inspect-loop.test.ts`, in the `wire()` controller deps, add:
```ts
      resolveApis: () => null,
```

- [ ] **Step 7: Wire `entry.ts`.** In `src/content/entry.ts`:

Extend imports:
```ts
import { loadMapFromStorage, loadApiMapFromStorage, MAP_KEY, API_MAP_KEY } from '../options/map-store';
import { resolveOpenUrlFor, resolveApisFor } from '../shared/ide';
import type { BgToContent } from '../shared/messages';
import type { ApiMap, InspectResult } from '../shared/types';
```

After the `componentMap` block and `void loadMap();`, add the API map loader:
```ts
  let apiMap: ApiMap | null = null;
  const loadApiMap = async (): Promise<void> => {
    try {
      const m = await loadApiMapFromStorage();
      if (m) {
        apiMap = m;
        console.info('[DevLens] API map loaded:', Object.keys(m).length, 'components');
      }
    } catch {
      // none imported — APIs section simply won't show
    }
  };
  void loadApiMap();
```

In the `InspectController` deps, add:
```ts
    resolveApis: (result: InspectResult) => resolveApisFor(result, apiMap),
```

In the `browser.storage.onChanged` listener, extend the local-area branch:
```ts
    if (area === 'local' && (changes[MAP_KEY] || changes[API_MAP_KEY])) {
      if (changes[MAP_KEY]) void loadMap();
      if (changes[API_MAP_KEY]) void loadApiMap();
      return;
    }
```

Also call `void loadApiMap();` inside `activate()` (next to the existing `void loadMap();`).

- [ ] **Step 8: Full verification**

Run: `npm test && npm run typecheck`
Expected: all tests pass; no type errors.

- [ ] **Step 9: Checkpoint (no git).**

---

## Task 6: Options page — Show APIs + API map import

**Files:**
- Modify: `src/options/options.html`, `src/options/options.ts`

- [ ] **Step 1: Add controls to `src/options/options.html`** — add a Show APIs checkbox after the `showBreadcrumb` checkbox:

```html
    <label><input type="checkbox" id="showApis" /> Show API calls</label>
    <label>Max APIs shown
      <input type="number" id="apiLimit" min="1" max="100" style="width:64px" />
    </label>
```

And add an API-map import block after the existing selector-map block (before the final `<p class="hint" id="status">`):

```html
    <label>API map (for Show API calls)
      <input type="file" id="apiMapFile" accept="application/json,.json" />
    </label>
    <p class="hint">
      Generate with <code>node tools/dl-api-map/cli.mjs</code>, then import
      <code>src/assets/devlens-api-map.json</code>. <button id="apiMapClear" type="button">Clear API map</button>
    </p>
    <p class="hint" id="apiMapStatus"></p>
```

- [ ] **Step 2: Update `src/options/options.ts`** — bind the new checkbox, the number, and the API-map import.

Add `showApis` to `CHECKBOXES`:
```ts
const CHECKBOXES: (keyof Settings)[] = ['showName', 'showIdentityPath', 'showBreadcrumb', 'showApis'];
```

Add a numbers list + binding. After the `TEXTS` loop in `main()`, add:
```ts
  const NUMBERS: (keyof Settings)[] = ['apiLimit'];
  for (const key of NUMBERS) {
    const el = document.getElementById(key) as HTMLInputElement | null;
    if (!el) continue;
    el.value = String(settings[key]);
    el.addEventListener('change', () => {
      const n = parseInt(el.value, 10);
      if (Number.isFinite(n) && n > 0) void persist(key, n);
    });
  }
```

Extend the imports and generalize the map-import wiring. Change the import line to:
```ts
import {
  loadMapFromStorage, saveMapToStorage, clearMapFromStorage,
  loadApiMapFromStorage, saveApiMapToStorage, clearApiMapFromStorage,
} from './map-store';
```

Replace `initMapControls` with a parameterized helper + two calls. Replace the whole `initMapControls` function with:

```ts
async function wireMapImport(
  fileId: string,
  statusId: string,
  clearId: string,
  load: () => Promise<Record<string, unknown> | null>,
  save: (map: any) => Promise<void>,
  clear: () => Promise<void>,
): Promise<void> {
  const status = document.getElementById(statusId);
  const showCount = async (): Promise<void> => {
    const map = await load();
    if (status) status.textContent = map ? `Loaded: ${Object.keys(map).length} entries.` : 'Not imported.';
  };
  await showCount();

  const file = document.getElementById(fileId) as HTMLInputElement | null;
  file?.addEventListener('change', async () => {
    const f = file.files?.[0];
    if (!f) return;
    try {
      const map = JSON.parse(await f.text());
      if (!map || typeof map !== 'object' || Array.isArray(map)) throw new Error('not an object');
      await save(map);
      if (status) status.textContent = `Loaded: ${Object.keys(map).length} entries.`;
    } catch {
      if (status) status.textContent = 'Invalid JSON.';
    }
  });

  const clearBtn = document.getElementById(clearId) as HTMLButtonElement | null;
  clearBtn?.addEventListener('click', async () => {
    await clear();
    await showCount();
  });
}
```

And replace the `await initMapControls();` call in `main()` with:
```ts
  await wireMapImport('mapFile', 'mapStatus', 'mapClear', loadMapFromStorage, saveMapToStorage, clearMapFromStorage);
  await wireMapImport('apiMapFile', 'apiMapStatus', 'apiMapClear', loadApiMapFromStorage, saveApiMapToStorage, clearApiMapFromStorage);
```

- [ ] **Step 3: Verify**

Run: `npm test && npm run typecheck`
Expected: all pass; no type errors.

- [ ] **Step 4: Checkpoint (no git).**

---

## Task 7: Build + README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add an API-mapping section to `README.md`** after the "Open in IDE" section:

```markdown
## API call mapping (Angular)
Show the API endpoints a component triggers (the endpoints of the services it injects):
1. Generate the map: `node tools/dl-api-map/cli.mjs` (writes `src/assets/devlens-api-map.json`).
2. In DevLens Options → **API map**, import that file, and tick **Show API calls**.
3. Hover a component → its endpoints appear in the tooltip, grouped by service (capped by **Max APIs shown**).

Static + service-level: it shows endpoints referenced through injected services, not
runtime calls. No map → the APIs section is simply hidden.
```

- [ ] **Step 2: Full verification + rebuild**

Run: `npm test && npm run typecheck && npm run build`
Expected: all tests pass; no type errors; `dist/chromium` + `dist/firefox` rebuilt.

- [ ] **Step 3: Verify the feature is in the bundles**

Run: `grep -c "dl-apis-title" dist/chromium/content.js && grep -c "devlensApiMap" dist/chromium/content.js && grep -c "apiMapFile" dist/chromium/options.js`
Expected: each prints `1` (or more).

- [ ] **Step 4: Checkpoint (no git).**

---

## Self-Review Notes (verification against spec)

- Spec §4 scanner (extractEndpoints/extractInjections/buildApiMap, path flattening, base drop, `{param}`) → Task 1. ✓
- Spec §4 CLI → Task 2. ✓
- Spec §5 types (ApiEndpoint/ApiMap, showApis/apiLimit) → Task 3 Step 1. ✓
- Spec §5 storage (API_MAP_KEY + load/save/clear) → Task 4. ✓
- Spec §5 nearestSelectorInMap + resolveApisFor + resolveOpenUrlFor refactor → Task 3 Step 5. ✓
- Spec §5 controller/entry wiring → Task 5 Steps 5–7. ✓
- Spec §5 tooltip APIs section (grouped, capped, escaped) → Task 5 Step 3. ✓
- Spec §5 options (Show APIs, API map import) → Task 6. ✓
- Spec §6 edge cases → no-map (entry try/catch, hidden section), non-http excluded (Task 1 `http` check), dedupe (buildApiMap), cap (tooltip), verb false positives (Task 1). ✓
- Spec §7 testing → tests in Tasks 1,3,4,5. ✓
- Type consistency: `ApiEndpoint {service,method,path}`, `ApiMap`, `resolveApisFor(result,map)`, `nearestSelectorInMap(breadcrumb,selector,map)`, `renderTooltipHTML(result,settings,apis?)`, controller dep `resolveApis` — identical across tasks. ✓
```
