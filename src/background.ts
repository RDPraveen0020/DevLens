import browser from 'webextension-polyfill';
import type { BgToContent } from './shared/messages';

interface TogglerDeps {
  inject: (tabId: number) => Promise<void>;
  send: (tabId: number, msg: BgToContent) => Promise<void>;
}

export function createToggler(deps: TogglerDeps): (tabId: number) => Promise<void> {
  const active = new Set<number>();
  return async (tabId: number) => {
    if (active.has(tabId)) {
      active.delete(tabId);
      await deps.send(tabId, { type: 'deactivate' });
    } else {
      active.add(tabId);
      await deps.inject(tabId);
      await deps.send(tabId, { type: 'activate' });
    }
  };
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

// Wire up only in a real extension context (guarded so tests can import safely).
if (typeof browser !== 'undefined' && browser.action?.onClicked) {
  const toggle = createToggler({ inject, send });
  browser.action.onClicked.addListener((tab) => {
    if (tab.id != null) void toggle(tab.id);
  });
  browser.commands?.onCommand.addListener(async (command) => {
    if (command !== 'toggle-inspect') return;
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id != null) void toggle(tab.id);
  });
}
