// Low-level, framework-specific DOM/instance walkers shared by the inspect,
// instances (highlight-all) and tree (ancestor panel) features. Kept dependency-
// free and pure so each can be unit-tested with jsdom.

export interface CompNode {
  name: string;
  host: Element; // a DOM element to highlight for this component
}

export function isCustomTag(el: Element): boolean {
  return el.tagName.includes('-');
}

/* ------------------------------ React ------------------------------ */

function reactFiberOf(el: any): any {
  const k = Object.keys(el).find(
    (k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'),
  );
  return k ? el[k] : undefined;
}

/** Display name of a fiber's component, or undefined for host nodes (div, span…). */
function fiberCompName(fiber: any): string | undefined {
  const t = fiber?.type;
  if (!t) return undefined;
  if (typeof t === 'string') return undefined; // host component
  if (typeof t === 'function') return t.displayName || t.name || undefined;
  if (typeof t === 'object') {
    const inner = t.type ?? t.render; // memo()/forwardRef() wrappers
    return (
      t.displayName ||
      (typeof inner === 'function' ? inner.displayName || inner.name : undefined) ||
      undefined
    );
  }
  return undefined;
}

/** First host (DOM element) descendant of a fiber, for a rect to highlight. */
function fiberHostElement(fiber: any): Element | null {
  const stack: any[] = [fiber?.child];
  let guard = 0;
  while (stack.length && guard++ < 10000) {
    const n = stack.pop();
    if (!n) continue;
    if (n.stateNode && n.stateNode.nodeType === 1) return n.stateNode as Element;
    if (n.sibling) stack.push(n.sibling);
    if (n.child) stack.push(n.child);
  }
  return null;
}

function reactFiberAtOrAbove(el: Element): { fiber: any; host: Element } | undefined {
  let node: Element | null = el;
  let fiber: any;
  while (node && !(fiber = reactFiberOf(node))) node = node.parentElement;
  return fiber ? { fiber, host: node! } : undefined;
}

const MAX_WALK = 1000; // cap chain walks so a cyclic pointer can't lock the page

export function reactNearestName(el: Element): string | undefined {
  const found = reactFiberAtOrAbove(el);
  if (!found) return undefined;
  for (let f = found.fiber, n = 0; f && n < MAX_WALK; f = f.return, n++) {
    const nm = fiberCompName(f);
    if (nm) return nm;
  }
  return undefined;
}

export function reactComponentChain(el: Element): CompNode[] {
  const found = reactFiberAtOrAbove(el);
  if (!found) return [];
  const chain: CompNode[] = [];
  let lastName: string | undefined;
  for (let f = found.fiber, n = 0; f && n < MAX_WALK; f = f.return, n++) {
    const nm = fiberCompName(f);
    if (!nm || nm === lastName) continue;
    lastName = nm;
    chain.unshift({ name: nm, host: fiberHostElement(f) ?? found.host });
  }
  return chain;
}

/* ------------------------------ Vue ------------------------------ */

function baseName(file?: string): string | undefined {
  if (!file || typeof file !== 'string') return undefined;
  const last = file.split(/[\\/]/).pop();
  return last ? last.replace(/\.\w+$/, '') : undefined;
}

function vue3Name(inst: any): string | undefined {
  const t = inst?.type;
  if (!t) return undefined;
  return t.name || t.__name || baseName(t.__file) || undefined;
}

function vue2Name(vm: any): string | undefined {
  const o = vm?.$options;
  if (!o) return undefined;
  return o.name || o._componentTag || baseName(o.__file) || undefined;
}

function vueInstAtOrAbove(el: Element): { inst: any; v3: boolean } | undefined {
  for (let node: Element | null = el; node; node = node.parentElement) {
    const e = node as any;
    if (e.__vueParentComponent) return { inst: e.__vueParentComponent, v3: true };
    if (e.__vue__) return { inst: e.__vue__, v3: false };
  }
  return undefined;
}

export function vueNearestName(el: Element): string | undefined {
  const found = vueInstAtOrAbove(el);
  if (!found) return undefined;
  for (let cur = found.inst, n = 0; cur && n < MAX_WALK; cur = found.v3 ? cur.parent : cur.$parent, n++) {
    const nm = found.v3 ? vue3Name(cur) : vue2Name(cur);
    if (nm) return nm;
  }
  return undefined;
}

export function vueComponentChain(el: Element): CompNode[] {
  const found = vueInstAtOrAbove(el);
  if (!found) return [];
  const fallback = el;
  const chain: CompNode[] = [];
  let lastName: string | undefined;
  for (let cur = found.inst, n = 0; cur && n < MAX_WALK; cur = found.v3 ? cur.parent : cur.$parent, n++) {
    const nm = found.v3 ? vue3Name(cur) : vue2Name(cur);
    if (!nm || nm === lastName) continue;
    lastName = nm;
    const raw = found.v3 ? cur.vnode?.el : cur.$el;
    const host: Element = raw && raw.nodeType === 1 ? raw : fallback;
    chain.unshift({ name: nm, host });
  }
  return chain;
}

/* --------------------- Angular / Mendix / Blazor --------------------- */

/** Nearest own-prefix custom element, else nearest custom element, else null. */
export function angularHost(el: Element, ownPrefix?: string): Element | null {
  if (ownPrefix) {
    const prefix = `${ownPrefix.toLowerCase()}-`;
    for (let c: Element | null = el; c; c = c.parentElement) {
      if (isCustomTag(c) && c.tagName.toLowerCase().startsWith(prefix)) return c;
    }
  }
  for (let c: Element | null = el; c; c = c.parentElement) {
    if (isCustomTag(c)) return c;
  }
  return null;
}

export function mxClassOf(el: Element): string | undefined {
  for (let c: Element | null = el; c; c = c.parentElement) {
    const cls = Array.from(c.classList).find((x) => x.startsWith('mx-name-'));
    if (cls) return cls;
  }
  return undefined;
}

export function blazorScopeOf(el: Element): string | undefined {
  for (let c: Element | null = el; c; c = c.parentElement) {
    for (const attr of Array.from(c.attributes)) {
      if (/^b-[a-z0-9]{6,}$/i.test(attr.name)) return attr.name;
    }
  }
  return undefined;
}
