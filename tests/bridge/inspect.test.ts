import { describe, it, expect } from 'vitest';
import { inspectElement } from '../../src/bridge/inspect';

function build(html: string): Document {
  const doc = document.implementation.createHTMLDocument('t');
  doc.body.innerHTML = html;
  return doc;
}

describe('inspectElement dispatcher', () => {
  it('routes Angular pages to the Angular adapter', () => {
    const doc = build('<app-root ng-version="17"><app-card id="t"></app-card></app-root>');
    const r = inspectElement(doc.getElementById('t')!, doc, {});
    expect(r.framework).toBe('angular');
  });

  it('routes Mendix pages to the Mendix adapter', () => {
    const doc = build('<div class="mx-name-grid1" id="t"></div>');
    const r = inspectElement(doc.getElementById('t')!, doc, {});
    expect(r.framework).toBe('mendix');
  });

  it('routes unknown pages to the generic adapter', () => {
    const doc = build('<div id="t"></div>');
    const r = inspectElement(doc.getElementById('t')!, doc, {});
    expect(r.framework).toBe('generic');
  });
});
