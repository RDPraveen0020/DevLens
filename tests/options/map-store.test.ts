import { describe, it, expect, vi, beforeEach } from 'vitest';

const local: Record<string, unknown> = {};
vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      local: {
        get: vi.fn(async (key: string) => (key in local ? { [key]: local[key] } : {})),
        set: vi.fn(async (items: Record<string, unknown>) => {
          Object.assign(local, items);
        }),
        remove: vi.fn(async (key: string) => {
          delete local[key];
        }),
      },
    },
  },
}));

import {
  loadMapFromStorage,
  saveMapToStorage,
  clearMapFromStorage,
  loadApiMapFromStorage,
  saveApiMapToStorage,
  clearApiMapFromStorage,
} from '../../src/options/map-store';

beforeEach(() => {
  for (const k of Object.keys(local)) delete local[k];
});

describe('selector map storage', () => {
  it('returns null when nothing is stored', async () => {
    expect(await loadMapFromStorage()).toBeNull();
  });

  it('round-trips a saved map', async () => {
    await saveMapToStorage({ 'app-x': 'src/x.component.ts:3' });
    expect(await loadMapFromStorage()).toEqual({ 'app-x': 'src/x.component.ts:3' });
  });

  it('clears the stored map', async () => {
    await saveMapToStorage({ 'app-x': 'src/x.component.ts:3' });
    await clearMapFromStorage();
    expect(await loadMapFromStorage()).toBeNull();
  });

  it('ignores a non-object stored value', async () => {
    await saveMapToStorage(['not', 'an', 'object'] as unknown as Record<string, string>);
    expect(await loadMapFromStorage()).toBeNull();
  });
});

describe('api map storage', () => {
  it('round-trips and clears an api map', async () => {
    const apiMap = { services: { S: [{ method: 'GET', path: 'a' }] }, components: { 'app-x': ['S'] } };
    expect(await loadApiMapFromStorage()).toBeNull();
    await saveApiMapToStorage(apiMap);
    expect(await loadApiMapFromStorage()).toEqual(apiMap);
    await clearApiMapFromStorage();
    expect(await loadApiMapFromStorage()).toBeNull();
  });
});
