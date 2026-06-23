import { describe, it, expect, vi } from 'vitest';
import { handleBridgeMessage } from '../../src/bridge/handler';
import type { BridgeRequest } from '../../src/shared/messages';

describe('handleBridgeMessage', () => {
  it('ignores messages that are not devlens inspect requests', () => {
    const post = vi.fn();
    handleBridgeMessage({ source: 'other' } as any, document, {}, post);
    expect(post).not.toHaveBeenCalled();
  });

  it('inspects the element at the given point and posts a result', () => {
    const doc = document.implementation.createHTMLDocument('t');
    doc.body.innerHTML = '<div id="t"></div>';
    const el = doc.getElementById('t')!;
    (doc as any).elementFromPoint = () => el;
    const post = vi.fn();
    const req: BridgeRequest = { source: 'devlens', kind: 'inspect', x: 5, y: 5, reqId: 9 };

    handleBridgeMessage(req, doc, {}, post);

    expect(post).toHaveBeenCalledTimes(1);
    const sent = post.mock.calls[0][0];
    expect(sent.source).toBe('devlens-bridge');
    expect(sent.reqId).toBe(9);
    expect(sent.result.framework).toBe('generic');
  });

  it('reports when there is no element at the point', () => {
    const doc = document.implementation.createHTMLDocument('t');
    (doc as any).elementFromPoint = () => null;
    const post = vi.fn();
    const req: BridgeRequest = { source: 'devlens', kind: 'inspect', x: 0, y: 0, reqId: 1 };

    handleBridgeMessage(req, doc, {}, post);

    expect(post.mock.calls[0][0].result.notes).toBe('No element at point');
  });
});
