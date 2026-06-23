# DevLens "Open in IDE" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Git is DISABLED for this project per user instruction.** Wherever a normal plan would commit, this plan uses a **Checkpoint** step: run the verification, confirm green, and move on. Do NOT run any `git`/`gh` command.

**Goal:** Add a configurable click action to DevLens so that, in inspect mode, clicking an Angular component opens its source file at the right line in the developer's IDE (VS Code / Cursor / JetBrains / custom), with a reference build-time stamper that supplies the file path.

**Architecture:** A dev-only TypeScript transformer stamps `data-dl-file="<relpath>:<line>"` onto each Angular component host. The bridge reads it into `InspectResult`; the content controller's click handler, driven by a `clickAction` setting, either copies the identity path or builds an IDE URL (`buildOpenUrl`) and triggers it via a transient anchor-click. Settings live in `chrome.storage.sync` and are editable on the options page.

**Tech Stack:** TypeScript, esbuild, Vitest + jsdom, `webextension-polyfill`, the `typescript` compiler API (for the stamper).

---

## File Structure

```
src/shared/types.ts                         (modify: Settings + ClickAction/IdePreset, InspectResult, DEFAULT_SETTINGS)
src/shared/ide.ts                           (new: IDE_TEMPLATES, buildOpenUrl)
src/bridge/adapters/angular.ts              (modify: findSourceFile + sourceFile/sourceLine)
src/content/controller.ts                   (modify: onClick switch + resolveOpenUrl/openUrl deps)
src/content/entry.ts                        (modify: wire resolveOpenUrl, openUrl, storage.onChanged)
src/options/options.html                    (modify: click-action/IDE selects + template/root inputs)
src/options/options.ts                      (modify: generalized binding for checkbox/select/text)
tools/dl-stamp-transformer/transformer.ts   (new: createStampTransformer, transformSource)
tools/dl-stamp-transformer/README.md        (new: wiring + dev-only warning)
tests/shared/ide.test.ts                    (new)
tests/bridge/angular-source.test.ts         (new)
tests/tools/stamp-transformer.test.ts       (new)
tests/content/controller.test.ts            (modify)
tests/content/tooltip.test.ts               (modify: Settings literal)
tests/shared/types.test.ts                  (modify: DEFAULT_SETTINGS)
tests/integration/inspect-loop.test.ts      (modify: controller deps)
package.json                                (modify: add @types/node devDep)
```

---

## Task 1: IDE URL builder (`src/shared/ide.ts`)

**Files:**
- Create: `src/shared/ide.ts`
- Test: `tests/shared/ide.test.ts`

- [ ] **Step 1: Write the failing test** — `tests/shared/ide.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { buildOpenUrl } from '../../src/shared/ide';
import { DEFAULT_SETTINGS, Settings } from '../../src/shared/types';

function s(over: Partial<Settings>): Settings {
  return { ...DEFAULT_SETTINGS, ...over };
}

describe('buildOpenUrl', () => {
  it('builds a VS Code URL joining the project root with a relative path', () => {
    const url = buildOpenUrl(s({ ide: 'vscode', projectRoot: '/home/me/proj' }), 'src/app/x.component.ts', 12);
    expect(url).toBe('vscode://file//home/me/proj/src/app/x.component.ts:12:1');
  });

  it('builds a Cursor URL', () => {
    const url = buildOpenUrl(s({ ide: 'cursor', projectRoot: '/p' }), 'a.ts', 3);
    expect(url).toBe('cursor://file//p/a.ts:3');
  });

  it('builds a JetBrains URL', () => {
    const url = buildOpenUrl(s({ ide: 'jetbrains', projectRoot: '/p' }), 'a.ts', 3);
    expect(url).toBe('jetbrains://open?file=/p/a.ts&line=3');
  });

  it('uses a custom template when ide is custom', () => {
    const url = buildOpenUrl(
      s({ ide: 'custom', ideUrlTemplate: 'edit://{path}#{line}', projectRoot: '/p' }),
      'a.ts',
      9,
    );
    expect(url).toBe('edit:///p/a.ts#9');
  });

  it('normalizes Windows backslashes to forward slashes', () => {
    const url = buildOpenUrl(s({ ide: 'vscode', projectRoot: 'C:\\proj' }), 'src\\x.ts', 1);
    expect(url).toBe('vscode://file/C:/proj/src/x.ts:1:1');
  });

  it('uses an absolute file path as-is (ignores project root)', () => {
    const url = buildOpenUrl(s({ ide: 'vscode', projectRoot: '/ignored' }), '/abs/x.ts', 5);
    expect(url).toBe('vscode://file//abs/x.ts:5:1');
  });

  it('defaults line/col to 1 when line is undefined', () => {
    const url = buildOpenUrl(s({ ide: 'vscode', projectRoot: '/p' }), 'a.ts', undefined);
    expect(url).toBe('vscode://file//p/a.ts:1:1');
  });

  it('returns null when a relative path has no project root', () => {
    expect(buildOpenUrl(s({ ide: 'vscode', projectRoot: '' }), 'a.ts', 1)).toBeNull();
  });

  it('returns null when a custom template is empty', () => {
    expect(buildOpenUrl(s({ ide: 'custom', ideUrlTemplate: '', projectRoot: '/p' }), 'a.ts', 1)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run tests/shared/ide.test.ts`
