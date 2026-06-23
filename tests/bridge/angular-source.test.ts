import { describe, it, expect } from 'vitest';
import { inspectAngular } from '../../src/bridge/adapters/angular';

function build(html: string): Document {
  const doc = document.implementation.createHTMLDocument('t');
  doc.body.innerHTML = html;
  return doc;
}

describe('inspectAngular source metadata', () => {
  it('reads data-dl-file from the nearest ancestor', () => {
    const doc = build(
      '<app-user-card data-dl-file="src/app/user-card.component.ts:12"><span id="t">x</span></app-user-card>',
    );
    const r = inspectAngular(doc.getElementById('t')!, {});
    expect(r.sourceFile).toBe('src/app/user-card.component.ts');
    expect(r.sourceLine).toBe(12);
  });

  it('parses a path with no line number', () => {
    const doc = build('<app-x data-dl-file="src/app/x.component.ts" id="t"></app-x>');
    const r = inspectAngular(doc.getElementById('t')!, {});
    expect(r.sourceFile).toBe('src/app/x.component.ts');
    expect(r.sourceLine).toBeUndefined();
  });

  it('leaves source fields undefined when no attribute is present', () => {
    const doc = build('<app-x id="t"></app-x>');
    const r = inspectAngular(doc.getElementById('t')!, {});
    expect(r.sourceFile).toBeUndefined();
    expect(r.sourceLine).toBeUndefined();
  });

  it('surfaces the nearest element selector for selector-map lookup', () => {
    const doc = build('<app-user-card><span id="t">x</span></app-user-card>');
    const r = inspectAngular(doc.getElementById('t')!, {});
    expect(r.selector).toBe('app-user-card');
  });
});
