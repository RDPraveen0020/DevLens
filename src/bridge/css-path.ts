// Builds a uniquely-targeting CSS selector for an element (the "Copy DOM
// selector" smart-menu action). Anchors on the nearest id and uses
// :nth-of-type for same-tag siblings. Class names are intentionally omitted —
// modern apps hash them, making class-based selectors brittle for automation.

function idSelector(id: string): string {
  return /^[A-Za-z_-][\w-]*$/.test(id) ? `#${id}` : `[id="${id.replace(/"/g, '\\"')}"]`;
}

function part(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const parent = el.parentElement;
  if (!parent) return tag;
  const sameTag = Array.from(parent.children).filter((c) => c.tagName === el.tagName);
  if (sameTag.length <= 1) return tag;
  return `${tag}:nth-of-type(${sameTag.indexOf(el) + 1})`;
}

export function cssPath(el: Element): string {
  if (!el || el.nodeType !== 1) return '';
  if (el.id) return idSelector(el.id);

  const parts: string[] = [];
  let cur: Element | null = el;
  while (cur && cur.nodeType === 1 && cur.tagName.toLowerCase() !== 'html') {
    if (cur.id) {
      parts.unshift(idSelector(cur.id));
      break;
    }
    parts.unshift(part(cur));
    cur = cur.parentElement;
  }
  return parts.join(' > ');
}
