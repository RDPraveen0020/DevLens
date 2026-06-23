import type { InspectResult } from '../../shared/types';

// Blazor renders components on the .NET side; component instances/names are NOT
// exposed to JavaScript. The best we can recover from the DOM is the scoped-CSS
// marker (`b-xxxxxxxxxx`) that Blazor adds to elements of a component with scoped
// styles — it identifies the component's style scope, though not its class name.
function blazorScope(el: Element): string | undefined {
  for (const attr of Array.from(el.attributes)) {
    if (/^b-[a-z0-9]{6,}$/i.test(attr.name)) return attr.name;
  }
  return undefined;
}

export function inspectBlazor(el: Element): InspectResult {
  const tag = el.tagName.toLowerCase();
  const id = el.id ? `#${el.id}` : '';

  let scope: string | undefined;
  for (let cur: Element | null = el; cur && !scope; cur = cur.parentElement) {
    scope = blazorScope(cur);
  }

  const name = `${tag}${id}`;
  return {
    framework: 'blazor',
    name,
    breadcrumb: [],
    identityPath: scope ? `${name} [${scope}]` : name,
    tag,
    notes:
      'Blazor — component names are not exposed to the DOM; showing the element' +
      (scope ? ' and its CSS scope' : ''),
  };
}
