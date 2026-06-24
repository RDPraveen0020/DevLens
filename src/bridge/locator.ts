import { cssPath } from './css-path';
import { mxClassOf } from './frameworks';
import type { LocatorInfo, LocatorStrategy } from '../shared/types';

// Analyzes the element under the cursor and chooses the most stable locator
// strategy for it. Pure DOM reads, so it's unit-testable with jsdom. The
// per-framework formatting lives in shared/test-format.ts.

export const INTERACTIVE_SELECTOR =
  'a[href], button, input:not([type="hidden"]), select, textarea, ' +
  '[role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="tab"], [role="menuitem"], [role="combobox"], [role="switch"]';

export function isInteractive(el: Element): boolean {
  try {
    return el.matches(INTERACTIVE_SELECTOR);
  } catch {
    return false;
  }
}

/** Computed ARIA role (explicit `role`, else the implicit role of the tag). */
export function roleOf(el: Element): string {
  const explicit = el.getAttribute('role');
  if (explicit && explicit.trim()) return explicit.trim();
  const tag = el.tagName.toLowerCase();
  if (tag === 'a') return el.hasAttribute('href') ? 'link' : '';
  if (tag === 'button') return 'button';
  if (tag === 'select') return 'combobox';
  if (tag === 'textarea') return 'textbox';
  if (tag === 'input') {
    const t = (el.getAttribute('type') || 'text').toLowerCase();
    if (t === 'checkbox') return 'checkbox';
    if (t === 'radio') return 'radio';
    if (t === 'button' || t === 'submit' || t === 'reset' || t === 'image') return 'button';
    if (t === 'range') return 'slider';
    if (t === 'hidden') return '';
    return 'textbox';
  }
  return '';
}

function isFormField(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (tag === 'select' || tag === 'textarea') return true;
  if (tag === 'input') {
    const t = (el.getAttribute('type') || 'text').toLowerCase();
    return !['button', 'submit', 'reset', 'image', 'hidden', 'checkbox', 'radio'].includes(t);
  }
  return false;
}

/** A simplified accessible-name computation, good enough for a locator. */
export function accessibleName(el: Element, doc: Document): string {
  const aria = el.getAttribute('aria-label');
  if (aria && aria.trim()) return aria.trim();

  const lb = el.getAttribute('aria-labelledby');
  if (lb) {
    const ref = doc.getElementById(lb.split(/\s+/)[0]);
    const t = ref?.textContent?.trim();
    if (t) return t;
  }

  if (el.id) {
    try {
      const lab = doc.querySelector(`label[for="${el.id.replace(/"/g, '\\"')}"]`);
      const t = lab?.textContent?.trim();
      if (t) return t;
    } catch {
      // invalid id for a selector — ignore
    }
  }

  const wrap = el.closest?.('label');
  if (wrap) {
    const t = wrap.textContent?.replace(/\s+/g, ' ').trim();
    if (t) return t;
  }

  const alt = el.getAttribute('alt');
  if (alt && alt.trim()) return alt.trim();

  const tag = el.tagName.toLowerCase();
  if (tag === 'input') {
    const type = (el.getAttribute('type') || '').toLowerCase();
    const val = (el as HTMLInputElement).value;
    if ((type === 'button' || type === 'submit' || type === 'reset') && val) return String(val).trim();
  }

  const ph = el.getAttribute('placeholder');
  if (ph && ph.trim()) return ph.trim();
  const title = el.getAttribute('title');
  if (title && title.trim()) return title.trim();

  const tc = (el.textContent || '').replace(/\s+/g, ' ').trim();
  if (tc && tc.length <= 60) return tc;
  return '';
}

function kebab(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .split('-')
    .filter(Boolean)
    .slice(0, 4)
    .join('-');
}

function suffixForRole(role: string, tag: string): string {
  const map: Record<string, string> = {
    button: 'button',
    link: 'link',
    textbox: 'input',
    combobox: 'select',
    checkbox: 'checkbox',
    radio: 'radio',
    tab: 'tab',
    menuitem: 'menuitem',
    switch: 'switch',
  };
  return map[role] || tag;
}

export function suggestTestId(el: Element, doc: Document): string {
  const role = roleOf(el);
  const tag = el.tagName.toLowerCase();
  const base = accessibleName(el, doc) || el.getAttribute('placeholder') || role || tag;
  const suffix = suffixForRole(role, tag);
  let slug = kebab(base) || tag;
  if (suffix && !slug.endsWith(suffix)) slug = `${slug}-${suffix}`;
  return slug;
}

export function buildLocator(el: Element, doc: Document, testIdAttr: string): LocatorInfo {
  const tag = el.tagName.toLowerCase();
  const testId = el.getAttribute(testIdAttr) || undefined;
  const mxCls = mxClassOf(el);
  const mxName = mxCls ? mxCls.slice('mx-name-'.length) : undefined;
  const role = roleOf(el) || undefined;
  const name = accessibleName(el, doc) || undefined;
  const id = el.id || undefined;
  const css = cssPath(el);

  let strategy: LocatorStrategy;
  if (testId) strategy = 'testid';
  else if (mxName) strategy = 'mxname';
  else if (isFormField(el) && name) strategy = 'label';
  else if (role && name) strategy = 'role';
  else if (name) strategy = 'text';
  else if (id) strategy = 'id';
  else strategy = 'css';

  return {
    strategy,
    tag,
    testId,
    mxName,
    role,
    name,
    id,
    css,
    hasTestId: !!testId || !!mxName,
    suggestedTestId: suggestTestId(el, doc),
    interactive: isInteractive(el),
  };
}
