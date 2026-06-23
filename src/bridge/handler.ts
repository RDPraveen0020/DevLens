import { inspectElement } from './inspect';
import type { BridgeRequest, BridgeResponse } from '../shared/messages';
import type { InspectResult } from '../shared/types';

export function handleBridgeMessage(
  data: BridgeRequest,
  doc: Document,
  win: any,
  post: (response: BridgeResponse) => void,
): void {
  if (!data || data.source !== 'devlens' || data.kind !== 'inspect') return;

  const el = doc.elementFromPoint(data.x, data.y);
  const result: InspectResult = el
    ? inspectElement(el, doc, win, data.ownPrefix)
    : {
        framework: 'generic',
        name: '',
        breadcrumb: [],
        identityPath: '',
        tag: '',
        notes: 'No element at point',
      };

  post({ source: 'devlens-bridge', kind: 'result', reqId: data.reqId, result });
}
