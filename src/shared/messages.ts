import type { InspectResult } from './types';

// content (isolated world) → bridge (main world)
export interface BridgeRequest {
  source: 'devlens';
  kind: 'inspect';
  x: number;
  y: number;
  reqId: number;
  ownPrefix?: string;
}

// bridge (main world) → content (isolated world)
export interface BridgeResponse {
  source: 'devlens-bridge';
  kind: 'result';
  reqId: number;
  result: InspectResult;
}

// background → content
export type BgToContent = { type: 'activate' } | { type: 'deactivate' };
