import { describe, it, expect } from 'vitest';
import { buildOpenUrl, parseFileRef, resolveOpenUrlFor, resolveApisFor, nearestSelectorInMap } from '../../src/shared/ide';
import { DEFAULT_SETTINGS, InspectResult, Settings } from '../../src/shared/types';

function s(over: Partial<Settings>): Settings {
  return { ...DEFAULT_SETTINGS, ...over };
}

function result(over: Partial<InspectResult>): InspectResult {
  return { framework: 'angular', name: 'x', breadcrumb: [], identityPath: 'x', tag: 'div', ...over };
}

describe('buildOpenUrl', () => {
  it('builds a VS Code URL joining the project root with a relative path', () => {
    const url = buildOpenUrl(s({ ide: 'vscode', projectRoot: '/home/me/proj' }), 'src/app/x.component.ts', 12);
    expect(url).toBe('vscode://file//home/me/proj/src/app/x.component.ts:12:1');
  });

  it('builds a Cursor URL', () => {
    const url = buildOpenUrl(s({ ide: 'cursor', projectRoot: '/p' }), 'a.ts', 3);
    expect(url).toBe('cursor://file//p/a.ts:3');
  });

  it('builds a JetBrains URL', () => {
    const url = buildOpenUrl(s({ ide: 'jetbrains', projectRoot: '/p' }), 'a.ts', 3);
    expect(url).toBe('jetbrains://open?file=/p/a.ts&line=3');
  });

  it('uses a custom template when ide is custom', () => {
    const url = buildOpenUrl(
      s({ ide: 'custom', ideUrlTemplate: 'edit://{path}#{line}', projectRoot: '/p' }),
      'a.ts',
      9,
    );
    expect(url).toBe('edit:///p/a.ts#9');
  });

  it('normalizes Windows backslashes to forward slashes', () => {
    const url = buildOpenUrl(s({ ide: 'vscode', projectRoot: 'C:\\proj' }), 'src\\x.ts', 1);
    expect(url).toBe('vscode://file/C:/proj/src/x.ts:1:1');
  });

  it('uses an absolute file path as-is (ignores project root)', () => {
    const url = buildOpenUrl(s({ ide: 'vscode', projectRoot: '/ignored' }), '/abs/x.ts', 5);
    expect(url).toBe('vscode://file//abs/x.ts:5:1');
  });

  it('defaults line/col to 1 when line is undefined', () => {
    const url = buildOpenUrl(s({ ide: 'vscode', projectRoot: '/p' }), 'a.ts', undefined);
    expect(url).toBe('vscode://file//p/a.ts:1:1');
  });

  it('returns null when a relative path has no project root', () => {
    expect(buildOpenUrl(s({ ide: 'vscode', projectRoot: '' }), 'a.ts', 1)).toBeNull();
  });

  it('returns null when a custom template is empty', () => {
    expect(buildOpenUrl(s({ ide: 'custom', ideUrlTemplate: '', projectRoot: '/p' }), 'a.ts', 1)).toBeNull();
  });
});

describe('parseFileRef', () => {
  it('splits a trailing line number', () => {
    expect(parseFileRef('src/app/x.component.ts:12')).toEqual({ file: 'src/app/x.component.ts', line: 12 });
  });

  it('returns just the file when there is no line', () => {
    expect(parseFileRef('src/app/x.component.ts')).toEqual({ file: 'src/app/x.component.ts' });
  });
});

describe('resolveOpenUrlFor', () => {
  const settings = s({ ide: 'vscode', projectRoot: '/p' });

  it('prefers an exact sourceFile when present', () => {
    const url = resolveOpenUrlFor(settings, result({ sourceFile: 'a.ts', sourceLine: 7 }), null);
    expect(url).toBe('vscode://file//p/a.ts:7:1');
  });

  it('falls back to the selector map when there is no sourceFile', () => {
    const url = resolveOpenUrlFor(settings, result({ selector: 'app-user-card' }), {
      'app-user-card': 'src/app/user-card.component.ts:12',
    });
    expect(url).toBe('vscode://file//p/src/app/user-card.component.ts:12:1');
  });

  it('returns null when neither a sourceFile nor a map entry exists', () => {
    expect(resolveOpenUrlFor(settings, result({ selector: 'app-unknown' }), { 'app-other': 'x.ts:1' })).toBeNull();
    expect(resolveOpenUrlFor(settings, result({ selector: 'app-x' }), null)).toBeNull();
  });

  it('skips third-party selectors and opens the nearest OWN component in the chain', () => {
    // Clicked inside <app-page><mat-card>…</mat-card></app-page>; nearest is mat-card.
    const url = resolveOpenUrlFor(
      settings,
      result({ selector: 'mat-card', breadcrumb: ['app-root', 'app-page', 'mat-card'] }),
      { 'app-root': 'src/app/app.component.ts:1', 'app-page': 'src/app/page.component.ts:8' },
    );
    expect(url).toBe('vscode://file//p/src/app/page.component.ts:8:1');
  });

  it('falls back to app-root when no closer own component exists', () => {
    const url = resolveOpenUrlFor(
      settings,
      result({ selector: 'mat-card', breadcrumb: ['app-root', 'mat-card'] }),
      { 'app-root': 'src/app/app.component.ts:1' },
    );
    expect(url).toBe('vscode://file//p/src/app/app.component.ts:1:1');
  });
});

describe('nearestSelectorInMap', () => {
  const map = { 'app-page': 'x', 'app-root': 'y' };
  it('returns the nearest breadcrumb selector present in the map', () => {
    expect(nearestSelectorInMap(['app-root', 'app-page', 'mat-card'], 'mat-card', map)).toBe('app-page');
  });
  it('falls back to selector when breadcrumb is empty', () => {
    expect(nearestSelectorInMap([], 'app-root', map)).toBe('app-root');
  });
  it('returns null when nothing matches or map is null', () => {
    expect(nearestSelectorInMap(['x-unknown'], 'x-unknown', map)).toBeNull();
    expect(nearestSelectorInMap(['app-page'], 'app-page', null)).toBeNull();
  });
});

describe('resolveApisFor', () => {
  const map = {
    services: { S: [{ method: 'GET', path: 'a' }] },
    components: { 'app-page': ['S'] },
  };
  it('returns the nearest own component’s endpoints', () => {
    const r = {
      framework: 'angular' as const,
      name: 'x',
      breadcrumb: ['app-root', 'app-page', 'mat-card'],
      identityPath: 'x',
      tag: 'div',
      selector: 'mat-card',
    };
    expect(resolveApisFor(r, map)).toEqual([{ service: 'S', method: 'GET', path: 'a' }]);
  });
  it('returns null when no component matches', () => {
    const r = {
      framework: 'angular' as const,
      name: 'x',
      breadcrumb: ['mat-card'],
      identityPath: 'x',
      tag: 'div',
      selector: 'mat-card',
    };
    expect(resolveApisFor(r, map)).toBeNull();
    expect(resolveApisFor(r, null)).toBeNull();
  });
});