Expected: FAIL (module not found, and `Settings` missing `ide`/`ideUrlTemplate`/`projectRoot` — that's fixed in Task 3; for now this test drives `ide.ts` only and Task 3 makes the type fields exist). To unblock Task 1 in isolation, run after Task 3's type step OR temporarily run only the assertions. See Note below.

> **Sequencing note:** `buildOpenUrl` consumes `Settings` fields (`ide`, `ideUrlTemplate`, `projectRoot`) added in Task 3. Implement `ide.ts` here, but the test will only typecheck/pass once Task 3's type changes land. If executing strictly in order, do Task 3 **Step 1 (types)** first, then return here. The code below is correct as written.

- [ ] **Step 3: Create `src/shared/ide.ts`**

```ts
import type { IdePreset, Settings } from './types';

export const IDE_TEMPLATES: Record<Exclude<IdePreset, 'custom'>, string> = {
  vscode: 'vscode://file/{path}:{line}:{col}',
  cursor: 'cursor://file/{path}:{line}',
  jetbrains: 'jetbrains://open?file={path}&line={line}',
};

function isAbsolute(p: string): boolean {
  return p.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(p);
}

function normalizeSlashes(p: string): string {
  return p.replace(/\\/g, '/');
}

export function buildOpenUrl(settings: Settings, file: string, line: number | undefined): string | null {
  const template = settings.ide === 'custom' ? settings.ideUrlTemplate : IDE_TEMPLATES[settings.ide];
  if (!template) return null;

  const f = normalizeSlashes(file);
  let path: string;
  if (isAbsolute(f)) {
    path = f;
  } else if (settings.projectRoot) {
    path = `${normalizeSlashes(settings.projectRoot).replace(/\/$/, '')}/${f}`;
  } else {
    return null;
  }

  const ln = String(line ?? 1);
  return template
    .replace(/\{path\}/g, path)
    .replace(/\{line\}/g, ln)
    .replace(/\{col\}/g, '1');
}
```

- [ ] **Step 4: Run it — expect PASS** (after Task 3 types exist)

Run: `npx vitest run tests/shared/ide.test.ts`
Expected: 9 passing.

- [ ] **Step 5: Checkpoint (no git)** — `ide.ts` complete; proceed.

---

## Task 2: Angular adapter reads `data-dl-file`

**Files:**
- Modify: `src/bridge/adapters/angular.ts`
- Test: `tests/bridge/angular-source.test.ts`

- [ ] **Step 1: Write the failing test** — `tests/bridge/angular-source.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { inspectAngular } from '../../src/bridge/adapters/angular';

function build(html: string): Document {
  const doc = document.implementation.createHTMLDocument('t');
  doc.body.innerHTML = html;
  return doc;
}

describe('inspectAngular source metadata', () => {
  it('reads data-dl-file from the nearest ancestor', () => {
    const doc = build(
      '<app-user-card data-dl-file="src/app/user-card.component.ts:12"><span id="t">x</span></app-user-card>',
    );
    const r = inspectAngular(doc.getElementById('t')!, {});
    expect(r.sourceFile).toBe('src/app/user-card.component.ts');
    expect(r.sourceLine).toBe(12);
  });

  it('parses a path with no line number', () => {
    const doc = build('<app-x data-dl-file="src/app/x.component.ts" id="t"></app-x>');
    const r = inspectAngular(doc.getElementById('t')!, {});
    expect(r.sourceFile).toBe('src/app/x.component.ts');
    expect(r.sourceLine).toBeUndefined();
  });

  it('leaves source fields undefined when no attribute is present', () => {
    const doc = build('<app-x id="t"></app-x>');
    const r = inspectAngular(doc.getElementById('t')!, {});
    expect(r.sourceFile).toBeUndefined();
    expect(r.sourceLine).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run tests/bridge/angular-source.test.ts`
Expected: FAIL (`sourceFile` undefined / not set).

- [ ] **Step 3: Add `InspectResult` fields** — in `src/shared/types.ts`, extend the interface (keep all existing fields):

```ts
export interface InspectResult {
  framework: Framework;
  name: string;
  breadcrumb: string[];
  identityPath: string;
  tag: string;
  notes?: string;
  sourceFile?: string; // from data-dl-file (project-relative or absolute)
  sourceLine?: number; // 1-based line, if present
}
```

- [ ] **Step 4: Implement `findSourceFile` + wire into `inspectAngular`** — in `src/bridge/adapters/angular.ts`, add the helper and populate the result:

```ts
function findSourceFile(el: Element): { file: string; line?: number } | undefined {
  let cur: Element | null = el;
  while (cur) {
    const raw = cur.getAttribute('data-dl-file');
    if (raw) {
      const idx = raw.lastIndexOf(':');
      // Only treat the trailing ":N" as a line number; a relative path has no other colon.
      if (idx > 0 && /^\d+$/.test(raw.slice(idx + 1))) {
        return { file: raw.slice(0, idx), line: Number(raw.slice(idx + 1)) };
      }
      return { file: raw };
    }
    cur = cur.parentElement;
  }
  return undefined;
}
```

Then, at the end of `inspectAngular`, replace the existing `return { ... }` object with one that includes the source fields:

```ts
  const source = findSourceFile(el);

  return {
    framework: 'angular',
    name: cls ?? selector,
    breadcrumb: buildBreadcrumb(el),
    identityPath: identityParts.join(' › '),
    tag: el.tagName.toLowerCase(),
    notes: minified ? 'minified' : undefined,
    sourceFile: source?.file,
    sourceLine: source?.line,
  };
```

- [ ] **Step 5: Run it — expect PASS**

Run: `npx vitest run tests/bridge/angular-source.test.ts tests/bridge/angular.test.ts`
Expected: all passing (existing angular tests still green — new fields are additive).

- [ ] **Step 6: Checkpoint (no git)** — adapter now surfaces source metadata.

---

## Task 3: Click-action & IDE settings, end-to-end

This task migrates `copyOnClick` → `clickAction`, adds the IDE settings, rewrites `onClick`, wires `entry.ts`, and rebuilds the options page. It is one task because the `Settings` type change ripples into the controller, options, and tests; doing them together keeps the project compiling.

**Files:**
- Modify: `src/shared/types.ts`, `src/content/controller.ts`, `src/content/entry.ts`, `src/options/options.html`, `src/options/options.ts`
- Modify (tests): `tests/shared/types.test.ts`, `tests/content/tooltip.test.ts`, `tests/content/controller.test.ts`, `tests/integration/inspect-loop.test.ts`

- [ ] **Step 1: Update `Settings`, add union types, update `DEFAULT_SETTINGS`** — in `src/shared/types.ts`, replace the `Settings` interface and defaults:

```ts
export type ClickAction = 'copy' | 'open' | 'none';
export type IdePreset = 'vscode' | 'cursor' | 'jetbrains' | 'custom';

export interface Settings {
  showName: boolean;
  showBreadcrumb: boolean;
  showIdentityPath: boolean;
  clickAction: ClickAction;
  ide: IdePreset;
  ideUrlTemplate: string;
  projectRoot: string;
  tooltipPosition: 'cursor' | 'top-left';
}

export const DEFAULT_SETTINGS: Settings = {
  showName: true,
  showBreadcrumb: true,
  showIdentityPath: true,
  clickAction: 'copy',
  ide: 'vscode',
  ideUrlTemplate: 'vscode://file/{path}:{line}:{col}',
  projectRoot: '',
  tooltipPosition: 'cursor',
};
```

- [ ] **Step 2: Fix the type-literal tests** so the suite compiles:

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
  tooltipPosition: 'cursor',
};
```

- [ ] **Step 3: Write the failing controller tests** — replace the existing copy/fallback click tests in `tests/content/controller.test.ts` and extend `makeController` to supply the new deps:

```ts
function makeController(over: Partial<import('../../src/shared/types').Settings> = {}) {
  const posted: any[] = [];
  const openUrl = vi.fn();
  const resolveOpenUrl = vi.fn(() => null as string | null);
  const copy = vi.fn(async () => {});
  const overlay = { mount: vi.fn(), show: vi.fn(), hide: vi.fn(), destroy: vi.fn() } as any;
  const controller = new InspectController({
    settings: { ...DEFAULT_SETTINGS, ...over },
    postToBridge: (req) => posted.push(req),
    overlay,
    copy,
    resolveOpenUrl,
    openUrl,
  });
  return { controller, posted, openUrl, resolveOpenUrl, copy, overlay };
}

