# DevLens — "Open Component in IDE" Design Spec

**Date:** 2026-06-16
**Status:** Approved (brainstorming complete) — ready for implementation planning
**Author:** praveen.kumar@rapiddata.com
**Builds on:** the DevLens extension (see `2026-06-16-component-finder-extension-design.md`)

## 1. Purpose

Let a developer, in DevLens inspect mode, **click a component to open its source
file directly in their IDE** (Hover → Click → Open file). The click action is a
user setting: **Copy identity path**, **Open in IDE**, or **Do nothing**.

## 2. Goals & Non-Goals

### Goals
- Click an inspected element → open its Angular component source at the right
  file and line in the configured editor.
- Click action is a configurable toggle (`copy` / `open` / `none`).
- Support **VS Code, Cursor, JetBrains (WebStorm/IntelliJ)** presets + a fully
  custom URL template.
- Resolve the file path reliably via an **opt-in, dev-only build stamper** that
  writes `data-dl-file="<relpath>:<line>"` onto component host elements.
- Keep stamped paths **project-relative** (team-portable); the extension prepends
  each developer's local **project root**.
- Provide a **reference stamper** (TypeScript transformer + wiring docs) — not a
  fully packaged plugin.

### Non-Goals (v1)
- Mendix "open in IDE" (Mendix pages are not IDE-editable source) — Angular only.
- A turnkey build plugin covering every Angular builder (webpack + esbuild + …).
- Detecting whether the editor is installed / the open succeeded.
- Production support for opening files (stamper is dev-only).

## 3. Key Decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Path resolution | **Opt-in dev build stamper** writing `data-dl-file="<relpath>:<line>"` |
| Stamper scope | Extension consumer + **reference TypeScript transformer** + wiring docs |
| Framework | **Angular only** for IDE-open (Mendix excluded) |
| Open mechanism | **Transient anchor-click** in the content script (no extra tab/permission) |
| IDE presets | VS Code, Cursor, JetBrains, + Custom URL template |
| Path model | Stamper emits **relative** paths; extension prepends configured **projectRoot** |
| Click toggle | `clickAction: 'copy' | 'open' | 'none'` (replaces `copyOnClick`) |

## 4. Data Model & Settings

`src/shared/types.ts`:

```ts
export type ClickAction = 'copy' | 'open' | 'none';
export type IdePreset = 'vscode' | 'cursor' | 'jetbrains' | 'custom';

export interface Settings {
  showName: boolean;
  showBreadcrumb: boolean;
  showIdentityPath: boolean;
  clickAction: ClickAction;   // replaces copyOnClick
  ide: IdePreset;
  ideUrlTemplate: string;     // used when ide === 'custom'
  projectRoot: string;        // prepended to relative data-dl-file paths
  tooltipPosition: 'cursor' | 'top-left';
}
```

`DEFAULT_SETTINGS`: display fields `true`; `clickAction: 'copy'`; `ide: 'vscode'`;
`ideUrlTemplate: 'vscode://file/{path}:{line}:{col}'`; `projectRoot: ''`;
`tooltipPosition: 'cursor'`.

`InspectResult` gains:

```ts
  sourceFile?: string; // project-relative (or absolute) path from data-dl-file
  sourceLine?: number; // 1-based line, if present
```

## 5. IDE URL Building — `src/shared/ide.ts` (pure)

```ts
export const IDE_TEMPLATES: Record<Exclude<IdePreset, 'custom'>, string> = {
  vscode: 'vscode://file/{path}:{line}:{col}',
  cursor: 'cursor://file/{path}:{line}',
  jetbrains: 'jetbrains://open?file={path}&line={line}',
};

export function buildOpenUrl(
  settings: Settings,
  file: string,
  line: number | undefined,
): string | null;
```

Behavior:
- Pick template: preset from `IDE_TEMPLATES`, or `settings.ideUrlTemplate` when
  `ide === 'custom'`. No template → `null`.
- Resolve path: if `file` is absolute (`/…` or `C:\…`/`C:/…`) use as-is; else if
  `projectRoot` is set, join `projectRoot` + `file`; else → `null`.
- Normalize backslashes to `/`.
- Substitute `{path}`, `{line}` (default `1`), `{col}` (default `1`).

## 6. Reading File Metadata (bridge)

A shared helper `findSourceFile(el)` walks ancestors to the nearest
`[data-dl-file]`, parses `"<path>:<line>"` (line optional), and returns
`{ file, line }`. `inspectAngular` calls it and sets `sourceFile`/`sourceLine`.
Absent attribute → fields stay undefined. Rides the existing bridge→content
message; no new round trips.

## 7. Click Flow — `InspectController.onClick`

