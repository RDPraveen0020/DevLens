import { describe, it, expect } from 'vitest';
import { inspectReact } from '../../src/bridge/adapters/react';

function build(html: string): Document {
  const doc = document.implementation.createHTMLDocument('t');
  doc.body.innerHTML = html;
  return doc;
}

// Helper: attach a React-like fiber chain to a DOM node.
function attachFiber(el: Element, fiber: any): void {
  (el as any)['__reactFiber$xyz'] = fiber;
}

describe('inspectReact', () => {
  it('reads the nearest component display name and builds a root-first breadcrumb', () => {
    const doc = build('<div id="t"></div>');
    const el = doc.getElementById('t')!;
    function App() {}
    function UserCard() {}
    // fiber for the host div, returning up through UserCard → App
    attachFiber(el, { type: 'div', return: { type: UserCard, return: { type: App, return: null } } });

    const r = inspectReact(el);
    expect(r.framework).toBe('react');
    expect(r.name).toBe('UserCard');
    expect(r.breadcrumb).toEqual(['App', 'UserCard']);
    expect(r.identityPath).toBe('App › UserCard');
    expect(r.notes).toBeUndefined();
  });

  it('honors displayName over function name (e.g. memo/forwardRef wrappers)', () => {
    const doc = build('<span id="t"></span>');
    const el = doc.getElementById('t')!;
    const Memoized = { displayName: 'FancyButton' }; // memo()-style object type
    attachFiber(el, { type: 'span', return: { type: Memoized, return: null } });

    expect(inspectReact(el).name).toBe('FancyButton');
  });

  it('walks up the DOM to find a node that carries a fiber', () => {
    const doc = build('<div id="host"><span id="t"></span></div>');
    function Widget() {}
    attachFiber(doc.getElementById('host')!, { type: Widget, return: null });

    expect(inspectReact(doc.getElementById('t')!).name).toBe('Widget');
  });

  it('falls back to the tag name when no component is found', () => {
    const doc = build('<section id="t"></section>');
    const r = inspectReact(doc.getElementById('t')!);
    expect(r.name).toBe('section');
    expect(r.notes).toContain('React');
  });
});