const RESULT = {
  framework: 'angular' as const,
  name: 'CardComponent',
  breadcrumb: [],
  identityPath: 'app-card › CardComponent',
  tag: 'div',
};

describe('InspectController click actions', () => {
  it('copies the identity path when clickAction is copy', async () => {
    const { controller, copy, openUrl } = makeController({ clickAction: 'copy' });
    controller.activate();
    (controller as any).lastResult = RESULT;
    await controller.onClick({ preventDefault: vi.fn(), stopPropagation: vi.fn() } as any);
    expect(copy).toHaveBeenCalledWith('app-card › CardComponent');
    expect(openUrl).not.toHaveBeenCalled();
  });

  it('opens the IDE URL when clickAction is open and a url resolves', async () => {
    const { controller, openUrl, resolveOpenUrl, copy } = makeController({ clickAction: 'open' });
    resolveOpenUrl.mockReturnValue('vscode://file//p/x.ts:1:1');
    controller.activate();
    (controller as any).lastResult = RESULT;
    await controller.onClick({ preventDefault: vi.fn(), stopPropagation: vi.fn() } as any);
    expect(openUrl).toHaveBeenCalledWith('vscode://file//p/x.ts:1:1');
    expect(copy).not.toHaveBeenCalled();
  });

  it('falls back to copy + hint when open resolves no url', async () => {
    const { controller, openUrl, copy, overlay } = makeController({ clickAction: 'open' });
    controller.activate();
    (controller as any).lastResult = RESULT;
    await controller.onClick({ preventDefault: vi.fn(), stopPropagation: vi.fn() } as any);
    expect(openUrl).not.toHaveBeenCalled();
    expect(copy).toHaveBeenCalledWith('app-card › CardComponent');
    expect(overlay.show).toHaveBeenCalled();
  });

  it('does nothing (no preventDefault) when clickAction is none', async () => {
    const { controller, copy, openUrl } = makeController({ clickAction: 'none' });
    controller.activate();
    (controller as any).lastResult = RESULT;
    const evt = { preventDefault: vi.fn(), stopPropagation: vi.fn() } as any;
    await controller.onClick(evt);
    expect(copy).not.toHaveBeenCalled();
    expect(openUrl).not.toHaveBeenCalled();
    expect(evt.preventDefault).not.toHaveBeenCalled();
  });
});
```

Keep the two existing tests in this file ("posts an inspect request…", "renders the overlay…") but update their `makeController()` usage — they already call `makeController()` with no args, which still works.

- [ ] **Step 4: Run controller tests — expect FAIL**

Run: `npx vitest run tests/content/controller.test.ts`
Expected: FAIL (`InspectController` deps lack `resolveOpenUrl`/`openUrl`; `onClick` still uses `copyOnClick`).

- [ ] **Step 5: Rewrite `controller.ts`** — update the deps interface and `onClick`:

```ts
interface ControllerDeps {
  settings: Settings;
  postToBridge: (req: BridgeRequest) => void;
  overlay: Pick<Overlay, 'mount' | 'show' | 'hide' | 'destroy'>;
  copy: (text: string) => Promise<void>;
  resolveOpenUrl: (result: InspectResult) => string | null;
  openUrl: (url: string) => void;
}
```

Replace the `onClick` method with:

```ts
  async onClick(e: { preventDefault: () => void; stopPropagation: () => void }): Promise<void> {
    if (!this.active || !this.lastResult) return;
    const action = this.deps.settings.clickAction;
    if (action === 'none') return;

    e.preventDefault();
    e.stopPropagation();

    if (action === 'open') {
      const url = this.deps.resolveOpenUrl(this.lastResult);
      if (url) {
        this.deps.openUrl(url);
        return;
      }
      // No usable file path → fall back to copy + a transient hint.
      this.deps.overlay.show(
        this.lastRect,
        '<div class="dl-note">No source info — set project root / add the stamper</div>',
        this.lastPoint.x,
        this.lastPoint.y,
      );
    }

    await this.deps.copy(this.lastResult.identityPath || this.lastResult.name);
  }
