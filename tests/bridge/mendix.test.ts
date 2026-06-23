import { describe, it, expect } from 'vitest';
import { inspectMendix } from '../../src/bridge/adapters/mendix';

function build(html: string): Document {
  const doc = document.implementation.createHTMLDocument('t');
  doc.body.innerHTML = html;
  return doc;
}

describe('inspectMendix', () => {
  it('reads the nearest mx-name widget and builds a breadcrumb', () => {
    const doc = build(
      '<div class="mx-name-dataView1"><div class="mx-name-grid1"><span id="t">x</span></div></div>'
    );
    const el = doc.getElementById('t')!;
    const r = inspectMendix(el, {});
    expect(r.framework).toBe('mendix');
    expect(r.name).toBe('grid1');
    expect(r.breadcrumb).toEqual(['dataView1', 'grid1']);
  });

  it('includes the current page in the identity path when the runtime exposes it', () => {
    const doc = build('<div class="mx-name-grid1" id="h"></div>');
    const el = doc.getElementById('h')!;
    const win = { mx: { ui: { getContentForm: () => ({ path: 'MyModule.UserOverview' }) } } };
    const r = inspectMendix(el, win);
    expect(r.identityPath).toBe('MyModule.UserOverview › grid1');
  });

  it('notes when no mx-name is found on the element chain', () => {
    const doc = build('<div id="h"></div>');
    const el = doc.getElementById('h')!;
    const r = inspectMendix(el, {});
    expect(r.notes).toBe('no mx-name on element');
  });
});