New injected deps: `resolveOpenUrl(result) => string | null` and
`openUrl(url) => void`.

```
switch settings.clickAction:
  'none' → return (no preventDefault; page behaves normally)
  'copy' → preventDefault + stopPropagation; copy identityPath || name
  'open' → preventDefault + stopPropagation;
           url = resolveOpenUrl(result)
           if url → openUrl(url)
           else   → copy identityPath || name + flash overlay hint
                    "No source info — set project root / add the stamper."
```

`entry.ts` wiring:
- `resolveOpenUrl = (r) => r.sourceFile ? buildOpenUrl(settings, r.sourceFile, r.sourceLine) : null`
- `openUrl = (url) => { create hidden <a href=url>, append, click, remove }`
- Subscribe to `chrome.storage.onChanged` to refresh `settings` live (so changing
  click-action/IDE applies without re-activating).

## 8. Options UI — `options.html` + `options.ts`

Add alongside the display-field checkboxes:
- **Click action** `<select>`: Copy identity path / Open in IDE / Do nothing
  (replaces the old copy checkbox).
- **IDE** `<select>`: VS Code / Cursor / JetBrains / Custom.
- **Custom URL template** text input (shown only when IDE = Custom).
- **Project root** text input (absolute local path; note: prepended to stamped
  relative paths).

`options.ts` is generalized to bind checkboxes, selects, and text inputs to
`chrome.storage.sync`, persisting on `change`.

## 9. Reference Stamper — `tools/dl-stamp-transformer/`

Dev-only TypeScript transformer. For each class with a `@Component({...})`
decorator, compute the file path relative to a configured `rootDir` and the
decorator's 1-based line, then add `'data-dl-file': '<relpath>:<line>'` to the
decorator's `host` object (create if absent, merge if present). Skips files
outside `rootDir` and components already carrying the attribute.

API:
- `createStampTransformer(rootDir): ts.TransformerFactory<ts.SourceFile>`
- `transformSource(code, fileName, rootDir): string` — runs the transform over a
  string and returns emitted code (the unit-test entry point).

`tools/dl-stamp-transformer/README.md` documents wiring via
`@angular-builders/custom-webpack`, stressing **dev configuration only — never
enable for production**.

## 10. Edge Cases & Error Handling

- **No `data-dl-file`** (prod / stamper not wired) → `resolveOpenUrl` → `null` →
  copy fallback + overlay hint.
- **No `projectRoot`** with a relative path → `buildOpenUrl` → `null` → same fallback.
- **Absolute `data-dl-file`** → used as-is.
- **Windows paths** → backslashes normalized to `/`.
- **Editor not installed / protocol unregistered** → nothing opens; undetectable
  from the page (documented limitation).
- **First open** → OS may prompt "Open VS Code?" — expected.

## 11. Testing

- **`ide.ts`** — each preset, custom template, projectRoot join, absolute-path
  passthrough, Windows normalization, `{line}` substitution, `null` cases.
- **`angular-adapter`** — `data-dl-file` on nearest ancestor → `sourceFile`/
  `sourceLine`; absent when no attribute.
- **`controller.onClick`** — `copy` copies path; `open`+resolvable → `openUrl`;
  `open`+`null` → copy fallback; `none` → no-op.
- **storage/options** — round-trip of new fields over updated `DEFAULT_SETTINGS`.
- **stamper** — `transformSource` injects `data-dl-file` for a sample component;
  leaves non-components untouched; merges into existing `host`.
- Existing tests updated for `copyOnClick` → `clickAction`.

## 12. Files

```
src/shared/types.ts        (modify: Settings, ClickAction, IdePreset, InspectResult, DEFAULT_SETTINGS)
src/shared/ide.ts          (new: IDE_TEMPLATES, buildOpenUrl)
src/bridge/adapters/angular.ts  (modify: findSourceFile + sourceFile/sourceLine)
src/content/controller.ts  (modify: onClick switch + new deps)
src/content/entry.ts       (modify: wire resolveOpenUrl + openUrl + storage.onChanged)
src/options/options.html   (modify: click-action/IDE selects, template + root inputs)
src/options/options.ts     (modify: generalized binding)
tools/dl-stamp-transformer/transformer.ts   (new: createStampTransformer, transformSource)
tools/dl-stamp-transformer/README.md        (new: wiring docs, dev-only warning)
tests/...                  (new + updated per §11)
```

## 13. Known v1 Limitations

- Angular only; Mendix excluded from IDE-open.
- Requires the dev-only stamper wired into the Angular build; without it, "open"
  falls back to copy.
- Reference stamper targets the custom-webpack case; other builders need adaptation.
- Cannot confirm the editor actually opened.
