import { describe, it, expect } from 'vitest';
import { detectFramework } from '../../src/bridge/detect';

function docWith(html: string): Document {
  const doc = document.implementation.createHTMLDocument('t');
  doc.body.innerHTML = html;
  return doc;
}

describe('detectFramework', () => {
  it('detects Mendix via mx-name class', () => {
    expect(detectFramework(docWith('<div class="mx-name-grid1"></div>'), {})).toBe('mendix');
  });

  it('detects Mendix via window.mx', () => {
    expect(detectFramework(docWith('<div></div>'), { mx: {} })).toBe('mendix');
  });

  it('detects Angular via ng-version attribute', () => {
    expect(detectFramework(docWith('<app-root ng-version="17.1.0"></app-root>'), {})).toBe('angular');
  });

  it('detects Angular via window.ng', () => {
    expect(detectFramework(docWith('<div></div>'), { ng: {} })).toBe('angular');
  });

  it('detects React via a fiber key on the #root container', () => {
    const doc = docWith('<div id="root"></div>');
    const root = doc.getElementById('root')! as any;
    root['__reactFiber$abc123'] = { type: 'div' };
    expect(detectFramework(doc, {})).toBe('react');
  });

  it('detects React via the devtools global hook', () => {
    expect(detectFramework(docWith('<div></div>'), { __REACT_DEVTOOLS_GLOBAL_HOOK__: { renderers: new Map([[1, {}]]) } })).toBe('react');
  });

  it('detects Vue via the data-v-app mount marker', () => {
    expect(detectFramework(docWith('<div data-v-app></div>'), {})).toBe('vue');
  });

  it('detects Vue via window.__VUE__', () => {
    expect(detectFramework(docWith('<div></div>'), { __VUE__: {} })).toBe('vue');
  });

  it('detects Blazor via window.Blazor', () => {
    expect(detectFramework(docWith('<div></div>'), { Blazor: {} })).toBe('blazor');
  });

  it('detects Blazor via a component boundary comment', () => {
    const doc = docWith('<div></div>');
    doc.body.appendChild(doc.createComment('Blazor:{"type":"server"}'));
    expect(detectFramework(doc, {})).toBe('blazor');
  });

  it('falls back to generic', () => {
    expect(detectFramework(docWith('<div></div>'), {})).toBe('generic');
  });
});
