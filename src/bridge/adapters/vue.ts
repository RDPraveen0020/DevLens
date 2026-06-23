import type { InspectResult } from '../../shared/types';

function baseName(file?: string): string | undefined {
  if (!file || typeof file !== 'string') return undefined;
  const last = file.split(/[\\/]/).pop();
  return last ? last.replace(/\.\w+$/, '') : undefined;
}

/** Vue 3 component instance → name (SFC name, compiler __name, or file). */
function vue3Name(inst: any): string | undefined {
  const t = inst?.type;
  if (!t) return undefined;
  return t.name || t.__name || baseName(t.__file) || undefined;
}

/** Vue 2 component vm → name ($options.name, registered tag, or file). */
function vue2Name(vm: any): string | undefined {
  const o = vm?.$options;
  if (!o) return undefined;
  return o.name || o._componentTag || baseName(o.__file) || undefined;
}

/** Find the nearest Vue instance on the element or an ancestor. */
function vueFromNode(el: any): { inst: any; v3: boolean } | undefined {
  if (el.__vueParentComponent) return { inst: el.__vueParentComponent, v3: true };
  if (el.__vue__) return { inst: el.__vue__, v3: false };
  return undefined;
}

export function inspectVue(el: Element): InspectResult {
  let node: Element | null = el;
  let found: { inst: any; v3: boolean } | undefined;
  while (node && !(found = vueFromNode(node))) node = node.parentElement;

  const chain: string[] = [];
  let nearest: string | undefined;
  if (found) {
    const { v3 } = found;
    for (let cur = found.inst; cur; cur = v3 ? cur.parent : cur.$parent) {
      const name = v3 ? vue3Name(cur) : vue2Name(cur);
      if (!name) continue;
      if (!nearest) nearest = name;
      if (chain[0] !== name) chain.unshift(name);
    }
  }

  const tag = el.tagName.toLowerCase();
  const name = nearest ?? tag;
  return {
    framework: 'vue',
    name,
    breadcrumb: chain,
    identityPath: chain.join(' › ') || name,
    tag,
    notes: nearest ? undefined : 'Vue (anonymous component)',
    selector: nearest,
  };
}
