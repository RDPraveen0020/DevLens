import browser from 'webextension-polyfill';
import type { BgToContent } from './shared/messages';

interface TogglerDeps {
  inject: (tabId: number) => Promise<void>;
  send: (tabId: number, msg: BgToContent) => Promise<void>;
  // Optional persistence so the active-tab set survives MV3 service-worker
  // restarts (the SW is terminated after ~30s idle and its memory is lost).
  loadActive?: () => Promise<number[]>;
  saveActive?: (ids: number[]) => Promise<void>;
}

export interface Toggler {
  toggle: (tabId: number) => Promise<void>;
  forget: (tabId: number) => void;
}

export function createToggler(deps: TogglerDeps): Toggler {
  const active = new Set<number>();
  // Per-tab promise chain: serializes toggles so a fast double-click can't
  // interleave (read state, act) and desync the activate/deactivate direction.
  const inflight = new Map<number, Promise<void>>();
  let loaded = !deps.loadActive;

  const ensureLoaded = async (): Promise<void> => {
    if (loaded) return;
    loaded = true;
    try {
      for (const id of await deps.loadActive!()) active.add(id);
    } catch {
      // storage unavailable — fall back to in-memory tracking
    }
  };

  const persist = async (): Promise<void> => {
    if (!deps.saveActive) return;
    try {
      await deps.saveActive([...active]);
    } catch {
      // ignore persistence failures
    }
  };

  const toggle = (tabId: number): Promise<void> => {
    const prev = inflight.get(tabId) ?? Promise.resolve();
    const next = prev
      .catch(() => {})
      .then(async () => {
        await ensureLoaded();
        if (active.has(tabId)) {
          active.delete(tabId);
          await persist();
          await deps.send(tabId, { type: 'deactivate' });
        } else {
          active.add(tabId);
          await persist();
          await deps.inject(tabId);
          await deps.send(tabId, { type: 'activate' });
        }
      });
    inflight.set(
      tabId,
      next.finally(() => {
        if (inflight.get(tabId) === next) inflight.delete(tabId);
      }),
    );
    return next;
  };

  const forget = (tabId: number): void => {
    if (active.delete(tabId)) void persist();
  };

  return { toggle, forget };
}

async function inject(tabId: number): Promise<void> {
  await browser.scripting.executeScript({
    target: { tabId },
    files: ['bridge.js'],
    world: 'MAIN',
  } as any);
  await browser.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
}

async function send(tabId: number, msg: BgToContent): Promise<void> {
  try {
    await browser.tabs.sendMessage(tabId, msg);
  } catch {
    // content script may not be present on restricted pages; ignore.
  }
}

const SESSION_KEY = 'devlensActiveTabs';

// Wire up only in a real extension context (guarded so tests can import safely).
if (typeof browser !== 'undefined' && browser.action?.onClicked) {
  const session = (browser.storage as any)?.session;
  const toggler = createToggler({
    inject,
    send,
    loadActive: async () => {
      try {
        const r = await session?.get(SESSION_KEY);
        const ids = r?.[SESSION_KEY];
        return Array.isArray(ids) ? ids : [];
      } catch {
        return [];
      }
    },
    saveActive: async (ids) => {
      try {
        await session?.set({ [SESSION_KEY]: ids });
      } catch {
        // session storage unavailable
      }
    },
  });

  browser.action.onClicked.addListener((tab) => {
    if (tab.id != null) void toggler.toggle(tab.id);
  });
  browser.commands?.onCommand.addListener(async (command) => {
    if (command !== 'toggle-inspect') return;
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id != null) void toggler.toggle(tab.id);
  });
  browser.tabs?.onRemoved.addListener((tabId) => toggler.forget(tabId));
}
