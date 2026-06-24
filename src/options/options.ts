import { loadSettings, saveSettings } from './storage';
import type { Settings } from '../shared/types';

const CHECKBOXES: (keyof Settings)[] = [
  'showName',
  'showIdentityPath',
  'showBreadcrumb',
  // interactive layer
  'pinEnabled',
  'smartMenu',
  'highlightAll',
  'treePanel',
  // smart-menu copy fields
  'copyName',
  'copyIdentityPath',
  'copyComponentSelector',
  'copyDomSelector',
  'copyBreadcrumb',
  'copyAll',
  // test tooling
  'testLocator',
  'testIdAudit',
  'tlPlaywright',
  'tlCypress',
  'tlSelenium',
  'tlTestingLibrary',
  'tlMendix',
];
const SELECTS: (keyof Settings)[] = ['clickAction', 'treeSide', 'seleniumLang'];
const TEXTS: (keyof Settings)[] = ['ownPrefix', 'testIdAttr'];
const NUMBERS: (keyof Settings)[] = ['highlightAllCap'];

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
    el.addEventListener('change', () => {
      let value = el.value;
      if (key === 'testIdAttr') {
        // Keep only characters valid in an attribute name so it can't break the
        // CSS selectors the locator/audit build from it. Fall back to the default.
        value = value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
        if (!value) value = 'data-testid';
        el.value = value;
      }
      void persist(key, value);
    });
  }

  for (const key of NUMBERS) {
    const el = document.getElementById(key) as HTMLInputElement | null;
    if (!el) continue;
    el.value = String(settings[key]);
    el.addEventListener('change', () => {
      const min = el.min ? Number(el.min) : 1;
      const n = Math.max(min, Math.floor(Number(el.value) || min));
      el.value = String(n);
      void persist(key, n);
    });
  }
}

void main();
