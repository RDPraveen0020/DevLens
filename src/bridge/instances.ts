import { detectFramework } from './detect';
import {
  angularHost,
  blazorScopeOf,
  mxClassOf,
  reactNearestName,
  vueNearestName,
} from './frameworks';

// Highlight-all-instances: given the element under the cursor, find every other
// element on the page that belongs to the same component. Matching strategy is
// per-framework; results are capped so huge pages stay responsive.

const SCAN_CAP = 4000; // max DOM nodes scanned for the React/Vue name match

function cap<T>(arr: T[], n: number): T[] {
  return arr.length > n ? arr.slice(0, n) : arr;
}

/** Same-component matches for React/Vue: instance-root host elements. */
function findByNearestName(
  doc: Document,
  key: string,
  nameAt: (el: Element) => string | undefined,
  limit: number,
): Element[] {
  const out: Element[] = [];
  const all = doc.querySelectorAll('*');
  const upTo = Math.min(all.length, SCAN_CAP);
  for (let i = 0; i < upTo && out.length < limit; i++) {
    const e = all[i];
    if (nameAt(e) !== key) continue;
    const p = e.parentElement;
    if (p && nameAt(p) === key) continue; // inside an already-matched instance
    out.push(e);
  }
  return out;
}

export function findInstances(
  el: Element,
  doc: Document,
  win: any,
  ownPrefix?: string,
  limit = 200,
): Element[] {
  const fw = detectFramework(doc, win);

  if (fw === 'angular') {
    const host = angularHost(el, ownPrefix);
    if (!host) return [];
    const tag = host.tagName.toLowerCase();
    if (!tag.includes('-')) return [host]; // not a custom element — don't match all divs
    return cap(Array.from(doc.querySelectorAll(tag)), limit);
  }

  if (fw === 'mendix') {
    const cls = mxClassOf(el);
    if (!cls) return [];
    return cap(Array.from(doc.querySelectorAll(`.${cls}`)), limit);
  }

  if (fw === 'blazor') {
    const scope = blazorScopeOf(el);
    if (!scope) return [el];
    return cap(Array.from(doc.querySelectorAll(`[${scope}]`)), limit);
  }

  if (fw === 'react' || fw === 'vue') {
    const nameAt = fw === 'react' ? reactNearestName : vueNearestName;
    const key = nameAt(el);
    if (!key) return [el];
    return findByNearestName(doc, key, nameAt, limit);
  }

  // Plain HTML: same tag, plus the first class if present.
  const tag = el.tagName.toLowerCase();
  const first = el.classList[0];
  if (first) {
    try {
      const matches = Array.from(doc.querySelectorAll(`${tag}.${CSS.escape(first)}`));
      if (matches.length) return cap(matches, limit);
    } catch {
      // invalid selector — fall through to tag-only
    }
  }
  return cap(Array.from(doc.getElementsByTagName(tag)), limit);
}
