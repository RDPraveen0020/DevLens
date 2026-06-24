import { detectFramework } from './detect';
import { isCustomTag, reactComponentChain, vueComponentChain, type CompNode } from './frameworks';
import type { Box, Framework, TreeNode } from '../shared/types';

// Builds the ancestor tree for the panel: the chain from the root down to the
// selected element. Component frameworks (React/Vue) use their instance chain;
// Angular/Mendix use their DOM markers; everything else falls back to a plain
// DOM-structure tree. Rects are viewport coords so the panel can highlight rows.

const MAX_NODES = 25;

function rectOf(el: Element): Box {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

function markSelected(nodes: TreeNode[]): TreeNode[] {
  if (nodes.length) nodes[nodes.length - 1].selected = true;
  return nodes.slice(-MAX_NODES);
}

function fromCompNodes(chain: CompNode[], fw: Framework): TreeNode[] {
  return markSelected(
    chain.map((n) => ({ name: n.name, framework: fw, rect: rectOf(n.host), selected: false })),
  );
}

function domAncestors(el: Element): Element[] {
  const list: Element[] = [];
  for (let c: Element | null = el; c; c = c.parentElement) list.unshift(c);
  return list;
}

function domLabel(el: Element): string {
  return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}`;
}

export function collectComponentTree(el: Element, doc: Document, win: any, _ownPrefix?: string): TreeNode[] {
  const fw = detectFramework(doc, win);

  if (fw === 'react') {
    const chain = reactComponentChain(el);
    if (chain.length) return fromCompNodes(chain, 'react');
  }

  if (fw === 'vue') {
    const chain = vueComponentChain(el);
    if (chain.length) return fromCompNodes(chain, 'vue');
  }

  if (fw === 'angular') {
    const nodes = domAncestors(el)
      .filter(isCustomTag)
      .map((e) => ({ name: e.tagName.toLowerCase(), framework: 'angular' as Framework, rect: rectOf(e), selected: false }));
    if (nodes.length) return markSelected(nodes);
  }

  if (fw === 'mendix') {
    const seen = new Set<string>();
    const nodes: TreeNode[] = [];
    for (const e of domAncestors(el)) {
      const cls = Array.from(e.classList).find((c) => c.startsWith('mx-name-'));
      if (!cls || seen.has(cls)) continue;
      seen.add(cls);
      nodes.push({ name: cls.slice('mx-name-'.length), framework: 'mendix', rect: rectOf(e), selected: false });
    }
    if (nodes.length) return markSelected(nodes);
  }

  // Plain HTML / Blazor / empty component chain: a DOM-structure tree.
  return markSelected(
    domAncestors(el).map((e) => ({ name: domLabel(e), framework: fw, rect: rectOf(e), selected: false })),
  );
}
