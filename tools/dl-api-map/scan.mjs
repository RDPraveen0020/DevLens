import ts from 'typescript';

const VERBS = new Set(['get', 'post', 'put', 'delete', 'patch']);

function isComponentDecorator(dec) {
  const expr = dec.expression;
  return ts.isCallExpression(expr) && ts.isIdentifier(expr.expression) && expr.expression.text === 'Component';
}

function flattenPlus(node, parts) {
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    flattenPlus(node.left, parts);
    flattenPlus(node.right, parts);
  } else {
    parts.push(node);
  }
}

function isBaseExpr(node, sf) {
  return /baseurl|apiurl|environment\.api|apibase|baseapi/.test(node.getText(sf).toLowerCase());
}

function extractPath(arg, sf) {
  const parts = [];
  flattenPlus(arg, parts);
  let out = '';
  for (const p of parts) {
    if (ts.isStringLiteralLike(p)) {
      out += p.text;
    } else if (ts.isTemplateExpression(p)) {
      out += p.head.text;
      for (const span of p.templateSpans) out += '{param}' + span.literal.text;
    } else if (isBaseExpr(p, sf)) {
      // drop the base URL part
    } else {
      out += '{param}';
    }
  }
  return out.replace(/^\/+/, '');
}

export function extractEndpoints(code, fileName) {
  const sf = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const results = [];

  const visitClass = (cls) => {
    const className = cls.name.text;
    const endpoints = [];
    const seen = new Set();
    const walk = (node) => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const verb = node.expression.name.text;
        const objText = node.expression.expression.getText(sf).toLowerCase();
        if (VERBS.has(verb) && objText.includes('http') && node.arguments.length > 0) {
          const path = extractPath(node.arguments[0], sf);
          const method = verb.toUpperCase();
          const key = `${method} ${path}`;
          if (path && !seen.has(key)) {
            seen.add(key);
            endpoints.push({ method, path });
          }
        }
      }
      ts.forEachChild(node, walk);
    };
    walk(cls);
    if (endpoints.length) results.push({ className, endpoints });
  };

  const visit = (node) => {
    if (ts.isClassDeclaration(node) && node.name) visitClass(node);
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return results;
}

export function extractInjections(code, fileName) {
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
            const selectors = selProp.initializer.text
              .split(',')
              .map((s) => s.trim())
              .filter((s) => /^[a-zA-Z][\w-]*$/.test(s));
            const serviceTypes = [];
            const ctor = node.members.find((m) => ts.isConstructorDeclaration(m));
            if (ctor) {
              for (const param of ctor.parameters) {
                if (param.type && ts.isTypeReferenceNode(param.type)) {
                  serviceTypes.push(param.type.typeName.getText(sf));
                }
              }
            }
            for (const selector of selectors) out.push({ selector, serviceTypes });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

export function buildApiMap(files) {
  // Pass 1: each service's endpoints, stored once.
  const services = {};
  for (const f of files) {
    for (const { className, endpoints } of extractEndpoints(f.code, f.fileName)) {
      services[className] = endpoints;
    }
  }

  // Pass 2: components reference services by name (only services we actually have).
  const components = {};
  for (const f of files) {
    for (const { selector, serviceTypes } of extractInjections(f.code, f.fileName)) {
      const used = [];
      const seen = new Set();
      for (const svc of serviceTypes) {
        if (services[svc] && !seen.has(svc)) {
          seen.add(svc);
          used.push(svc);
        }
      }
      if (used.length) components[selector] = used;
    }
  }

  return { services, components };
}
