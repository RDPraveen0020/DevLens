import { INTERACTIVE_SELECTOR } from './locator';
import { mxClassOf } from './frameworks';

// data-testid auditor: find interactive elements that lack the configured
// test-id attribute. On Mendix, elements covered by an mx-name widget count as
// already addressable, so they're skipped.
export function findMissingTestIds(doc: Document, testIdAttr: string, cap = 200): Element[] {
  const all = doc.querySelectorAll(INTERACTIVE_SELECTOR);
  const out: Element[] = [];
  for (let i = 0; i < all.length && out.length < cap; i++) {
    const el = all[i];
    if (el.hasAttribute(testIdAttr)) continue;
    if (mxClassOf(el)) continue; // covered by a Mendix widget id
    out.push(el);
  }
  return out;
}