```

(`InspectResult` is already imported in this file via `import type { Settings, InspectResult } from '../shared/types';`.)

- [ ] **Step 6: Run controller tests — expect PASS**

Run: `npx vitest run tests/content/controller.test.ts`
Expected: all passing.

- [ ] **Step 7: Update the integration test deps** — in `tests/integration/inspect-loop.test.ts`, the `wire()` helper builds an `InspectController`; add the two new deps so it compiles:

```ts
    const controller = new InspectController({
      settings: DEFAULT_SETTINGS,
      overlay,
      copy: vi.fn(async () => {}),
      resolveOpenUrl: () => null,
      openUrl: vi.fn(),
      postToBridge: (req: BridgeRequest) =>
        handleBridgeMessage(req, document, win, (res) =>
          controller.onBridgeMessage({ data: res } as MessageEvent),
        ),
    });
```

- [ ] **Step 8: Wire `entry.ts`** — update `src/content/entry.ts`:

Add imports:

```ts
import { buildOpenUrl } from '../shared/ide';
import type { InspectResult } from '../shared/types';
```

Inside `init()`, after `const settings = await loadSettings();`, make settings mutable and build the controller with the new deps:

```ts
  let settings = await loadSettings();

  const overlay = new Overlay();
  const controller = new InspectController({
    settings,
    postToBridge: (req) => window.postMessage(req, '*'),
    overlay,
    copy: (text) => navigator.clipboard.writeText(text).catch(() => {}),
    resolveOpenUrl: (result: InspectResult) =>
      result.sourceFile ? buildOpenUrl(settings, result.sourceFile, result.sourceLine) : null,
    openUrl: (url: string) => {
      const a = document.createElement('a');
      a.href = url;
      a.style.display = 'none';
      document.documentElement.appendChild(a);
      a.click();
      a.remove();
    },
  });

  // Keep settings live so changing click-action / IDE applies without re-activating.
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    settings = { ...settings };
    for (const [key, { newValue }] of Object.entries(changes)) {
      (settings as Record<string, unknown>)[key] = newValue;
    }
    (controller as unknown as { deps: { settings: typeof settings } }).deps.settings = settings;
  });
