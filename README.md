# DevLens

A browser extension (Manifest V3) that reveals the **component or page** under your
cursor — across **Angular, React, Vue, Mendix, and Blazor** — in a toggleable inspect
mode. No DevTools, no changes to the target app, works on locally-running *and*
deployed sites.

Hover to see the component's name, identity path, and ancestor hierarchy; click to
copy the identity path.

---

## Features

- **Hover to identify** — shows the nearest *your-app* component (skips library
  components like `mat-card` via a configurable selector prefix).
- **Identity path** — e.g. `app-user-card › UserCardComponent`.
- **Hierarchy breadcrumb** — the full ancestor component chain.
- **Click to copy** the identity path.
- **Toggleable** — toolbar icon or `Alt+Shift+C`; `Esc` to exit.
- **Style-isolated overlay** — rendered in a Shadow DOM, so it never clashes with
  the page's CSS.
- **Cross-browser** — Chromium (Chrome / Brave / Edge) and Firefox.

---

## Supported frameworks

Detection is automatic (`src/bridge/detect.ts`); each framework has its own adapter
under `src/bridge/adapters/`. The overlay works on **any** page — frameworks below
get named components, everything else falls back to a DOM identity.

| Framework | Detected via | What you see |
|-----------|--------------|--------------|
| **Angular** | `ng-version` attr / `window.ng` | Component class + selector + breadcrumb (skips library components via the prefix) |
| **React** | fiber keys (`__reactFiber$…`) / DevTools hook | Nearest component `displayName`/name + ancestor chain |
| **Vue** | `__vueParentComponent` (v3) / `__vue__` (v2) / `data-v-app` | Component name (SFC `name`/file) + ancestor chain |
| **Mendix** | `window.mx` / `mx-name-*` classes | Page + widget names |
| **Blazor** | `window.Blazor` / boundary comments / `b-*` scope | Element + CSS scope hint (component names aren't exposed to JS — noted in the tooltip) |
| **Plain HTML / other** | fallback | `tag#id.class` DOM identity |

Adapters are pluggable, so adding another framework is a single new file + a line in
the detector.

---

## Browser support

| Browser | Package | Notes |
|---------|---------|-------|
| Chrome / Brave / Edge | `dist/chromium` | Chromium MV3 build |
| Firefox | `dist/firefox` | Gecko MV3 build |

Permissions requested: `activeTab`, `scripting`, `storage` — DevLens only reads a
page after you toggle inspect mode on that tab.

---

## Install (Load unpacked)

The quickest way to use or share DevLens — no store account, no fee.

**Chrome / Brave / Edge**
1. Unzip `dist/devlens-chromium-<version>.zip` (or use the `dist/chromium` folder directly).
2. Open `chrome://extensions` (or `brave://extensions`, `edge://extensions`).
3. Enable **Developer mode**.
4. Click **Load unpacked** → select the unzipped folder.

**Firefox**
1. Open `about:debugging` → **This Firefox**.
2. Click **Load Temporary Add-on** → select `dist/firefox/manifest.json`.
   (Temporary add-ons are removed on restart; for a permanent install, upload to
   [addons.mozilla.org](https://addons.mozilla.org) — free, including unlisted/self-hosted signing.)

---

## Usage

1. Click the DevLens toolbar icon or press **`Alt+Shift+C`** to toggle inspect mode.
2. **Hover** any element — the overlay highlights the component and shows a tooltip.
3. **Click** to copy the identity path.
4. Press **`Esc`** to exit inspect mode.

### Options

Open the extension's **Options** page to configure:

| Setting | Description |
|---------|-------------|
| Show component / page name | Toggle the primary name line |
| Show identity path | Toggle the `selector › Class` line |
| Show hierarchy breadcrumb | Toggle the ancestor chain |
| **Component prefix** | Your app's selector prefix (e.g. `app`, from `angular.json`). DevLens shows the nearest component with this prefix, skipping library components. |
| Click action | **Copy identity path** (default) or **Do nothing** |

Settings sync via `chrome.storage.sync`.

---

## Known limitations

- Cross-origin iframes are not inspected.
- Source file paths require the selector map (Open in IDE feature); without it, only
  the identity path is shown.
- Fully minified Angular components with attribute selectors may show a minified class
  name plus the nearest named ancestor.
- The Playwright smoke test (`npm run test:e2e`) needs a headed browser and a prior
  `npm run build:chromium`; the authoritative coverage is the Vitest suite.

---

## License

Private / internal (`"private": true`). Not currently published under an open-source
license.
