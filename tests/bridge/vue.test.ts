import { describe, it, expect } from 'vitest';
import { inspectVue } from '../../src/bridge/adapters/vue';

function build(html: string): Document {
  const doc = document.implementation.createHTMLDocument('t');
  doc.body.innerHTML = html;
  return doc;
}

describe('inspectVue', () => {
  it('reads a Vue 3 component chain via __vueParentComponent / instance.parent', () => {
    const doc = build('<div id="t"></div>');
    const el = doc.getElementById('t')! as any;
    const app = { type: { name: 'App' }, parent: null };
    el.__vueParentComponent = { type: { name: 'UserCard' }, parent: app };

    const r = inspectVue(doc.getElementById('t')!);
    expect(r.framework).toBe('vue');
    expect(r.name).toBe('UserCard');
    expect(r.breadcrumb).toEqual(['App', 'UserCard']);
    expect(r.identityPath).toBe('App › UserCard');
  });

  it('derives a Vue 3 name from __name or __file when name is absent', () => {
    const doc = build('<div id="t"></div>');
    (doc.getElementById('t') as any).__vueParentComponent = {
      type: { __file: 'src/components/ProfileCard.vue' },
      parent: null,
    };
    expect(inspectVue(doc.getElementById('t')!).name).toBe('ProfileCard');
  });

  it('reads a Vue 2 component via __vue__ / $options / $parent', () => {
    const doc = build('<div id="t"></div>');
    const parent = { $options: { name: 'Layout' }, $parent: null };
    (doc.getElementById('t') as any).__vue__ = { $options: { name: 'TodoItem' }, $parent: parent };

    const r = inspectVue(doc.getElementById('t')!);
    expect(r.name).toBe('TodoItem');
    expect(r.breadcrumb).toEqual(['Layout', 'TodoItem']);
  });

  it('falls back to the tag name for an anonymous component', () => {
    const doc = build('<button id="t"></button>');
    (doc.getElementById('t') as any).__vue__ = { $options: {}, $parent: null };
    const r = inspectVue(doc.getElementById('t')!);
    expect(r.name).toBe('button');
    expect(r.notes).toContain('Vue');
  });
});