```

> Note: replace the existing `const overlay = new Overlay();` / `const settings = ...` / `const controller = new InspectController({...})` block with the above. The closures (`resolveOpenUrl`) read the outer `settings` variable, which the storage listener reassigns, so live updates work.

- [ ] **Step 9: Rebuild the options page** — replace `src/options/options.html` body content (keep `<head>`/styles) so it has the display checkboxes plus the new controls:

```html
  <body>
    <h1>DevLens</h1>
    <p class="hint">Toggle inspect mode with the toolbar icon or <kbd>Alt+Shift+C</kbd>.</p>

    <label><input type="checkbox" id="showName" /> Show component / page name</label>
    <label><input type="checkbox" id="showIdentityPath" /> Show identity path</label>
    <label><input type="checkbox" id="showBreadcrumb" /> Show hierarchy breadcrumb</label>

    <label>Click action
      <select id="clickAction">
        <option value="copy">Copy identity path</option>
        <option value="open">Open in IDE</option>
        <option value="none">Do nothing</option>
      </select>
    </label>

    <label>IDE
      <select id="ide">
        <option value="vscode">VS Code</option>
        <option value="cursor">Cursor</option>
        <option value="jetbrains">JetBrains (WebStorm/IntelliJ)</option>
        <option value="custom">Custom…</option>
      </select>
    </label>

    <label>Custom URL template
      <input type="text" id="ideUrlTemplate" placeholder="vscode://file/{path}:{line}:{col}" size="40" />
    </label>
    <p class="hint">Placeholders: <code>{path}</code>, <code>{line}</code>, <code>{col}</code>. Used only when IDE = Custom.</p>

    <label>Project root
      <input type="text" id="projectRoot" placeholder="C:/proj or /home/me/proj" size="40" />
    </label>
    <p class="hint">Absolute local path; prepended to the stamper's relative file paths.</p>

    <p class="hint" id="status"></p>
    <script type="module" src="options.js"></script>
  </body>
