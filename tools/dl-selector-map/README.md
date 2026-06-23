# DevLens selector map (recommended for Angular)

Generates a `selector → "relpath:line"` map the DevLens extension uses to open a
component's source in your IDE — **without modifying your component source files**
and **without any Angular build/compiler integration**. Works on any Angular
version and builder (webpack `:browser`, esbuild `:application`, etc.).

## How it works

1. `cli.mjs` scans `src/**/*.component.ts`, reads each `@Component({ selector: '…' })`,
   and writes `src/assets/devlens-map.json`, e.g.:

   ```json
   { "app-user-card": "src/app/users/user-card.component.ts:12" }
   ```

2. Angular's dev server serves it at `/assets/devlens-map.json`.
3. When you click a component in DevLens inspect mode (Click action = **Open in
   IDE**), the extension fetches that map, looks up the component's selector, joins
   your configured **Project root**, and opens the file at the right line.

Only **element** selectors (e.g. `app-user-card`) are indexed; attribute/class
selectors are skipped (they have no DOM tag to match).

## Setup

1. Copy this `tools/dl-selector-map/` folder into your Angular project (it needs the
   `typescript` package, which Angular projects already have).
2. Generate the map once:

   ```bash
   node tools/dl-selector-map/cli.mjs
   ```

3. Keep it fresh automatically — add a `prestart` script so it regenerates on every
   `ng serve`:

   ```jsonc
   // package.json
   "scripts": {
     "prestart": "node tools/dl-selector-map/cli.mjs",
     "start": "ng serve -o"
   }
   ```

4. In DevLens **Options**: Click action = **Open in IDE**, pick your **IDE**, and set
   **Project root** to your absolute project path
   (e.g. `D:/RapidERP/Projects/HRMS & ATS Application/RapidHR - Main FE`).

5. (Optional) Git-ignore the generated file: add `src/assets/devlens-map.json` to
   `.gitignore`.

## Custom paths

```bash
node tools/dl-selector-map/cli.mjs <srcDir> <outFile>
# e.g. node tools/dl-selector-map/cli.mjs src src/assets/devlens-map.json
```

`rootDir` (what relative paths are computed against) is the current working
directory — run the command from your project root so it matches the DevLens
**Project root** setting.
