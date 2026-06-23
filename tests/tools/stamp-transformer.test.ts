import { describe, it, expect } from 'vitest';
import { transformSource } from '../../tools/dl-stamp-transformer/transformer';

const ROOT = '/proj';

describe('transformSource', () => {
  it('injects data-dl-file with relative path and line for a component', () => {
    const code = [
      `import { Component } from '@angular/core';`,
      `@Component({ selector: 'app-user-card', template: '' })`,
      `export class UserCardComponent {}`,
    ].join('\n');
    const out = transformSource(code, '/proj/src/app/user-card.component.ts', ROOT);
    expect(out).toContain(`host: { 'data-dl-file': 'src/app/user-card.component.ts:2' }`);
  });

  it('merges into an existing host object', () => {
    const code = [
      `import { Component } from '@angular/core';`,
      `@Component({ selector: 'app-x', host: { 'class': 'y' } })`,
      `export class XComponent {}`,
    ].join('\n');
    const out = transformSource(code, '/proj/x.component.ts', ROOT);
    expect(out).toContain(`'data-dl-file': 'x.component.ts:2'`);
    expect(out).toContain(`'class': 'y'`);
  });

  it('leaves non-component classes untouched', () => {
    const code = `export class Foo {}`;
    expect(transformSource(code, '/proj/foo.ts', ROOT)).toBe(code);
  });

  it('does not double-stamp a component that already has data-dl-file', () => {
    const code = `import { Component } from '@angular/core';
@Component({ selector: 'app-x', host: { 'data-dl-file': 'old:1' } })
export class XComponent {}`;
    expect(transformSource(code, '/proj/x.ts', ROOT)).toBe(code);
  });

  it('skips files outside the root', () => {
    const code = `import { Component } from '@angular/core';
@Component({ selector: 'app-x' })
export class XComponent {}`;
    expect(transformSource(code, '/other/x.ts', ROOT)).toBe(code);
  });
});
