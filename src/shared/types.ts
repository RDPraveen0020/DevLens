export type Framework = 'angular' | 'mendix' | 'react' | 'vue' | 'blazor' | 'generic';

export type ClickAction = 'copy' | 'open' | 'none';
export type IdePreset = 'vscode' | 'cursor' | 'jetbrains' | 'custom';

export interface InspectResult {
  framework: Framework;
  name: string; // primary display name
  breadcrumb: string[]; // ancestor component chain, root-first
  identityPath: string; // e.g. "app-user-card › UserCardComponent"
  tag: string; // DOM tag name (lowercase)
  notes?: string; // e.g. "minified", "No Angular/Mendix detected"
  selector?: string; // component element selector, e.g. "app-user-card"
  sourceFile?: string; // from data-dl-file (project-relative or absolute)
  sourceLine?: number; // 1-based line, if present
}

export interface ApiEndpoint {
  service: string;
  method: string;
  path: string;
}

export interface ServiceEndpoint {
  method: string;
  path: string;
}

/** Normalized: each service's endpoints stored once; components reference services by name. */
export interface ApiMap {
  services: Record<string, ServiceEndpoint[]>;
  components: Record<string, string[]>;
}

export interface Settings {
  showName: boolean;
  showBreadcrumb: boolean;
  showIdentityPath: boolean;
  clickAction: ClickAction;
  ide: IdePreset;
  ideUrlTemplate: string; // used when ide === 'custom'
  projectRoot: string; // prepended to relative data-dl-file paths
  ownPrefix: string; // project selector prefix (e.g. "app"); used to skip library components
  showApis: boolean;
  apiLimit: number;
  tooltipPosition: 'cursor' | 'top-left';
}

export const DEFAULT_SETTINGS: Settings = {
  showName: true,
  showBreadcrumb: true,
  showIdentityPath: true,
  clickAction: 'copy',
  ide: 'vscode',
  ideUrlTemplate: 'vscode://file/{path}:{line}:{col}',
  projectRoot: '',
  ownPrefix: 'app',
  showApis: false,
  apiLimit: 10,
  tooltipPosition: 'cursor',
};
