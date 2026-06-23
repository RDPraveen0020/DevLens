# DevLens API map

Generates `selector -> [{ service, method, path }]` so DevLens can show the API
endpoints a hovered component triggers (the endpoints of the services it injects).
DEV ONLY. No source changes; works on any Angular build.

## Generate
```bash
node tools/dl-api-map/cli.mjs            # writes src/assets/devlens-api-map.json
```
Add a prestart hook (optional) to keep both maps fresh:
```jsonc
"scripts": {
  "prestart": "node tools/dl-selector-map/cli.mjs && node tools/dl-api-map/cli.mjs",
  "start": "ng serve -o"
}
```

## Import
In DevLens **Options** → **API map**, import `src/assets/devlens-api-map.json`, and
tick **Show API calls**. Hover a component to see its endpoints.

## How it works / limits
- Extracts `this.http.get/post/put/delete/patch(base + "literal")` calls per service.
- Attributes a service's endpoints to every component that injects it (service-level).
- Static: shows referenced endpoints, not runtime calls. Fully dynamic URLs become
  `{param}`-heavy or are skipped.