```

- [ ] **Step 10: Generalize `options.ts`** — replace the whole file:

```ts
import { loadSettings, saveSettings } from './storage';
import type { Settings } from '../shared/types';

const CHECKBOXES: (keyof Settings)[] = ['showName', 'showIdentityPath', 'showBreadcrumb'];
const SELECTS: (keyof Settings)[] = ['clickAction', 'ide'];
const TEXTS: (keyof Settings)[] = ['ideUrlTemplate', 'projectRoot'];

function note(): void {
  const status = document.getElementById('status');
  if (status) status.textContent = 'Saved.';
}

async function persist(key: keyof Settings, value: unknown): Promise<void> {
  const next = { ...(await loadSettings()), [key]: value } as Settings;
  await saveSettings(next);
  note();
}

async function main(): Promise<void> {
  const settings = await loadSettings();

  for (const key of CHECKBOXES) {
    const el = document.getElementById(key) as HTMLInputElement | null;
    if (!el) continue;
    el.checked = settings[key] as boolean;
    el.addEventListener('change', () => persist(key, el.checked));
  }

  for (const key of SELECTS) {
    const el = document.getElementById(key) as HTMLSelectElement | null;
    if (!el) continue;
    el.value = settings[key] as string;
    el.addEventListener('change', () => persist(key, el.value));
  }

  for (const key of TEXTS) {
    const el = document.getElementById(key) as HTMLInputElement | null;
    if (!el) continue;
    el.value = settings[key] as string;
    el.addEventListener('change', () => persist(key, el.value));
  }
}

void main();
```

- [ ] **Step 11: Full verification**

Run: `npm test && npm run typecheck`
Expected: all tests pass; no type errors.

- [ ] **Step 12: Checkpoint (no git)** — click-action + IDE settings wired end-to-end.

---

## Task 4: Reference stamper (`tools/dl-stamp-transformer/`)

**Files:**
- Create: `tools/dl-stamp-transformer/transformer.ts`, `tools/dl-stamp-transformer/README.md`
- Modify: `package.json` (add `@types/node` devDep)
- Test: `tests/tools/stamp-transformer.test.ts`

- [ ] **Step 1: Add `@types/node`** — in `package.json` `devDependencies`, add `"@types/node": "^20.14.0"`, then:

Run: `npm install`
Expected: installs without error.

- [ ] **Step 2: Write the failing test** — `tests/tools/stamp-transformer.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { transformSource } from '../../tools/dl-stamp-transformer/transformer';

const ROOT = '/proj';

