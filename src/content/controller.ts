import { renderTooltipHTML } from './tooltip';
import { formatLocator } from '../shared/test-format';
import type { Overlay } from './overlay';
import type { Panel, CopyField } from './panel';
import type { Settings, InspectResult, ApiEndpoint, TreeNode, LocatorInfo, TestFramework } from '../shared/types';
import type { BridgeRequest, BridgeResponse } from '../shared/messages';

interface ControllerDeps {
  settings: Settings;
  postToBridge: (req: BridgeRequest) => void;
  overlay: Pick<Overlay, 'mount' | 'show' | 'hide' | 'destroy' | 'showBoxes' | 'clearBoxes'>;
  panel: Pick<
    Panel,
    'mount' | 'open' | 'setTree' | 'setHighlightActive' | 'setLocator' | 'setAuditActive' | 'isOpen' | 'close'
  >;
  copy: (text: string) => Promise<void>;
  resolveOpenUrl: (result: InspectResult) => string | null;
  openUrl: (url: string) => void;
  resolveApis: (result: InspectResult) => ApiEndpoint[] | null;
}

function escapeHtml(s: string): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return s.replace(/[&<>"']/g, (c) => map[c]);
}

export class InspectController {
  private active = false;
  private reqCounter = 0;
  private pendingReqId = -1;
  private pendingTreeReqId = -1;
  private pendingInstancesReqId = -1;
  private lastResult: InspectResult | null = null;
  private lastPoint = { x: 0, y: 0 };
  private lastRect = { left: 0, top: 0, width: 0, height: 0 };

  // pin / interactive panel state
  private pinned = false;
  private treeNodes: TreeNode[] = [];
  private highlightActive = false;
  private auditActive = false;
  private lastLocator: LocatorInfo | null = null;
  private pendingLocatorReqId = -1;
  private pendingAuditReqId = -1;

  constructor(private deps: ControllerDeps) {}

  setHighlightRect(rect: { left: number; top: number; width: number; height: number }): void {
    this.lastRect = rect;
  }

  setSettings(settings: Settings): void {
    this.deps.settings = settings;
  }

  isPinned(): boolean {
    return this.pinned;
  }

  activate(): void {
    if (this.active) return;
    this.active = true;
    this.deps.overlay.mount();
  }

  deactivate(): void {
    this.unpin();
    this.active = false;
    this.lastResult = null;
    this.deps.overlay.hide();
  }

  onPointerMove(e: { clientX: number; clientY: number }): void {
    if (!this.active || this.pinned) return; // frozen while pinned
    this.lastPoint = { x: e.clientX, y: e.clientY };
    const req: BridgeRequest = {
      source: 'devlens',
      kind: 'inspect',
      x: e.clientX,
      y: e.clientY,
      reqId: ++this.reqCounter,
      ownPrefix: this.deps.settings.ownPrefix,
    };
    this.pendingReqId = req.reqId;
    this.deps.postToBridge(req);
  }

  onBridgeMessage(e: MessageEvent): void {
    if (!this.active) return;
    const data = e.data as BridgeResponse;
    if (!data || data.source !== 'devlens-bridge') return;

    if (data.kind === 'result') {
      if (data.reqId !== this.pendingReqId) return; // stale
      this.lastResult = data.result;
      const apis = this.deps.settings.showApis ? this.deps.resolveApis(data.result) : null;
      const html = renderTooltipHTML(data.result, this.deps.settings, apis ?? undefined);
      this.deps.overlay.show(this.lastRect, html, this.lastPoint.x, this.lastPoint.y);
      return;
    }

    if (data.kind === 'tree') {
      if (data.reqId !== this.pendingTreeReqId) return;
      this.treeNodes = data.nodes;
      this.deps.panel.setTree(data.nodes);
      return;
    }

    if (data.kind === 'instances') {
      if (data.reqId !== this.pendingInstancesReqId) return;
      this.deps.overlay.showBoxes(data.rects);
      return;
    }

    if (data.kind === 'locator') {
      if (data.reqId !== this.pendingLocatorReqId) return;
      this.lastLocator = data.info;
      this.deps.panel.setLocator(data.info, this.deps.settings);
      return;
    }

    if (data.kind === 'audit') {
      if (data.reqId !== this.pendingAuditReqId) return;
      this.deps.overlay.showBoxes(data.rects, 'missing');
      this.deps.panel.setAuditActive(true, data.count);
      return;
    }
  }

  async onClick(e: { preventDefault: () => void; stopPropagation: () => void }): Promise<void> {
    if (!this.active || !this.lastResult) return;
    const action = this.deps.settings.clickAction;
    if (action === 'none') return;

    e.preventDefault();
    e.stopPropagation();

    if (action === 'open') {
      const url = this.deps.resolveOpenUrl(this.lastResult);
      if (url) {
        this.deps.openUrl(url);
        return;
      }
      this.deps.overlay.show(
        this.lastRect,
        '<div class="dl-note">Can\'t open: import the selector map in DevLens Options &amp; set Project root</div>',
        this.lastPoint.x,
        this.lastPoint.y,
      );
    }

    await this.deps.copy(this.lastResult.identityPath || this.lastResult.name);
  }

  /* ------------------------- pin / interactive panel ------------------------- */

  togglePin(): void {
    if (this.pinned) this.unpin();
    else this.pin();
  }

  private pin(): void {
    if (!this.active || !this.deps.settings.pinEnabled || !this.lastResult) return;
    this.pinned = true;
    this.highlightActive = false;
    this.auditActive = false;
    this.lastLocator = null;
    this.deps.panel.open(this.lastResult, this.deps.settings, {
      onCopy: (f) => this.copyField(f),
      onToggleHighlight: () => this.toggleHighlight(),
      onSelectNode: (i) => this.selectNode(i),
      onClose: () => this.unpin(),
      onCopyLocator: (fw) => this.copyLocator(fw),
      onCopyTestId: () => this.copyTestIdSnippet(),
      onToggleAudit: () => this.toggleAudit(),
    });
    this.pendingTreeReqId = ++this.reqCounter;
    this.deps.postToBridge({
      source: 'devlens',
      kind: 'ancestors',
      x: this.lastPoint.x,
      y: this.lastPoint.y,
      reqId: this.pendingTreeReqId,
      ownPrefix: this.deps.settings.ownPrefix,
    });
    if (this.deps.settings.testLocator || this.deps.settings.testIdAudit) {
      this.pendingLocatorReqId = ++this.reqCounter;
      this.deps.postToBridge({
        source: 'devlens',
        kind: 'testlocator',
        x: this.lastPoint.x,
        y: this.lastPoint.y,
        reqId: this.pendingLocatorReqId,
        testIdAttr: this.deps.settings.testIdAttr,
      });
    }
  }

  private unpin(): void {
    if (!this.pinned) return;
    this.pinned = false;
    this.highlightActive = false;
    this.auditActive = false;
    this.lastLocator = null;
    this.treeNodes = [];
    this.deps.overlay.clearBoxes();
    this.deps.panel.close();
  }

  /** Toggle highlight-all-instances for the pinned component (panel button / `H`). */
  toggleHighlight(): void {
    if (!this.pinned || !this.deps.settings.highlightAll) return;
    this.highlightActive = !this.highlightActive;
    this.deps.panel.setHighlightActive(this.highlightActive);
    if (this.highlightActive) {
      this.clearAudit(); // the overlay shows one box set at a time
      this.pendingInstancesReqId = ++this.reqCounter;
      this.deps.postToBridge({
        source: 'devlens',
        kind: 'highlightAll',
        x: this.lastPoint.x,
        y: this.lastPoint.y,
        reqId: this.pendingInstancesReqId,
        ownPrefix: this.deps.settings.ownPrefix,
        cap: this.deps.settings.highlightAllCap,
      });
    } else {
      this.deps.overlay.clearBoxes();
    }
  }

  /** Toggle the page-wide data-testid audit (panel button / `A`). */
  toggleAudit(): void {
    if (!this.pinned || !this.deps.settings.testIdAudit) return;
    this.auditActive = !this.auditActive;
    if (this.auditActive) {
      this.clearHighlight();
      this.deps.panel.setAuditActive(true);
      this.pendingAuditReqId = ++this.reqCounter;
      this.deps.postToBridge({
        source: 'devlens',
        kind: 'auditTestIds',
        x: this.lastPoint.x,
        y: this.lastPoint.y,
        reqId: this.pendingAuditReqId,
        testIdAttr: this.deps.settings.testIdAttr,
        cap: this.deps.settings.highlightAllCap,
      });
    } else {
      this.deps.panel.setAuditActive(false);
      this.deps.overlay.clearBoxes();
    }
  }

  private clearHighlight(): void {
    if (!this.highlightActive) return;
    this.highlightActive = false;
    this.deps.panel.setHighlightActive(false);
    this.deps.overlay.clearBoxes();
  }

  private clearAudit(): void {
    if (!this.auditActive) return;
    this.auditActive = false;
    this.deps.panel.setAuditActive(false);
    this.deps.overlay.clearBoxes();
  }

  private copyLocator(framework: TestFramework): void {
    if (!this.lastLocator) return;
    const text = formatLocator(this.lastLocator, framework, {
      testIdAttr: this.deps.settings.testIdAttr,
      seleniumLang: this.deps.settings.seleniumLang,
    });
    if (text) void this.deps.copy(text);
  }

  private copyTestIdSnippet(): void {
    if (!this.lastLocator) return;
    void this.deps.copy(`${this.deps.settings.testIdAttr}="${this.lastLocator.suggestedTestId}"`);
  }

  private copyField(field: CopyField): void {
    const r = this.lastResult;
    if (!r) return;
    let text = '';
    switch (field) {
      case 'name':
        text = r.name;
        break;
      case 'identityPath':
        text = r.identityPath || r.name;
        break;
      case 'componentSelector':
        text = r.selector ?? '';
        break;
      case 'domSelector':
        text = r.domSelector ?? '';
        break;
      case 'breadcrumb':
        text = r.breadcrumb.join(' › ');
        break;
      case 'all':
        text = this.allFields(r);
        break;
    }
    if (text) void this.deps.copy(text);
  }

  private allFields(r: InspectResult): string {
    const lines: string[] = [];
    if (r.name) lines.push(`Name: ${r.name}`);
    if (r.identityPath) lines.push(`Path: ${r.identityPath}`);
    if (r.selector) lines.push(`Selector: ${r.selector}`);
    if (r.domSelector) lines.push(`DOM: ${r.domSelector}`);
    if (r.breadcrumb.length) lines.push(`Breadcrumb: ${r.breadcrumb.join(' › ')}`);
    return lines.join('\n');
  }

  private selectNode(index: number): void {
    const node = this.treeNodes[index];
    if (!node) return;
    this.deps.overlay.show(
      node.rect,
      `<div class="dl-name">${escapeHtml(node.name)}</div>`,
      node.rect.left,
      node.rect.top,
    );
  }
}
