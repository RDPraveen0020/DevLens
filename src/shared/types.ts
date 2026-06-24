export type Framework = 'angular' | 'mendix' | 'react' | 'vue' | 'blazor' | 'generic';

export type ClickAction = 'copy' | 'open' | 'none';
export type IdePreset = 'vscode' | 'cursor' | 'jetbrains' | 'custom';

/** A viewport-relative rectangle (from getBoundingClientRect). */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface InspectResult {
  framework: Framework;
  name: string; // primary display name
  breadcrumb: string[]; // ancestor component chain, root-first
  identityPath: string; // e.g. "app-user-card › UserCardComponent"
  tag: string; // DOM tag name (lowercase)
  notes?: string; // e.g. "minified", "No Angular/Mendix detected"
  selector?: string; // component element selector, e.g. "app-user-card"
  domSelector?: string; // a uniquely-targeting CSS selector for the element
  sourceFile?: string; // from data-dl-file (project-relative or absolute)
  sourceLine?: number; // 1-based line, if present
}

/** One row of the ancestor tree panel; rect is in viewport coords. */
export interface TreeNode {
  name: string;
  framework: Framework;
  rect: Box;
  selected: boolean; // the selected element's own component
}

export type TestFramework = 'playwright' | 'cypress' | 'selenium' | 'testingLibrary' | 'mendix';
export type SeleniumLang = 'csharp' | 'python' | 'java';
export type LocatorStrategy = 'testid' | 'mxname' | 'role' | 'label' | 'text' | 'id' | 'css';

/** Everything the per-framework formatter needs to emit a test locator. */
export interface LocatorInfo {
  strategy: LocatorStrategy;
  tag: string;
  testId?: string; // value of the configured test-id attribute, if present
  mxName?: string; // mx-name suffix (Mendix widget id)
  role?: string; // computed ARIA role
  name?: string; // accessible name (for role/label/text strategies)
  id?: string; // element id
  css: string; // unique CSS path (always present, the ultimate fallback)
  hasTestId: boolean; // already covered (test-id present, or mx-name on Mendix)
  suggestedTestId: string; // kebab-case suggestion for the auditor
  interactive: boolean;
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

  // Interactive layer (pin panel, smart copy menu, highlight-all, tree)
  pinEnabled: boolean; // press F to pin and open the interactive panel
  smartMenu: boolean; // show the copy buttons in the pinned panel
  highlightAll: boolean; // enable highlight-all-instances (H / panel button)
  treePanel: boolean; // show the ancestor tree in the pinned panel
  treeSide: 'left' | 'right'; // which edge the panel docks to
  highlightAllCap: number; // max instances to highlight at once
  copyName: boolean; // smart-menu: copy component/page name
  copyIdentityPath: boolean; // smart-menu: copy identity path
  copyComponentSelector: boolean; // smart-menu: copy the component selector
  copyDomSelector: boolean; // smart-menu: copy a CSS selector for the element
  copyBreadcrumb: boolean; // smart-menu: copy the ancestor breadcrumb
  copyAll: boolean; // smart-menu: a "Copy all" button (every field, labelled)

  // Test tooling (selector generator + data-testid auditor)
  testLocator: boolean; // show the test-locator buttons in the panel
  testIdAudit: boolean; // show the test-id status + page audit
  testIdAttr: string; // attribute the generator/auditor key off (e.g. data-testid)
  seleniumLang: SeleniumLang; // Selenium snippet language flavor
  tlPlaywright: boolean;
  tlCypress: boolean;
  tlSelenium: boolean;
  tlTestingLibrary: boolean;
  tlMendix: boolean;
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
  pinEnabled: true,
  smartMenu: true,
  highlightAll: true,
  treePanel: true,
  treeSide: 'right',
  highlightAllCap: 200,
  copyName: true,
  copyIdentityPath: true,
  copyComponentSelector: true,
  copyDomSelector: true,
  copyBreadcrumb: false,
  copyAll: true,
  testLocator: true,
  testIdAudit: true,
  testIdAttr: 'data-testid',
  seleniumLang: 'csharp',
  tlPlaywright: true,
  tlCypress: true,
  tlSelenium: true,
  tlTestingLibrary: true,
  tlMendix: true,
};
