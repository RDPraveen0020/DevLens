import { handleBridgeMessage } from './handler';
import type { BridgeRequest } from '../shared/messages';

declare global {
  interface Window {
    __devlensBridgeReady?: boolean;
  }
}

if (!window.__devlensBridgeReady) {
  window.__devlensBridgeReady = true;
  window.addEventListener('message', (event: MessageEvent) => {
    handleBridgeMessage(event.data as BridgeRequest, document, window, (response) =>
      window.postMessage(response, '*'),
    );
  });
}
