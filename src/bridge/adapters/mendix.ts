import type { InspectResult } from '../../shared/types';

const PREFIX = 'mx-name-';

function mxName(el: Element): string | undefined {
  const cls = Array.from(el.classList).find((c) => c.startsWith(PREFIX));
  return cls ? cls.slice(PREFIX.length) : undefined;
}

function buildBreadcrumb(el: Element): string[] {
  const chain: string[] = [];
  let cur: Element | null = el;
  while (cur) {
    const name = mxName(cur);
    if (name) chain.unshift(name);
    cur = cur.parentElement;
  }
  return chain;
}

function currentPage(win: any): string | undefined {
  try {
    const form = win?.mx?.ui?.getContentForm?.();
    const path = form?.path ?? form?.name;
    return typeof path === 'string' && path.length ? path : undefined;
  } catch {
    return undefined;
  }
}

export function inspectMendix(el: Element, win: any): InspectResult {
  let host: Element | null = el;
  let widget: string | undefined;
  while (host) {
    widget = mxName(host);
    if (widget) break;
    host = host.parentElement;
  }

  const page = currentPage(win);
  const name = widget ?? page ?? el.tagName.toLowerCase();
  const identityPath = [page, widget].filter(Boolean).join(' › ') || name;

  return {
    framework: 'mendix',
    name,
    breadcrumb: buildBreadcrumb(el),
    identityPath,
    tag: el.tagName.toLowerCase(),
    notes: widget ? undefined : 'no mx-name on element',
  };
}
