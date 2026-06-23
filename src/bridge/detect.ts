import type { Framework } from '../shared/types';

function hasReactKey(el: Element | null | undefined): boolean {
  if (!el) return false;
  return Object.keys(el).some(
    (k) =>
      k.startsWith('__reactFiber$') || k.startsWith('__reactContainer$') || k.startsWith('__reactInternalInstance$'),
  );
}

function isReact(doc: Document, w: any): boolean {
  const hook = w.__REACT_DEVTOOLS_GLOBAL_HOOK__;
  if (hook?.renderers?.size > 0) return true;
  if (doc.querySelector('[data-reactroot]')) return true; // SSR markup
  // Production: React attaches a fiber key to its root container DOM node.
  return hasReactKey(doc.getElementById('root')) || hasReactKey(doc.getElementById('__next')) || hasReactKey(doc.body?.firstElementChild);
}

function isVue(doc: Document, w: any): boolean {
  if (w.__VUE__ || w.Vue) return true; // Vue 3 app/devtools global, or Vue 2 UMD global
  if (doc.querySelector('[data-v-app]')) return true; // Vue 3 mount container
  const root = doc.body?.firstElementChild as any;
  return !!(root && (root.__vue__ || root.__vue_app__ || root.__vueParentComponent));
}

/** True if the document contains a Blazor component boundary comment (<!--Blazor:...-->). */
export function hasBlazorComment(doc: Document): boolean {
  const it = doc.createNodeIterator(doc.documentElement, NodeFilter.SHOW_COMMENT);
  let n: Node | null;
  let count = 0;
  while ((n = it.nextNode()) && count < 300) {
    if ((n.nodeValue ?? '').trimStart().startsWith('Blazor:')) return true;
    count++;
  }
  return false;
}

function isBlazor(doc: Document, w: any): boolean {
  return !!w.Blazor || !!doc.querySelector('script[src*="blazor"]') || hasBlazorComment(doc);
}

export function detectFramework(doc: Document, win: any): Framework {
  const w = win || {};
  if (w.mx || doc.querySelector('.mx-app, [class*="mx-name-"]')) return 'mendix';
  if (w.ng || doc.querySelector('[ng-version]')) return 'angular';
  if (isBlazor(doc, w)) return 'blazor';
  if (isVue(doc, w)) return 'vue';
  if (isReact(doc, w)) return 'react';
  return 'generic';
}
