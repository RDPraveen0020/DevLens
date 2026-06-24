import { inspectElement } from './inspect';
import { findInstances } from './instances';
import { collectComponentTree } from './tree';
import { cssPath } from './css-path';
import { buildLocator } from './locator';
import { findMissingTestIds } from './audit';
import type { BridgeRequest, BridgeResponse } from '../shared/messages';
import type { Box, InspectResult } from '../shared/types';

function rectOf(el: Element): Box {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

export function handleBridgeMessage(
  data: BridgeRequest,
  doc: Document,
  win: any,
  post: (response: BridgeResponse) => void,
): void {
  if (!data || data.source !== 'devlens') return;

  const el = doc.elementFromPoint(data.x, data.y);

  if (data.kind === 'inspect') {
    const result: InspectResult = el
      ? { ...inspectElement(el, doc, win, data.ownPrefix), domSelector: cssPath(el) }
      : { framework: 'generic', name: '', breadcrumb: [], identityPath: '', tag: '', notes: 'No element at point' };
    post({ source: 'devlens-bridge', kind: 'result', reqId: data.reqId, result });
    return;
  }

  if (data.kind === 'highlightAll') {
    const limit = data.cap ?? 200;
    const matches = el ? findInstances(el, doc, win, data.ownPrefix, limit) : [];
    post({
      source: 'devlens-bridge',
      kind: 'instances',
      reqId: data.reqId,
      rects: matches.map(rectOf),
      count: matches.length,
      capped: matches.length >= limit,
    });
    return;
  }

  if (data.kind === 'ancestors') {
    const nodes = el ? collectComponentTree(el, doc, win, data.ownPrefix) : [];
    post({ source: 'devlens-bridge', kind: 'tree', reqId: data.reqId, nodes });
    return;
  }

  if (data.kind === 'testlocator') {
    const info = el
      ? buildLocator(el, doc, data.testIdAttr)
      : {
          strategy: 'css' as const,
          tag: '',
          css: '',
          hasTestId: false,
          suggestedTestId: '',
          interactive: false,
        };
    post({ source: 'devlens-bridge', kind: 'locator', reqId: data.reqId, info });
    return;
  }

  if (data.kind === 'auditTestIds') {
    const limit = data.cap ?? 200;
    const matches = findMissingTestIds(doc, data.testIdAttr, limit);
    post({
      source: 'devlens-bridge',
      kind: 'audit',
      reqId: data.reqId,
      rects: matches.map(rectOf),
      count: matches.length,
      capped: matches.length >= limit,
    });
    return;
  }
}
