import { describe, it, expect, vi } from 'vitest';
import { InspectController } from '../../src/content/controller';
import { DEFAULT_SETTINGS, Settings } from '../../src/shared/types';
import type { BridgeResponse } from '../../src/shared/messages';

function makeController(over: Partial<Settings> = {}) {
  const posted: any[] = [];
  const openUrl = vi.fn();
  const resolveOpenUrl = vi.fn(() => null as string | null);
  const copy = vi.fn(async () => {});
  const overlay = { mount: vi.fn(), show: vi.fn(), hide: vi.fn(), destroy: vi.fn() } as any;
  const controller = new InspectController({
    settings: { ...DEFAULT_SETTINGS, ...over },
    postToBridge: (req) => posted.push(req),
    overlay,
    copy,
    resolveOpenUrl,
    openUrl,
    resolveApis: vi.fn(() => null),
  });
  return { controller, posted, openUrl, resolveOpenUrl, copy, overlay };
}

const RESULT = {
  framework: 'angular' as const,
  name: 'CardComponent',
  breadcrumb: [],
  identityPath: 'app-card › CardComponent',
  tag: 'div',
};

describe('InspectController', () => {
  it('posts an inspect request with cursor coordinates on pointer move', () => {
    const { controller, posted } = makeController();
    controller.activate();
    controller.onPointerMove({ clientX: 30, clientY: 40 } as any);
    expect(posted[0]).toMatchObject({ source: 'devlens', kind: 'inspect', x: 30, y: 40 });
  });

  it('renders the overlay when a matching bridge response arrives', () => {
    const { controller, posted, overlay } = makeController();
    controller.activate();
    controller.onPointerMove({ clientX: 1, clientY: 1 } as any);
    const reqId = posted[0].reqId;
    const response: BridgeResponse = {
      source: 'devlens-bridge',
      kind: 'result',
      reqId,
      result: { framework: 'angular', name: 'X', breadcrumb: [], identityPath: 'x', tag: 'div' },
    };
    controller.onBridgeMessage({ data: response } as MessageEvent);
    expect(overlay.show).toHaveBeenCalled();
  });
});

describe('InspectController click actions', () => {
  it('copies the identity path when clickAction is copy', async () => {
    const { controller, copy, openUrl } = makeController({ clickAction: 'copy' });
    controller.activate();
    (controller as any).lastResult = RESULT;
    await controller.onClick({ preventDefault: vi.fn(), stopPropagation: vi.fn() } as any);
    expect(copy).toHaveBeenCalledWith('app-card › CardComponent');
    expect(openUrl).not.toHaveBeenCalled();
  });

  it('falls back to the name when there is no identity path', async () => {
    const { controller, copy } = makeController({ clickAction: 'copy' });
    controller.activate();
    (controller as any).lastResult = {
      framework: 'generic',
      name: 'button#save',
      breadcrumb: [],
      identityPath: '',
      tag: 'button',
    };
    await controller.onClick({ preventDefault: vi.fn(), stopPropagation: vi.fn() } as any);
    expect(copy).toHaveBeenCalledWith('button#save');
  });

  it('opens the IDE URL when clickAction is open and a url resolves', async () => {
    const { controller, openUrl, resolveOpenUrl, copy } = makeController({ clickAction: 'open' });
    resolveOpenUrl.mockReturnValue('vscode://file//p/x.ts:1:1');
    controller.activate();
    (controller as any).lastResult = RESULT;
    await controller.onClick({ preventDefault: vi.fn(), stopPropagation: vi.fn() } as any);
    expect(openUrl).toHaveBeenCalledWith('vscode://file//p/x.ts:1:1');
    expect(copy).not.toHaveBeenCalled();
  });

  it('falls back to copy + hint when open resolves no url', async () => {
    const { controller, openUrl, copy, overlay } = makeController({ clickAction: 'open' });
    controller.activate();
    (controller as any).lastResult = RESULT;
    await controller.onClick({ preventDefault: vi.fn(), stopPropagation: vi.fn() } as any);
    expect(openUrl).not.toHaveBeenCalled();
    expect(copy).toHaveBeenCalledWith('app-card › CardComponent');
    expect(overlay.show).toHaveBeenCalled();
  });

  it('does nothing (no preventDefault) when clickAction is none', async () => {
    const { controller, copy, openUrl } = makeController({ clickAction: 'none' });
    controller.activate();
    (controller as any).lastResult = RESULT;
    const evt = { preventDefault: vi.fn(), stopPropagation: vi.fn() } as any;
    await controller.onClick(evt);
    expect(copy).not.toHaveBeenCalled();
    expect(openUrl).not.toHaveBeenCalled();
    expect(evt.preventDefault).not.toHaveBeenCalled();
  });
});
