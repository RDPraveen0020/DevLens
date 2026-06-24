import browser from 'webextension-polyfill';
import { Overlay } from './overlay';
import { Panel } from './panel';
import { InspectController } from './controller';
import { createActivationGate } from './activation';
import { loadSettings } from '../options/storage';
import { loadMapFromStorage, loadApiMapFromStorage, MAP_KEY, API_MAP_KEY } from '../options/map-store';
import { resolveOpenUrlFor, resolveApisFor } from '../shared/ide';
import type { BgToContent } from '../shared/messages';
import type { ApiMap, InspectResult } from '../shared/types';

declare global {
  interface Window {
    __devlensContentReady?: boolean;
  }
}

/**
 * Copy text to the clipboard, falling back to execCommand when the async
 * Clipboard API is unavailable or rejects (e.g. document not focused). Without
 * the fallback a failed write is silent, which can look like "nothing copied".
 */
async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    // fall through to the legacy path
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;';
    document.documentElement.appendChild(ta);
    ta.focus();
    ta.select();
    document.execCommand('copy');
    ta.remove();
  } catch {
    // give up silently
  }
}

async function init(): Promise<void> {
  if (window.__devlensContentReady) return;
  window.__devlensContentReady = true;

  // Register the background-message listener SYNCHRONOUSLY, before the first
  // `await` below. The background injects this script and then immediately sends
  // `activate`; if the listener were registered only after `await loadSettings()`,
  // that first message would arrive with no receiver and be dropped — which is why
  // the toolbar button used to need 2-3 clicks. The gate remembers the requested
  // state and applies it the moment init finishes.
  const gate = createActivationGate();
  browser.runtime.onMessage.addListener((msg: unknown) => {
    const m = msg as BgToContent;
    if (m.type === 'activate') gate.request(true);
    else if (m.type === 'deactivate') gate.request(false);
  });

  const overlay = new Overlay();
  const panel = new Panel();
  let settings = await loadSettings();

  // Selector → "relpath:line" map. Prefer a map imported into the extension
  // (works on ANY origin, including deployed apps); fall back to fetching it from
  // the app origin (localhost dev convenience).
  // Selector → "relpath:line" map for the (currently hidden) Open-in-IDE feature.
  // Only the extension-storage source is read. The previous fallback fetched
  // `${origin}/assets/devlens-map.json` and warned on every deployed app where it
  // doesn't exist — noise, especially now that the map import UI is hidden.
  let componentMap: Record<string, string> | null = null;
  const loadMap = async (): Promise<void> => {
    try {
      componentMap = (await loadMapFromStorage()) ?? null;
    } catch {
      componentMap = null;
    }
  };
  void loadMap();

  // selector → [{service, method, path}] map for the API-call display.
  let apiMap: ApiMap | null = null;
  const loadApiMap = async (): Promise<void> => {
    try {
      const m = await loadApiMapFromStorage();
      if (m) {
        apiMap = m;
        console.info('[DevLens] API map loaded:', Object.keys(m).length, 'components');
      }
    } catch {
      // none imported — APIs section simply won't show
    }
  };
  void loadApiMap();

  const controller = new InspectController({
    settings,
    postToBridge: (req) => window.postMessage(req, '*'),
    overlay,
    panel,
    copy: (text) => copyText(text),
    resolveOpenUrl: (result: InspectResult) => {
      const url = resolveOpenUrlFor(settings, result, componentMap);
      if (!url) {
        console.warn('[DevLens] open failed —', {
          selector: result.selector,
          sourceFile: result.sourceFile,
          projectRoot: settings.projectRoot,
          ide: settings.ide,
          mapLoaded: componentMap !== null,
          mapEntries: componentMap ? Object.keys(componentMap).length : 0,
          selectorInMap:
            !!result.selector && !!componentMap && Object.prototype.hasOwnProperty.call(componentMap, result.selector),
          mapValue: result.selector && componentMap ? componentMap[result.selector] : undefined,
        });
      } else {
        console.info('[DevLens] opening', url);
      }
      return url;
    },
    openUrl: (url: string) => {
      const a = document.createElement('a');
      a.href = url;
      a.style.display = 'none';
      document.documentElement.appendChild(a);
      a.click();
      a.remove();
    },
    resolveApis: (result: InspectResult) => resolveApisFor(result, apiMap),
  });

  // Keep settings live so changing click-action / IDE applies without re-activating.
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes[MAP_KEY] || changes[API_MAP_KEY])) {
      if (changes[MAP_KEY]) void loadMap();
      if (changes[API_MAP_KEY]) void loadApiMap();
      return;
    }
    if (area !== 'sync') return;
    const next = { ...settings } as Record<string, unknown>;
    for (const [key, change] of Object.entries(changes)) {
      next[key] = change.newValue;
    }
    settings = next as unknown as typeof settings;
    controller.setSettings(settings);
  });

  const onMove = (e: MouseEvent) => {
    // capture the real element rect so the highlight box matches the element,
    // then request inspection for the same point.
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (el) {
      const r = el.getBoundingClientRect();
      controller.setHighlightRect({ left: r.left, top: r.top, width: r.width, height: r.height });
    }
    controller.onPointerMove(e);
  };

  // Clicks on DevLens' own UI (the pinned panel, the overlay) must not trigger
  // the page-level copy action or be swallowed.
  const onOwnUi = (e: Event): boolean => {
    const path = (e.composedPath?.() ?? []) as EventTarget[];
    return path.some(
      (n) => n instanceof HTMLElement && (n.id === 'devlens-panel' || n.id === 'devlens-overlay'),
    );
  };

  const onClick = (e: MouseEvent) => {
    if (onOwnUi(e)) return;
    void controller.onClick(e);
  };

  const isTyping = (): boolean => {
    const a = document.activeElement as HTMLElement | null;
    if (!a) return false;
    return a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable;
  };

  const onKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (controller.isPinned()) controller.togglePin();
      else deactivate();
      return;
    }
    if (isTyping() || e.altKey || e.ctrlKey || e.metaKey) return;
    const k = e.key.toLowerCase();
    if (k === 'f' && settings.pinEnabled) {
      e.preventDefault();
      controller.togglePin();
    } else if (k === 'h' && settings.highlightAll) {
      e.preventDefault();
      controller.toggleHighlight();
    } else if (k === 'a' && settings.testIdAudit) {
      e.preventDefault();
      controller.toggleAudit();
    }
  };

  // Idempotent so repeated activate/deactivate (e.g. re-injection, buffered state)
  // never doubles up listeners.
  let active = false;
  function activate(): void {
    if (active) return;
    active = true;
    void loadMap();
    void loadApiMap();
    controller.activate();
    panel.mount();
    window.addEventListener('mousemove', onMove, true);
    window.addEventListener('click', onClick, true);
    window.addEventListener('keydown', onKeydown, true);
  }

  function deactivate(): void {
    if (!active) return;
    active = false;
    controller.deactivate();
    window.removeEventListener('mousemove', onMove, true);
    window.removeEventListener('click', onClick, true);
    window.removeEventListener('keydown', onKeydown, true);
  }

  window.addEventListener('message', (e) => controller.onBridgeMessage(e));

  // Init finished: apply whatever the background requested while we were loading.
  gate.ready((on) => (on ? activate() : deactivate()));
}

void init();