describe('transformSource', () => {
  it('injects data-dl-file with relative path and line for a component', () => {
    const code = [
      `import { Component } from '@angular/core';`,
      `@Component({ selector: 'app-user-card', template: '' })`,
      `export class UserCardComponent {}`,
    ].join('\n');
    const out = transformSource(code, '/proj/src/app/user-card.component.ts', ROOT);
    expect(out).toContain(`host: { 'data-dl-file': 'src/app/user-card.component.ts:2' }`);
  });

  it('merges into an existing host object', () => {
    const code = [
      `import { Component } from '@angular/core';`,
      `@Component({ selector: 'app-x', host: { 'class': 'y' } })`,
      `export class XComponent {}`,
    ].join('\n');
    const out = transformSource(code, '/proj/x.component.ts', ROOT);
    expect(out).toContain(`'data-dl-file': 'x.component.ts:2'`);
    expect(out).toContain(`'class': 'y'`);
  });

  it('leaves non-component classes untouched', () => {
    const code = `export class Foo {}`;
    expect(transformSource(code, '/proj/foo.ts', ROOT)).toBe(code);
  });

  it('does not double-stamp a component that already has data-dl-file', () => {
    const code = `import { Component } from '@angular/core';
@Component({ selector: 'app-x', host: { 'data-dl-file': 'old:1' } })
export class XComponent {}`;
    expect(transformSource(code, '/proj/x.ts', ROOT)).toBe(code);
  });

  it('skips files outside the root', () => {
    const code = `import { Component } from '@angular/core';
@Component({ selector: 'app-x' })
export class XComponent {}`;
    expect(transformSource(code, '/other/x.ts', ROOT)).toBe(code);
  });
});
```

- [ ] **Step 3: Run it — expect FAIL**

Run: `npx vitest run tests/tools/stamp-transformer.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 4: Create `tools/dl-stamp-transformer/transformer.ts`**

```ts
import ts from 'typescript';
import path from 'node:path';

function toRel(rootDir: string, fileName: string): string {
  const r = rootDir.replace(/\\/g, '/');
  const f = fileName.replace(/\\/g, '/');
  return path.posix.relative(r, f);
}

function isComponentDecorator(dec: ts.Decorator): boolean {
  const expr = dec.expression;
  return (
    ts.isCallExpression(expr) &&
    ts.isIdentifier(expr.expression) &&
    expr.expression.text === 'Component'
  );
}

interface Edit {
  pos: number;
  text: string;
}

/**
 * Reference stamper: injects `host: { 'data-dl-file': '<relpath>:<line>' }` into
 * each @Component decorator. Text-edit based (minimal diff). DEV ONLY.
 */
export function transformSource(code: string, fileName: string, rootDir: string): string {
  const rel = toRel(rootDir, fileName);
  if (rel.startsWith('..')) return code; // outside root

  const sf = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const edits: Edit[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isClassDeclaration(node)) {
      const dec = (ts.getDecorators?.(node) ?? []).find(isComponentDecorator);
      if (dec && ts.isCallExpression(dec.expression)) {
        const arg = dec.expression.arguments[0];
        if (arg && ts.isObjectLiteralExpression(arg) && !arg.getText(sf).includes('data-dl-file')) {
          const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
          const value = `${rel}:${line}`;
          const host = arg.properties.find(
            (p) => p.name !== undefined && p.name.getText(sf).replace(/['"]/g, '') === 'host',
          );
          if (host && ts.isPropertyAssignment(host) && ts.isObjectLiteralExpression(host.initializer)) {
            const at = host.initializer.getStart(sf) + 1;
            edits.push({ pos: at, text: ` 'data-dl-file': '${value}',` });
          } else {
            const at = arg.getStart(sf) + 1;
            edits.push({ pos: at, text: ` host: { 'data-dl-file': '${value}' },` });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  edits.sort((a, b) => b.pos - a.pos);
  let out = code;
  for (const e of edits) out = out.slice(0, e.pos) + e.text + out.slice(e.pos);
  return out;
}

/** TransformerFactory wrapper for build integration (custom-webpack etc.). */
export function createStampTransformer(rootDir: string): ts.TransformerFactory<ts.SourceFile> {
  return () => (sourceFile) => {
    const transformed = transformSource(sourceFile.getFullText(), sourceFile.fileName, rootDir);
    if (transformed === sourceFile.getFullText()) return sourceFile;
    return ts.createSourceFile(
      sourceFile.fileName,
      transformed,
      sourceFile.languageVersion,
      true,
      ts.ScriptKind.TS,
    );
  };
}
```

> Note on the merge test: the injected text `' 'data-dl-file': 'x.component.ts:2','` lands right after the host object's `{`, producing `host: { 'data-dl-file': 'x.component.ts:2', 'class': 'y' }`. Both substrings asserted by the test are present.

- [ ] **Step 5: Run it — expect PASS**

Run: `npx vitest run tests/tools/stamp-transformer.test.ts`
Expected: 5 passing.

