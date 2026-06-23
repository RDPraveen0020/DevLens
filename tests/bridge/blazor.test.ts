import { describe, it, expect } from 'vitest';
import { inspectBlazor } from '../../src/bridge/adapters/blazor';

function build(html: string): Document {
  const doc = document.implementation.createHTMLDocument('t');
  doc.body.innerHTML = html;
  return doc;
}

describe('inspectBlazor', () => {
  it('describes the element and notes that component names are not exposed', () => {
    const doc = build('<button id="save"></button>');
    const r = inspectBlazor(doc.getElementById('save')!);
    expect(r.framework).toBe('blazor');
    expect(r.name).toBe('button#save');
    expect(r.notes).toContain('not exposed');
  });

  it('surfaces the nearest scoped-CSS marker (b-xxxxxx) as a hint', () => {
    const doc = build('<div b-abc1234567><span id="t"></span></div>');
    const r = inspectBlazor(doc.getElementById('t')!);
    expect(r.identityPath).toBe('span#t [b-abc1234567]');
    expect(r.notes).toContain('CSS scope');
  });
});
