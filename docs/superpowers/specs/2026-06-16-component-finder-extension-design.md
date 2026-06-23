# ComponentFinder — Browser Extension Design Spec

**Date:** 2026-06-16
**Status:** Approved (brainstorming complete) — ready for implementation planning
**Author:** praveen.kumar@rapiddata.com

## 1. Purpose

A browser extension that lets developers hover over any part of a running web
application and instantly see the corresponding **Angular component** or
**Mendix page/widget** identity — without opening DevTools, inspecting elements,
or grepping the project. It works on locally running dev apps and on deployed
apps across environments, with **no changes required to the target application**.

## 2. Goals & Non-Goals

### Goals
- Toggle an "inspect mode" and hover to see the component/page name.
- Support **Angular** and **Mendix** with a shared UI and per-framework adapters.
- Work with **zero cooperation** from the target app (no build plugins, no source
  edits). Source maps are used opportunistically if already present.
- Show, per user-configurable toggles: component/page **name**, **hierarchy
  breadcrumb**, **identity path**, and **copy-on-click**.
- Ship for **Chrome, Brave, and Firefox**.
- Request **minimal permissions** (`activeTab` + `scripting`; on-demand only).

### Non-Goals (v1)
- Editing/round-tripping to source files.
- Inspecting cross-origin iframes (flagged as a known limitation).
- Frameworks other than Angular and Mendix.
- True filesystem source paths when no source maps are present (see §6).

## 3. Key Decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Frameworks | Angular **and** Mendix, built together |
| App cooperation | **Zero app changes** (source maps used only if already loaded) |
| Activation | **Toggle inspect mode** (toolbar icon / hotkey), not always-on |
| Site scope | **activeTab on demand** — inject only the current tab when activated |
| Tooltip fields | name + breadcrumb + identity path + copy-on-click, **all toggleable in settings** |
| Browsers | Chrome, Brave (one Chromium build), Firefox (polyfill + manifest variant) |
| Detection architecture | **Hybrid**: DOM signals always + main-world bridge for runtime internals |
| Source path semantics | **Identity path** (selector+class / module.page+widget), upgraded to real path only if source maps present |

## 4. Architecture & Components

Each unit has a single responsibility and a well-defined interface.

### 4.1 Manifest (MV3)
- Permissions: `activeTab`, `scripting`. No broad host permissions.
- A toolbar **action** and a **keyboard command** (default `Alt+Shift+C`).
- Two variants from one source:
  - `manifest.chromium.json` — `background.service_worker`.
  - `manifest.firefox.json` — `background.scripts` + `browser_specific_settings`.
- `webextension-polyfill` smooths `chrome.*` vs `browser.*`.

### 4.2 Background service worker (coordinator)
- Tracks **per-tab on/off** inspect state.
- On toolbar click / hotkey: toggles the active tab's state; on first activation,
  injects the content script and main-world bridge via `scripting.executeScript`
  (permitted by `activeTab`).
- Sends activate/deactivate messages to the content script.

### 4.3 Content script — UI controller (isolated world)
- Owns all visuals inside a **Shadow DOM** overlay (style isolation both ways):
  - highlight box around the hovered element,
  - tooltip (renders only settings-enabled fields),
  - mini in-page toolbar: status, detected framework, ⚙ settings button.
- Throttled cursor tracking (~60ms via `requestAnimationFrame`).
- Sends `{x, y}` to the bridge; renders the returned result.
- Handles **copy-on-click** and `Esc`-to-exit; reads settings from `chrome.storage`.

### 4.4 Main-world bridge (injected `world: 'MAIN'`)
- Injected **from an extension file** (not inline) so page CSP cannot block it.
- Reads internals the isolated world cannot see (`window.ng`, `window.mx`,
  `__ngContext__`).
- Receives `{x, y}` via `postMessage`, resolves the node with
  `document.elementFromPoint`, runs the adapter, posts back a **plain JSON**
  result. (Coords cross the boundary; DOM objects cannot.)

### 4.5 Framework adapters (pure, unit-testable)
Each returns a normalized result: `{ framework, name, breadcrumb[], identityPath, tag, notes? }`.
- **angular-adapter** — `ng.getComponent()` / `__ngContext__` (dev); falls back to
  nearest custom-element selector/tag (survives prod); breadcrumb by walking
  ancestors. `identityPath` = `selector › ClassName` (class may be `(minified)` in prod).
