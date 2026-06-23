# DevLens stamper (reference)

DEV-ONLY TypeScript transformer that stamps each Angular component host element
with `data-dl-file="<relpath>:<line>"`, which the DevLens extension reads to open
the component in your IDE.

## ⚠️ Dev only

Never enable this in production builds. It writes source paths into the DOM.

## How it works

For every `@Component({...})`, it injects
`host: { 'data-dl-file': '<path-relative-to-rootDir>:<line>' }` (merging into an
existing `host` if present, and skipping components already stamped). Paths are
project-relative; set your local **Project root** in the DevLens options so the
extension can build an absolute path.

## API

- `createStampTransformer(rootDir): ts.TransformerFactory<ts.SourceFile>` — register
  this as a TypeScript **before** custom transformer in your dev build.
- `transformSource(code, fileName, rootDir): string` — the pure core (used by tests
  and any custom integration).

## Wiring (Angular custom-webpack)

1. `npm i -D @angular-builders/custom-webpack`
2. In `angular.json`, switch the **development** configuration's builder to
   `@angular-builders/custom-webpack:browser` and point `customWebpackConfig.path`
   at a config that registers the transformer:

   ```js
   // webpack.dev.js
   const { createStampTransformer } = require('./tools/dl-stamp-transformer/transformer');

   module.exports = (config) => {
     const before = createStampTransformer(process.cwd());
     // Find Angular's TS loader / AngularWebpackPlugin and add `before` as a
     // "before" custom transformer for DEV builds. The exact hook varies by
     // Angular version; with @ngtools/webpack you supply it via the plugin's
     // `directTemplateLoading`/transformers options or a ts-loader
     // `getCustomTransformers: () => ({ before: [before] })`.
     return config;
   };
   ```

3. Ensure this config is used **only** in the dev configuration — never production.

Exact registration differs across Angular versions/builders; adapt
`createStampTransformer(rootDir)` into your build's custom-transformer hook.
