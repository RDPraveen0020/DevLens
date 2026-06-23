import browser from 'webextension-polyfill';
import { DEFAULT_SETTINGS, Settings } from '../shared/types';

export async function loadSettings(): Promise<Settings> {
  const defaults = DEFAULT_SETTINGS as unknown as Record<string, unknown>;
  const stored = (await browser.storage.sync.get(defaults)) as Partial<Settings>;
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await browser.storage.sync.set(settings as unknown as Record<string, unknown>);
}
