import type { Box, InspectResult, LocatorInfo, TreeNode } from './types';

// content (isolated world) → bridge (main world). All requests are keyed by a
// viewport point because DOM nodes can't cross the postMessage boundary.
interface PointRequest {
  source: 'devlens';
  x: number;
  y: number;
  reqId: number;
  ownPrefix?: string;
}

export interface InspectRequest extends PointRequest {
  kind: 'inspect';
}
export interface HighlightAllRequest extends PointRequest {
  kind: 'highlightAll';
  cap?: number;
}
export interface AncestorsRequest extends PointRequest {
  kind: 'ancestors';
}
export interface TestLocatorRequest extends PointRequest {
  kind: 'testlocator';
  testIdAttr: string;
}
export interface AuditTestIdsRequest extends PointRequest {
  kind: 'auditTestIds';
  testIdAttr: string;
  cap?: number;
}

export type BridgeRequest =
  | InspectRequest
  | HighlightAllRequest
  | AncestorsRequest
  | TestLocatorRequest
  | AuditTestIdsRequest;

// bridge (main world) → content (isolated world)
export interface ResultResponse {
  source: 'devlens-bridge';
  kind: 'result';
  reqId: number;
  result: InspectResult;
}
export interface InstancesResponse {
  source: 'devlens-bridge';
  kind: 'instances';
  reqId: number;
  rects: Box[];
  count: number;
  capped: boolean;
}
export interface TreeResponse {
  source: 'devlens-bridge';
  kind: 'tree';
  reqId: number;
  nodes: TreeNode[];
}
export interface LocatorResponse {
  source: 'devlens-bridge';
  kind: 'locator';
  reqId: number;
  info: LocatorInfo;
}
export interface AuditResponse {
  source: 'devlens-bridge';
  kind: 'audit';
  reqId: number;
  rects: Box[];
  count: number;
  capped: boolean;
}

export type BridgeResponse =
  | ResultResponse
  | InstancesResponse
  | TreeResponse
  | LocatorResponse
  | AuditResponse;

// background → content
export type BgToContent = { type: 'activate' } | { type: 'deactivate' };
