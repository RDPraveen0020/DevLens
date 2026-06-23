import { describe, it, expect, vi, beforeEach } from 'vitest';

const store: Record<string, unknown> = {};
vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      sync: {
        get: vi.fn(async (defaults: Record<string, unknown>) => ({ ...defaults, ...store })),
        set: vi.fn(async (items: Record<string, unknown>) => {
          Object.assign(store, items);
        }),
      },
    },
  },
}));

import { loadSettings, saveSettings } from '../../src/options/storage';
import { DEFAULT_SETTINGS } from '../../src/shared/types';

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
});

describe('settings storage', () => {
  it('returns defaults when nothing is stored', async () => {
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips saved settings merged over defaults', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, showBreadcrumb: false });
    const loaded = await loadSettings();
    expect(loaded.showBreadcrumb).toBe(false);
    expect(loaded.showName).toBe(true);
  });
});
