import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Overlay } from '../../src/content/overlay';
import { InspectController } from '../../src/content/controller';
import { handleBridgeMessage } from '../../src/bridge/handler';
import { DEFAULT_SETTINGS } from '../../src/shared/types';
import type { BridgeRequest } from '../../src/shared/messages';

/**
 * Deterministic end-to-end coverage of the inspect loop without a real browser:
 * controller → (postToBridge) → bridge handler → (response) → controller → overlay DOM.
 */
describe('inspect loop integration (bridge ↔ controller ↔ overlay)', () => {
  beforeEach(() => {
    document.documentElement.innerHTML = '<head></head><body></body>';
    document.getElementById('devlens-overlay')?.remove();
  });

  function wire(win: any) {
    const overlay = new Overlay();
    const controller = new InspectController({
      settings: DEFAULT_SETTINGS,
      overlay,
      copy: vi.fn(async () => {}),
      resolveOpenUrl: () => null,
      openUrl: vi.fn(),
      resolveApis: () => null,
      postToBridge: (req: BridgeRequest) =>
        handleBridgeMessage(req, document, win, (res) =>
          controller.onBridgeMessage({ data: res } as MessageEvent),
        ),
    });
    return controller;
  }

  function shadow(): ShadowRoot {
    return (document.getElementById('devlens-overlay') as HTMLElement).shadowRoot!;
  }

  it('shows the Angular component identity in the overlay tooltip', () => {
    document.body.innerHTML =
      '<app-root ng-version="17.0.0"><app-user-card><button id="t">Save</button></app-user-card></app-root>';
    const target = document.getElementById('t')!;
    (document as any).elementFromPoint = () => target;

    const controller = wire(window);
    controller.activate();
    controller.onPointerMove({ clientX: 5, clientY: 5 } as any);

    expect(shadow().querySelector('.dl-name')?.textContent).toBe('app-user-card');
    expect(shadow().querySelector('.dl-path')?.textContent).toContain('app-user-card');
  });

  it('shows the Mendix widget identity in the overlay tooltip', () => {
    document.body.innerHTML =
      '<div class="mx-name-dataView1"><button id="t" class="mx-name-saveButton">Save</button></div>';
    const target = document.getElementById('t')!;
    (document as any).elementFromPoint = () => target;

    const controller = wire({ mx: {} });
    controller.activate();
    controller.onPointerMove({ clientX: 5, clientY: 5 } as any);

    expect(shadow().querySelector('.dl-name')?.textContent).toBe('saveButton');
    expect(shadow().querySelector('.dl-crumb')?.textContent).toContain('dataView1');
  });
});
