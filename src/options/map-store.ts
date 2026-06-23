import browser from 'webextension-polyfill';
import type { ApiMap } from '../shared/types';

/** Selector map is stored in storage.local (it can be ~200KB; sync caps at 8KB/item). */
export const MAP_KEY = 'devlensSelectorMap';
export const API_MAP_KEY = 'devlensApiMap';

export async function loadMapFromStorage(): Promise<Record<string, string> | null> {
  const stored = await browser.storage.local.get(MAP_KEY);
  const map = stored[MAP_KEY];
  return map && typeof map === 'object' && !Array.isArray(map) ? (map as Record<string, string>) : null;
}

export async function saveMapToStorage(map: Record<string, string>): Promise<void> {
  await browser.storage.local.set({ [MAP_KEY]: map });
}

export async function clearMapFromStorage(): Promise<void> {
  await browser.storage.local.remove(MAP_KEY);
}

export async function loadApiMapFromStorage(): Promise<ApiMap | null> {
  const stored = await browser.storage.local.get(API_MAP_KEY);
  const map = stored[API_MAP_KEY];
  return map && typeof map === 'object' && !Array.isArray(map) ? (map as ApiMap) : null;
}

export async function saveApiMapToStorage(map: ApiMap): Promise<void> {
  await browser.storage.local.set({ [API_MAP_KEY]: map });
}

export async function clearApiMapFromStorage(): Promise<void> {
  await browser.storage.local.remove(API_MAP_KEY);
}
