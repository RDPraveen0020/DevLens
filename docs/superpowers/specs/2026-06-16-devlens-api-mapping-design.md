# DevLens — API Call Mapping Design Spec

**Date:** 2026-06-16
**Status:** Approved (brainstorming complete) — ready for implementation planning
**Author:** praveen.kumar@rapiddata.com
**Builds on:** DevLens extension + selector map (open-in-IDE).

## 1. Purpose

When hovering a component in DevLens inspect mode, show the **API endpoints that
component triggers** — derived statically from source, so it works on local and
deployed apps alike.

## 2. Goals & Non-Goals

### Goals
- Show, per hovered component, the endpoints reachable through the services it
  injects (service-level granularity).
- Static analysis (no runtime interception); deterministic; works on deployed apps.
- Reuse the existing selector-resolution (nearest *own* component) and the
  import-into-extension model.
- Degrade softly: no API map → APIs section just hidden; nothing else breaks.

### Non-Goals (v1)
- Runtime/observed network capture (method/url/status/timing of actual calls).
- Method-level precision (only the endpoints the component's methods actually call).
- Non-Angular frameworks.
- Resolving fully dynamic URLs built outside `this.http.<verb>(...)`.

## 3. Key Decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Data source | **Static** source analysis (not runtime) |
| Granularity | **Service-level** — all endpoints of a component's injected services |
| Map delivery | **Separate** `devlens-api-map.json`, imported into the extension (own storage key) |
| Resolution | Reuse **nearest-own-component** (breadcrumb) logic |
| Display | Tooltip **APIs** section, grouped by service, capped |

## 4. Scanner — `tools/dl-api-map/`

New dev tool (sibling to `dl-selector-map`). Outputs `devlens-api-map.json`:
`selector → ApiEndpoint[]`, where `ApiEndpoint = { service: string; method: string; path: string }`.

Two-pass TypeScript-AST analysis:

### Pass 1 — service endpoints (`extractEndpoints`)
For each `.ts`, for each class, find `<obj>.<verb>(arg0, …)` calls where:
- `verb ∈ {get, post, put, delete, patch}`, and
- the call object's text contains `http` (case-insensitive) — matches `this.http`,
  `this._http`, `this.httpClient`.

From `arg0` derive **path** by flattening a `+` chain (or single literal):
- string literal / no-substitution template → its text;
- base expressions (`baseURL`, `baseUrl`, `environment.api`, `apiUrl`, member access
  ending in those) → dropped;
- template literal with substitutions → quasis joined, each `${…}` → `{param}`;
- any other expression (e.g. `+ id`) → `{param}`.

Concatenate parts, trim leading `/`. Skip if the resulting path is empty.
**method** = verb uppercased. Build `className → ApiEndpoint[]` (service = className).

### Pass 2 — component injections (`extractInjections`)
For each `@Component`, capture `selector` (element selectors only, like the selector
map) and the constructor parameter **type names**. Look each type up in the Pass-1
index; union its endpoints under the component's selector. De-duplicate endpoints by
`service|method|path`. Non-service injections aren't in the index → ignored.

### Core API (testable, `scan.mjs`)
- `extractEndpoints(code, fileName): { className: string; endpoints: ApiEndpoint[] }[]`
- `extractInjections(code, fileName): { selector: string; serviceTypes: string[] }[]`
- `buildApiMap(files: { fileName; code }[]): Record<string, ApiEndpoint[]>`
- `cli.mjs` walks `src/**/*.ts`, writes `src/assets/devlens-api-map.json`.

## 5. Extension Integration

### Types (`src/shared/types.ts`)
```ts
export interface ApiEndpoint { service: string; method: string; path: string; }
export type ApiMap = Record<string, ApiEndpoint[]>;
```
`Settings` gains `showApis: boolean` (default `true`) and `apiLimit: number` (default `10`).

### Storage (`src/options/map-store.ts`)
Add `API_MAP_KEY = 'devlensApiMap'` with `loadApiMapFromStorage()` /
`saveApiMapToStorage()` / `clearApiMapFromStorage()` (storage.local), mirroring the
selector-map functions.

### Shared resolution (`src/shared/ide.ts`)
Extract the nearest-own-component walk into a pure helper:
```ts
export function nearestSelectorInMap(
  breadcrumb: string[], selector: string | undefined, map: Record<string, unknown> | null | undefined,
): string | null
```
Refactor `resolveOpenUrlFor` to use it (behaviour unchanged; existing tests stay green).

### API resolution (`src/shared/ide.ts`)
```ts
export function resolveApisFor(result: InspectResult, map: ApiMap | null | undefined): ApiEndpoint[] | null
```
Uses `nearestSelectorInMap` against the API map; returns the matched component's
endpoints, or `null`.

### Controller + entry
- New controller dep `resolveApis: (result) => ApiEndpoint[] | null`.
- `entry.ts` loads the API map (`loadApiMapFromStorage`), wires `resolveApis`, and
  reloads it on `storage.local` change of `API_MAP_KEY`.
- In `onBridgeMessage`, when `settings.showApis`, compute endpoints and pass them to
  `renderTooltipHTML(result, settings, apis)`.

### Tooltip (`src/content/tooltip.ts`)
`renderTooltipHTML(result, settings, apis?)` appends an **APIs** section when
`showApis` and `apis?.length`: grouped by `service`, each line `METHOD  path`,
capped at `settings.apiLimit` with a `+N more` note. All text escaped.

### Options page
Add a **Show APIs** checkbox and an **API map** file input + status/clear (mirrors the
selector-map import), wired through the generalized `options.ts` binding.

## 6. Edge Cases

- No API map → APIs section hidden; rest unaffected.
- Component injects no HTTP services → empty list → section hidden.
- Unextractable / dynamic URLs → skipped or `{param}`-heavy; never throws.
- Duplicate endpoints across services → de-duped by `service|method|path`.
- Large lists → capped at `apiLimit` with `+N more`.
- Verb false positives (`form.get`, `map.get`) → excluded by the `http` object check.
- Nearest own component is `app-root` → shows its APIs (usually none).

## 7. Testing

- `extractEndpoints` — verbs; `this.baseURL + "X"` → `{GET,"X"}`; `+ id` → `{param}`;
  ignores `form.get(...)`; ignores non-string first args.
- `extractInjections` — selector + constructor param type names.
- `buildApiMap` — component injecting a service → its endpoints under the selector;
  dedupe; non-service injections ignored.
- `nearestSelectorInMap` — nearest-first match; `resolveOpenUrlFor` still green after refactor.
- `resolveApisFor` — returns nearest component's endpoints; null when absent.
- `renderTooltipHTML` — APIs grouped by service when on + present; omitted when off/empty;
  respects `apiLimit`; escapes HTML.
- `map-store` (api map) — round-trips via storage.local.

## 8. Files

```
tools/dl-api-map/scan.mjs                  (new)
tools/dl-api-map/scan.d.mts                (new)
tools/dl-api-map/cli.mjs                   (new)
tools/dl-api-map/README.md                 (new)
src/shared/types.ts                        (modify: ApiEndpoint, ApiMap, Settings showApis/apiLimit)
src/shared/ide.ts                          (modify: nearestSelectorInMap, resolveApisFor; refactor resolveOpenUrlFor)
src/options/map-store.ts                   (modify: API map load/save/clear)
src/content/tooltip.ts                     (modify: APIs section)
src/content/controller.ts                  (modify: resolveApis dep + pass apis to render)
src/content/entry.ts                       (modify: load api map, wire resolveApis)
src/options/options.html + options.ts      (modify: Show APIs toggle + API map import)
tests/...                                  (new + updated per §7)
```

## 9. Known v1 Limitations

- Service-level (over-includes endpoints the component may not call).
- Angular only; depends on the `this.http.<verb>(base + "literal")` pattern.
- Static — shows referenced endpoints, not actual runtime calls.
- Requires generating + importing the API map (soft dependency).
