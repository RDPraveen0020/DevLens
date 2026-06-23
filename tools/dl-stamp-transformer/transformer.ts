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
    const original = sourceFile.getFullText();
    const transformed = transformSource(original, sourceFile.fileName, rootDir);
    if (transformed === original) return sourceFile;
    return ts.createSourceFile(
      sourceFile.fileName,
      transformed,
      sourceFile.languageVersion,
      true,
      ts.ScriptKind.TS,
    );
  };
}