- **mendix-adapter** — `mx-name-<Widget>` classes for the widget; current page from
  the `mx` runtime; breadcrumb from nested `mx-name-*` ancestors. `identityPath` =
  `Module.Page › widget`.
- **generic-adapter** — fallback: tag / id / classes.
- **detectFramework()** — Angular markers (`ng-version`, `_nghost`, `window.ng`)
  vs Mendix markers (`.mx-app`, `window.mx`).

### 4.6 Options / settings page
- Toggles: name, breadcrumb, identity path, copy-on-click; tooltip position.
- Persisted in `chrome.storage.sync`. Defaults: all on, tooltip follows cursor.

### 4.7 Shared module
- Message types, settings schema, the normalized result type, messaging helpers.

## 5. Data Flow

1. User clicks toolbar icon (or hotkey).
2. Background flips tab state; first time, injects content script + bridge; sends **activate**.
3. Content script shows mini-toolbar, attaches throttled `mousemove`.
4. On move: draws highlight box, posts `{x, y}` to bridge.
5. Bridge resolves element → adapter → posts back `{ framework, name, breadcrumb[], identityPath, tag, notes? }`.
6. Content script renders the tooltip with only settings-enabled fields, kept on-screen.
7. **Click**: copy configured value (default: name), flash "Copied ✓", and
   `preventDefault`/`stopPropagation` so the app's own click doesn't fire.
8. Toggle off (icon / hotkey / `Esc`): remove listeners + overlay; page untouched.

## 6. Source / Identity Path Semantics

True filesystem paths are **not** recoverable at runtime with zero app changes and
no source maps (Angular exposes no such API; DevTools needs source maps). Therefore:
- Default field is an **identity path**, always available and useful for locating
  the component:
  - Angular: `app-user-card › UserCardComponent`
  - Mendix: `MyModule.UserOverview › dataView`
- If source maps are already loaded for the page, upgrade to the real
  file path opportunistically.

## 7. Edge Cases & Error Handling

- **No framework** → generic adapter; tooltip notes "No Angular/Mendix detected."
- **Production-minified Angular** → show selector; minified class tagged
  `(minified)`; always fall back to nearest named ancestor — never crash.
- **Restricted pages** (`chrome://`, store, PDF) → injection fails silently;
  toolbar shows a disabled "can't inspect here" state.
- **Cross-origin iframes** → v1 inspects top frame + same-origin frames; tooltip
  notes un-injectable iframes. Known v1 limitation.
- **Clipboard failure** → fall back to a selectable text snippet + brief error toast.
- **Bridge not ready** → show "detecting…", retry, and degrade to the DOM-only
  result if the bridge never answers.

## 8. Testing Strategy

- **Unit (jsdom):** each adapter vs fixture DOMs — Angular custom-tag, Angular
  `__ngContext__` mock, Mendix `mx-name-*`, breadcrumb walking, generic fallback,
  `detectFramework()`.
- **Integration (Playwright + unpacked extension):** load test pages → activate →
  assert highlight box, tooltip text, copy-on-click. Fixtures: a tiny Angular **dev**
  app, an Angular **prod** build, a captured Mendix DOM snapshot.
- **Cross-browser smoke:** unpacked in Chrome/Brave + temporary add-on in Firefox;
  verify activation, overlay, copy.

## 9. Build & Tooling

- **TypeScript + esbuild** (lightweight), four entry points: background, content
  script, main-world bridge, options page.
- `webextension-polyfill` for cross-browser APIs.
- Build script emits **two zips** (Chromium + Firefox) from shared source, swapping
  the manifest variant.

### Project layout
```
src/
  background.ts
  content/        controller, overlay, tooltip (Shadow DOM)
  bridge/         main-world entry + adapters (angular, mendix, generic, detect)
  options/        settings page + storage
  shared/         types, messaging, settings schema
manifest.chromium.json
manifest.firefox.json
build.mjs
```

## 10. Known v1 Limitations

- Cross-origin iframes are not inspected.
- True file paths only when source maps are already present.
- Fully minified Angular components using attribute selectors may show only a
  minified/`(minified)` class plus the nearest named ancestor.
- Frameworks beyond Angular and Mendix are out of scope.
