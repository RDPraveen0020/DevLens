import type { InspectResult } from '../../shared/types';

/** Get the React fiber attached to a DOM node, across React 16/17/18 key names. */
function fiberFromNode(el: any): any {
  const key = Object.keys(el).find(
    (k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'),
  );
  return key ? el[key] : undefined;
}

/** Display name of a fiber's component, or undefined for host nodes (div, span, …). */
function fiberName(fiber: any): string | undefined {
  const t = fiber?.type;
  if (!t) return undefined;
  if (typeof t === 'string') return undefined; // host component
  if (typeof t === 'function') return t.displayName || t.name || undefined;
  if (typeof t === 'object') {
    // memo() / forwardRef() / context providers wrap the real type
    const inner = t.type ?? t.render;
    return (
      t.displayName ||
      (typeof inner === 'function' ? inner.displayName || inner.name : undefined) ||
      undefined
    );
  }
  return undefined;
}

export function inspectReact(el: Element): InspectResult {
  // Walk up the DOM until we find a node carrying a fiber.
  let node: Element | null = el;
  let fiber: any;
  while (node && !(fiber = fiberFromNode(node))) node = node.parentElement;

  // Walk the fiber's parent chain, collecting named component fibers (root-first).
  const chain: string[] = [];
  let nearest: string | undefined;
  for (let f = fiber; f; f = f.return) {
    const name = fiberName(f);
    if (!name) continue;
    if (!nearest) nearest = name;
    if (chain[0] !== name) chain.unshift(name);
  }

  const tag = el.tagName.toLowerCase();
  const name = nearest ?? tag;
  return {
    framework: 'react',
    name,
    breadcrumb: chain,
    identityPath: chain.join(' › ') || name,
    tag,
    notes: nearest ? undefined : 'React (no component above this node)',
    selector: nearest,
  };
}
