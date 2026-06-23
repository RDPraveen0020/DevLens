import { loadSettings, saveSettings } from './storage';
import type { Settings } from '../shared/types';

const CHECKBOXES: (keyof Settings)[] = ['showName', 'showIdentityPath', 'showBreadcrumb'];
const SELECTS: (keyof Settings)[] = ['clickAction'];
const TEXTS: (keyof Settings)[] = ['ownPrefix'];

function note(): void {
  const status = document.getElementById('status');
  if (status) status.textContent = 'Saved.';
}

async function persist(key: keyof Settings, value: unknown): Promise<void> {
  const next = { ...(await loadSettings()), [key]: value } as Settings;
  await saveSettings(next);
  note();
}

async function main(): Promise<void> {
  const settings = await loadSettings();

  for (const key of CHECKBOXES) {
    const el = document.getElementById(key) as HTMLInputElement | null;
    if (!el) continue;
    el.checked = settings[key] as boolean;
    el.addEventListener('change', () => persist(key, el.checked));
  }

  for (const key of SELECTS) {
    const el = document.getElementById(key) as HTMLSelectElement | null;
    if (!el) continue;
    el.value = settings[key] as string;
    el.addEventListener('change', () => persist(key, el.value));
  }

  for (const key of TEXTS) {
    const el = document.getElementById(key) as HTMLInputElement | null;
    if (!el) continue;
    el.value = settings[key] as string;
    el.addEventListener('change', () => persist(key, el.value));
  }
}

void main();
