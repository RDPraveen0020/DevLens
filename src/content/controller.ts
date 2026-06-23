import { renderTooltipHTML } from './tooltip';
import type { Overlay } from './overlay';
import type { Settings, InspectResult, ApiEndpoint } from '../shared/types';
import type { BridgeRequest, BridgeResponse } from '../shared/messages';

interface ControllerDeps {
  settings: Settings;
  postToBridge: (req: BridgeRequest) => void;
  overlay: Pick<Overlay, 'mount' | 'show' | 'hide' | 'destroy'>;
  copy: (text: string) => Promise<void>;
  resolveOpenUrl: (result: InspectResult) => string | null;
  openUrl: (url: string) => void;
  resolveApis: (result: InspectResult) => ApiEndpoint[] | null;
}

export class InspectController {
  private active = false;
  private reqCounter = 0;
  private pendingReqId = -1;
  private lastResult: InspectResult | null = null;
  private lastPoint = { x: 0, y: 0 };
  private lastRect = { left: 0, top: 0, width: 0, height: 0 };

  constructor(private deps: ControllerDeps) {}

  setHighlightRect(rect: { left: number; top: number; width: number; height: number }): void {
    this.lastRect = rect;
  }

  setSettings(settings: Settings): void {
    this.deps.settings = settings;
  }

  activate(): void {
    if (this.active) return;
    this.active = true;
    this.deps.overlay.mount();
  }

  deactivate(): void {
    this.active = false;
    this.lastResult = null;
    this.deps.overlay.hide();
  }

  onPointerMove(e: { clientX: number; clientY: number }): void {
    if (!this.active) return;
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
    if (!data || data.source !== 'devlens-bridge' || data.kind !== 'result') return;
    if (data.reqId !== this.pendingReqId) return; // stale
    this.lastResult = data.result;
    const apis = this.deps.settings.showApis ? this.deps.resolveApis(data.result) : null;
    const html = renderTooltipHTML(data.result, this.deps.settings, apis ?? undefined);
    this.deps.overlay.show(this.lastRect, html, this.lastPoint.x, this.lastPoint.y);
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
      // No usable file path → fall back to copy + a transient hint.
      this.deps.overlay.show(
        this.lastRect,
        '<div class="dl-note">Can\'t open: import the selector map in DevLens Options &amp; set Project root</div>',
        this.lastPoint.x,
        this.lastPoint.y,
      );
    }

    // 'copy', or 'open' fallback: copy the identity path (or name as a last resort).
    await this.deps.copy(this.lastResult.identityPath || this.lastResult.name);
  }
}
