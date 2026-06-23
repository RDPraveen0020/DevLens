import type { InspectResult } from '../../shared/types';
import { parseFileRef } from '../../shared/ide';

function isCustomElement(el: Element): boolean {
  return el.tagName.includes('-');
}

/**
 * Pick the component host to describe: the nearest ancestor whose selector starts
 * with the project's own prefix (e.g. "app-"), so library components (mat-card,
 * p-table, ngx-*) are skipped. Falls back to the nearest custom element.
 */
function pickHost(el: Element, ownPrefix: string | undefined): Element {
  if (ownPrefix) {
    const prefix = `${ownPrefix.toLowerCase()}-`;
    let cur: Element | null = el;
    while (cur) {
      if (isCustomElement(cur) && cur.tagName.toLowerCase().startsWith(prefix)) return cur;
      cur = cur.parentElement;
    }
  }
  let cur: Element | null = el;
  while (cur && !isCustomElement(cur)) cur = cur.parentElement;
  return cur ?? el;
}

function buildBreadcrumb(el: Element): string[] {
  const chain: string[] = [];
  let cur: Element | null = el;
  while (cur) {
    if (isCustomElement(cur)) chain.unshift(cur.tagName.toLowerCase());
    cur = cur.parentElement;
  }
  return chain;
}

function isLikelyMinified(name: string): boolean {
  return name.length <= 2;
}

function findSourceFile(el: Element): { file: string; line?: number } | undefined {
  let cur: Element | null = el;
  while (cur) {
    const raw = cur.getAttribute('data-dl-file');
    if (raw) return parseFileRef(raw);
    cur = cur.parentElement;
  }
  return undefined;
}

function componentClassName(el: Element, win: any): string | undefined {
  const getComponent = win?.ng?.getComponent;
  if (typeof getComponent !== 'function') return undefined;
  try {
    const comp = getComponent(el);
    const name = comp?.constructor?.name;
    return typeof name === 'string' && name.length ? name : undefined;
  } catch {
    return undefined;
  }
}

export function inspectAngular(el: Element, win: any, ownPrefix?: string): InspectResult {
  const host = pickHost(el, ownPrefix);
  const selector = host.tagName.toLowerCase();

  const cls = componentClassName(host, win);
  const minified = cls ? isLikelyMinified(cls) : false;

  const identityParts = [selector];
  if (cls) identityParts.push(minified ? `${cls} (minified)` : cls);

  const source = findSourceFile(el);

  return {
    framework: 'angular',
    name: cls ?? selector,
    breadcrumb: buildBreadcrumb(el),
    identityPath: identityParts.join(' › '),
    tag: el.tagName.toLowerCase(),
    notes: minified ? 'minified' : undefined,
    selector,
    sourceFile: source?.file,
    sourceLine: source?.line,
  };
}
