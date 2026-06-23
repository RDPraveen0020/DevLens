export interface Endpoint {
  method: string;
  path: string;
}
export interface ApiEndpoint {
  service: string;
  method: string;
  path: string;
}
export function extractEndpoints(
  code: string,
  fileName: string,
): { className: string; endpoints: Endpoint[] }[];
export function extractInjections(
  code: string,
  fileName: string,
): { selector: string; serviceTypes: string[] }[];
export interface ServiceEndpoint {
  method: string;
  path: string;
}
export interface ApiMap {
  services: Record<string, ServiceEndpoint[]>;
  components: Record<string, string[]>;
}
export function buildApiMap(files: { fileName: string; code: string }[]): ApiMap;

