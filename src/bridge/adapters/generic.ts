import type { InspectResult } from '../../shared/types';

export function inspectGeneric(el: Element): InspectResult {
  const tag = el.tagName.toLowerCase();
  const id = el.id ? `#${el.id}` : '';
  const cls = el.classList.length ? '.' + Array.from(el.classList).join('.') : '';
  return {
    framework: 'generic',
    name: `${tag}${id}`,
    breadcrumb: [],
    identityPath: `${tag}${id}${cls}`,
    tag,
    notes: 'Plain HTML — no framework detected',
  };
}
