import { describe, it, expect } from 'vitest';
import { extractComponents, buildMap } from '../../tools/dl-selector-map/scan.mjs';

const ROOT = '/proj';

describe('extractComponents', () => {
  it('extracts an element selector with its relative path and line', () => {
    const code = [
      `import { Component } from '@angular/core';`,
      `@Component({ selector: 'app-user-card', template: '' })`,
      `export class UserCardComponent {}`,
    ].join('\n');
    const out = extractComponents(code, '/proj/src/app/user-card.component.ts', ROOT);
    expect(out).toEqual([{ selector: 'app-user-card', ref: 'src/app/user-card.component.ts:2' }]);
  });

  it('skips attribute/class selectors', () => {
    const code = `import { Component } from '@angular/core';
@Component({ selector: '[appHighlight]' })
export class HighlightComponent {}`;
    expect(extractComponents(code, '/proj/x.component.ts', ROOT)).toEqual([]);
  });

  it('indexes each element selector in a comma list', () => {
    const code = `import { Component } from '@angular/core';
@Component({ selector: 'app-a, app-b' })
export class AbComponent {}`;
    const out = extractComponents(code, '/proj/ab.component.ts', ROOT);
    expect(out.map((c) => c.selector)).toEqual(['app-a', 'app-b']);
  });

  it('skips files outside the root', () => {
    const code = `import { Component } from '@angular/core';
@Component({ selector: 'app-x' })
export class XComponent {}`;
    expect(extractComponents(code, '/other/x.component.ts', ROOT)).toEqual([]);
  });
});

describe('buildMap', () => {
  it('merges entries from many files into a selector → ref map', () => {
    const files = [
      {
        fileName: '/proj/a.component.ts',
        code: `import { Component } from '@angular/core';\n@Component({ selector: 'app-a' })\nexport class A {}`,
      },
      {
        fileName: '/proj/b.component.ts',
        code: `import { Component } from '@angular/core';\n@Component({ selector: 'app-b' })\nexport class B {}`,
      },
    ];
    expect(buildMap(files, ROOT)).toEqual({
      'app-a': 'a.component.ts:2',
      'app-b': 'b.component.ts:2',
    });
  });
});