- [ ] **Step 6: Create `tools/dl-stamp-transformer/README.md`**

```markdown
# DevLens stamper (reference)

DEV-ONLY TypeScript transformer that stamps each Angular component host element
with `data-dl-file="<relpath>:<line>"`, which the DevLens extension reads to open
the component in your IDE.

## ⚠️ Dev only
Never enable this in production builds. It writes source paths into the DOM.

## How it works
For every `@Component({...})`, it injects
`host: { 'data-dl-file': '<path-relative-to-rootDir>:<line>' }` (merging into an
existing `host` if present). Paths are project-relative; set your local **Project
root** in the DevLens options so the extension can build an absolute path.

## Wiring (Angular custom-webpack)
1. `npm i -D @angular-builders/custom-webpack`
2. Point the build at a custom webpack config that registers the transformer as a
   `ts-loader` / `@ngtools/webpack` `getCustomTransformers` *before* transform:

   ```js
   // webpack.dev.js
   const { createStampTransformer } = require('./tools/dl-stamp-transformer/transformer');
   module.exports = (config) => {
     // locate the AngularWebpackPlugin and add a before-transformer:
     // plugin.options.transformers / loader options vary by Angular version.
     // The transformer factory you need is:
     const before = createStampTransformer(process.cwd());
     // ...register `before` as a TS "before" custom transformer for dev builds.
     return config;
   };
   ```
3. Use this config **only** in the dev configuration of `angular.json`.

Exact registration differs across Angular versions/builders — adapt
`createStampTransformer(rootDir)` into your build's custom-transformer hook.
```

- [ ] **Step 7: Checkpoint (no git)** — reference stamper complete and tested.

---

## Task 5: README + final verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update `README.md`** — replace the `## Use` section and add an "Open in IDE" section:

```markdown
## Use
Click the toolbar icon or press `Alt+Shift+C` to toggle inspect mode, hover to see
the component/page. The **click action** is configurable in Options:
- **Copy identity path** (default) — copies e.g. `app-user-card › UserCardComponent`.
- **Open in IDE** — opens the component's source file in your editor (Angular only;
  requires the dev stamper, below).
- **Do nothing**.
Press `Esc` to exit.

## Open in IDE (Angular)
1. Wire the dev-only stamper from `tools/dl-stamp-transformer/` into your Angular
   dev build (see its README). It stamps `data-dl-file` onto component hosts.
2. In DevLens Options, set **Click action = Open in IDE**, pick your **IDE**
   (VS Code / Cursor / JetBrains / Custom), and set **Project root** to your local
   absolute project path.
3. Inspect → click a component → it opens at the right file and line.

If no source info is found (production, or stamper not wired), "Open in IDE" falls
back to copying the identity path.
```

- [ ] **Step 2: Full verification + rebuild**

Run: `npm test && npm run typecheck && npm run build`
Expected: all tests pass; no type errors; `dist/chromium` + `dist/firefox` rebuilt.

- [ ] **Step 3: Checkpoint (no git)** — feature complete.

---

## Self-Review Notes (verification against spec)

- Spec §4 data model → Task 2 (InspectResult), Task 3 Step 1 (Settings/defaults). ✓
- Spec §5 `ide.ts`/`buildOpenUrl` → Task 1. ✓
- Spec §6 read `data-dl-file` → Task 2 (`findSourceFile`). ✓
- Spec §7 click flow (copy/open/none + fallback hint) → Task 3 Steps 3,5. ✓
- Spec §8 options UI → Task 3 Steps 9,10. ✓
- Spec §9 reference stamper → Task 4. ✓
- Spec §10 edge cases → `buildOpenUrl` null paths (Task 1), fallback (Task 3), Windows normalization (Task 1), outside-root/double-stamp skip (Task 4). ✓
- Spec §11 testing → tests in every task. ✓
- Type consistency: `Settings` (with `clickAction`/`ide`/`ideUrlTemplate`/`projectRoot`), `InspectResult` (`sourceFile`/`sourceLine`), `buildOpenUrl(settings,file,line)`, controller deps `resolveOpenUrl`/`openUrl` — used identically across tasks. ✓
- Live settings: `storage.onChanged` reassigns the `settings` closure variable that `resolveOpenUrl` reads (Task 3 Step 8). ✓
```
