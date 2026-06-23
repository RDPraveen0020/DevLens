import ts from 'typescript';
import path from 'node:path';

function toRel(rootDir, fileName) {
  const r = rootDir.replace(/\\/g, '/');
  const f = fileName.replace(/\\/g, '/');
  return path.posix.relative(r, f);
}

function isComponentDecorator(dec) {
  const expr = dec.expression;
  return (
    ts.isCallExpression(expr) &&
    ts.isIdentifier(expr.expression) &&
    expr.expression.text === 'Component'
  );
}

/**
 * Extract element-selector → "relpath:line" entries from a single .ts source.
 * Only simple element selectors (e.g. "app-user-card") are indexed; attribute/
 * class selectors (e.g. "[appFoo]") are skipped since they aren't DOM tag names.
 */
export function extractComponents(code, fileName, rootDir) {
  const rel = toRel(rootDir, fileName);
  if (rel.startsWith('..')) return [];

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
            const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
            const ref = `${rel}:${line}`;
            for (const sel of selProp.initializer.text.split(',').map((s) => s.trim())) {
              if (/^[a-zA-Z][\w-]*$/.test(sel)) out.push({ selector: sel, ref });
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/** Build a selector → "relpath:line" map from many files. Later files win on conflict. */
export function buildMap(files, rootDir) {
  const map = {};
  for (const f of files) {
    for (const c of extractComponents(f.code, f.fileName, rootDir)) {
      map[c.selector] = c.ref;
    }
  }
  return map;
}
