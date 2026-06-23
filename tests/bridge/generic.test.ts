import { describe, it, expect } from 'vitest';
import { inspectGeneric } from '../../src/bridge/adapters/generic';

describe('inspectGeneric', () => {
  it('describes a plain element by tag/id/class', () => {
    const doc = document.implementation.createHTMLDocument('t');
    doc.body.innerHTML = '<button id="save" class="btn primary"></button>';
    const el = doc.getElementById('save')!;
    const r = inspectGeneric(el);
    expect(r.framework).toBe('generic');
    expect(r.name).toBe('button#save');
    expect(r.identityPath).toBe('button#save.btn.primary');
    expect(r.notes).toBe('Plain HTML — no framework detected');
  });
});
