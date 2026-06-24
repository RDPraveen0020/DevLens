import type { InspectResult, LocatorInfo, Settings, TestFramework, TreeNode } from '../shared/types';

export type CopyField = 'name' | 'identityPath' | 'componentSelector' | 'domSelector' | 'breadcrumb' | 'all';

export interface PanelCallbacks {
  onCopy: (field: CopyField) => void;
  onToggleHighlight: () => void;
  onSelectNode: (index: number) => void;
  onClose: () => void;
  onCopyLocator: (framework: TestFramework) => void;
  onCopyTestId: () => void;
  onToggleAudit: () => void;
}

const FRAMEWORK_BUTTONS: { framework: TestFramework; label: string; enabled: (s: Settings) => boolean }[] = [
  { framework: 'playwright', label: 'Playwright', enabled: (s) => s.tlPlaywright },
  { framework: 'cypress', label: 'Cypress', enabled: (s) => s.tlCypress },
  { framework: 'selenium', label: 'Selenium', enabled: (s) => s.tlSelenium },
  { framework: 'testingLibrary', label: 'Testing Lib', enabled: (s) => s.tlTestingLibrary },
  { framework: 'mendix', label: 'Mendix', enabled: (s) => s.tlMendix },
];

interface CopyButton {
  field: CopyField;
  label: string;
  enabled: (s: Settings) => boolean;
  available: (r: InspectResult) => boolean;
}

const COPY_BUTTONS: CopyButton[] = [
  { field: 'name', label: 'Name', enabled: (s) => s.copyName, available: (r) => !!r.name },
  { field: 'identityPath', label: 'Path', enabled: (s) => s.copyIdentityPath, available: (r) => !!r.identityPath },
  { field: 'componentSelector', label: 'Selector', enabled: (s) => s.copyComponentSelector, available: (r) => !!r.selector },
  { field: 'domSelector', label: 'DOM selector', enabled: (s) => s.copyDomSelector, available: (r) => !!r.domSelector },
  { field: 'breadcrumb', label: 'Breadcrumb', enabled: (s) => s.copyBreadcrumb, available: (r) => r.breadcrumb.length > 0 },
];

const STYLE = `
:host { all: initial; }
.dl-panel {
  position: fixed; top: 0; bottom: 0; width: 280px; box-sizing: border-box;
  background: #1e1e1e; color: #eaeaea; font: 12px/1.5 ui-monospace, monospace;
  z-index: 2147483647; box-shadow: 0 0 14px rgba(0,0,0,0.5);
  display: flex; flex-direction: column; overflow: hidden;
}
.dl-panel.left { left: 0; } .dl-panel.right { right: 0; }
.dl-p-head { padding: 8px 10px; border-bottom: 1px solid #333; position: relative; }
.dl-p-fw { text-transform: uppercase; font-size: 10px; letter-spacing: .04em; opacity: .7; }
.dl-p-name { font-weight: 600; color: #7ec699; word-break: break-word; }
.dl-p-path { color: #9cdcfe; word-break: break-word; }
.dl-p-close { position: absolute; top: 6px; right: 8px; cursor: pointer; background: none;
  border: none; color: #aaa; font-size: 16px; line-height: 1; padding: 2px 4px; }
.dl-p-close:hover { color: #fff; }
.dl-p-section { padding: 8px 10px; border-bottom: 1px solid #333; }
.dl-p-label { text-transform: uppercase; font-size: 10px; letter-spacing: .04em; opacity: .6; margin-bottom: 6px; }
.dl-copy-row { display: flex; flex-wrap: wrap; gap: 6px; }
.dl-btn { cursor: pointer; background: #2d2d2d; color: #ddd; border: 1px solid #444;
  border-radius: 4px; padding: 3px 8px; font: inherit; }
.dl-btn:hover { background: #3a3a3a; }
.dl-btn.active { background: #f0883e; color: #1e1e1e; border-color: #f0883e; }
.dl-btn.all { border-color: #7ec699; color: #7ec699; }
.dl-btn.copied { background: #7ec699; color: #1e1e1e; border-color: #7ec699; }
.dl-tree { flex: 1; overflow: auto; padding: 8px 6px; }
.dl-tree-row { cursor: pointer; padding: 2px 6px; border-radius: 3px; white-space: nowrap; }
.dl-tree-row:hover { background: #2d2d2d; }
.dl-tree-row.selected { color: #7ec699; font-weight: 600; }
.dl-testid { margin-top: 6px; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; word-break: break-all; }
.dl-testid-ok { color: #7ec699; }
.dl-testid-missing { color: #d7a35c; }
`;

export class Panel {
  private host: HTMLElement | null = null;
  private root: ShadowRoot | null = null;
  private panel: HTMLElement | null = null;
  private treeEl: HTMLElement | null = null;
  private highlightBtn: HTMLElement | null = null;
  private locRow: HTMLElement | null = null;
  private testidRow: HTMLElement | null = null;
  private auditBtn: HTMLElement | null = null;
  private open_ = false;
  private cb: PanelCallbacks | null = null;

  mount(): void {
    if (this.host) return;
    const host = document.createElement('div');
    host.id = 'devlens-panel';
    const root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = STYLE;
    root.appendChild(style);
    document.documentElement.appendChild(host);
    this.host = host;
    this.root = root;
  }

  open(result: InspectResult, settings: Settings, cb: PanelCallbacks): void {
    if (!this.root) return;
    this.cb = cb;
    this.open_ = true;
    this.panel?.remove();

    const panel = document.createElement('div');
    panel.className = `dl-panel ${settings.treeSide === 'left' ? 'left' : 'right'}`;
    panel.append(this.head(result, cb));

    if (settings.smartMenu) {
      const copy = this.copySection(result, settings, cb);
      if (copy) panel.append(copy);
    }
    if (settings.highlightAll) panel.append(this.highlightSection(cb));

    if (settings.testLocator || settings.testIdAudit) {
      panel.append(this.testSection(settings, cb));
    } else {
      this.locRow = this.testidRow = this.auditBtn = null;
    }

    if (settings.treePanel) {
      this.treeEl = document.createElement('div');
      this.treeEl.className = 'dl-tree';
      panel.append(this.treeEl);
    } else {
      this.treeEl = null;
    }

    this.root.appendChild(panel);
    this.panel = panel;
  }

  private head(result: InspectResult, cb: PanelCallbacks): HTMLElement {
    const head = document.createElement('div');
    head.className = 'dl-p-head';
    const fw = document.createElement('div');
    fw.className = 'dl-p-fw';
    fw.textContent = result.framework;
    const name = document.createElement('div');
    name.className = 'dl-p-name';
    name.textContent = result.name || result.tag;
    const path = document.createElement('div');
    path.className = 'dl-p-path';
    path.textContent = result.identityPath;
    const close = document.createElement('button');
    close.className = 'dl-p-close';
    close.setAttribute('data-action', 'close');
    close.textContent = '×';
    close.title = 'Close (Esc)';
    close.addEventListener('click', () => cb.onClose());
    head.append(fw, name, path, close);
    return head;
  }

  private copySection(result: InspectResult, settings: Settings, cb: PanelCallbacks): HTMLElement | null {
    const buttons = COPY_BUTTONS.filter((b) => b.enabled(settings) && b.available(result));
    if (!buttons.length) return null;
    const section = document.createElement('div');
    section.className = 'dl-p-section';
    const label = document.createElement('div');
    label.className = 'dl-p-label';
    label.textContent = 'Copy';
    const row = document.createElement('div');
    row.className = 'dl-copy-row';
    for (const b of buttons) {
      row.append(this.copyBtn(b.field, b.label, cb));
    }
    if (settings.copyAll) {
      const all = this.copyBtn('all', 'Copy all', cb);
      all.classList.add('all');
      row.append(all);
    }
    section.append(label, row);
    return section;
  }

  private copyBtn(field: CopyField, label: string, cb: PanelCallbacks): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = 'dl-btn';
    btn.setAttribute('data-field', field);
    btn.textContent = label;
    btn.addEventListener('click', () => {
      cb.onCopy(field);
      this.flash(btn, label);
    });
    return btn;
  }

  /** Briefly confirm a copy so the user can see which field landed on the clipboard. */
  private flash(btn: HTMLElement, label: string): void {
    btn.textContent = 'Copied ✓';
    btn.classList.add('copied');
    window.setTimeout(() => {
      btn.textContent = label;
      btn.classList.remove('copied');
    }, 1000);
  }

  private highlightSection(cb: PanelCallbacks): HTMLElement {
    const section = document.createElement('div');
    section.className = 'dl-p-section';
    const btn = document.createElement('button');
    btn.className = 'dl-btn';
    btn.setAttribute('data-action', 'highlight');
    btn.textContent = 'Highlight all (H)';
    btn.addEventListener('click', () => cb.onToggleHighlight());
    this.highlightBtn = btn;
    section.append(btn);
    return section;
  }

  private testSection(settings: Settings, cb: PanelCallbacks): HTMLElement {
    const section = document.createElement('div');
    section.className = 'dl-p-section dl-test';
    const label = document.createElement('div');
    label.className = 'dl-p-label';
    label.textContent = 'Test';
    section.append(label);

    if (settings.testLocator) {
      this.locRow = document.createElement('div');
      this.locRow.className = 'dl-copy-row';
      section.append(this.locRow);
    } else {
      this.locRow = null;
    }

    if (settings.testIdAudit) {
      this.testidRow = document.createElement('div');
      this.testidRow.className = 'dl-testid';
      const audit = document.createElement('button');
      audit.className = 'dl-btn';
      audit.setAttribute('data-action', 'audit');
      audit.textContent = 'Audit page';
      audit.addEventListener('click', () => cb.onToggleAudit());
      this.auditBtn = audit;
      section.append(this.testidRow, audit);
    } else {
      this.testidRow = null;
      this.auditBtn = null;
    }
    return section;
  }

  /** Fill in the locator buttons + test-id status once the bridge replies. */
  setLocator(info: LocatorInfo, settings: Settings): void {
    if (this.locRow && settings.testLocator) {
      this.locRow.replaceChildren();
      for (const b of FRAMEWORK_BUTTONS) {
        if (!b.enabled(settings)) continue;
        const btn = document.createElement('button');
        btn.className = 'dl-btn';
        btn.setAttribute('data-loc', b.framework);
        btn.textContent = b.label;
        btn.addEventListener('click', () => {
          this.cb?.onCopyLocator(b.framework);
          this.flash(btn, b.label);
        });
        this.locRow.append(btn);
      }
    }

    if (this.testidRow && settings.testIdAudit) {
      this.testidRow.replaceChildren();
      if (info.hasTestId) {
        const val = info.testId ?? (info.mxName ? `mx-name-${info.mxName}` : '');
        const ok = document.createElement('span');
        ok.className = 'dl-testid-ok';
        ok.textContent = info.testId ? `✓ ${settings.testIdAttr}="${val}"` : `✓ ${val}`;
        this.testidRow.append(ok);
      } else {
        const miss = document.createElement('span');
        miss.className = 'dl-testid-missing';
        miss.textContent = `missing — ${settings.testIdAttr}="${info.suggestedTestId}"`;
        const copy = document.createElement('button');
        copy.className = 'dl-btn';
        copy.setAttribute('data-action', 'copy-testid');
        copy.textContent = 'Copy attr';
        copy.addEventListener('click', () => {
          this.cb?.onCopyTestId();
          this.flash(copy, 'Copy attr');
        });
        this.testidRow.append(miss, copy);
      }
    }
  }

  setAuditActive(active: boolean, count?: number): void {
    if (!this.auditBtn) return;
    this.auditBtn.classList.toggle('active', active);
    this.auditBtn.textContent = active && count != null ? `Audit page (${count})` : 'Audit page';
  }

  setTree(nodes: TreeNode[]): void {
    if (!this.treeEl) return;
    this.treeEl.replaceChildren();
    nodes.forEach((node, i) => {
      const row = document.createElement('div');
      row.className = 'dl-tree-row' + (node.selected ? ' selected' : '');
      row.setAttribute('data-index', String(i));
      row.style.paddingLeft = `${6 + i * 12}px`;
      row.textContent = node.name;
      row.title = node.name;
      row.addEventListener('click', () => this.cb?.onSelectNode(i));
      this.treeEl!.append(row);
    });
  }

  setHighlightActive(active: boolean): void {
    this.highlightBtn?.classList.toggle('active', active);
  }

  isOpen(): boolean {
    return this.open_;
  }

  close(): void {
    this.open_ = false;
    this.panel?.remove();
    this.panel = null;
    this.treeEl = null;
    this.highlightBtn = null;
    this.locRow = this.testidRow = this.auditBtn = null;
  }

  destroy(): void {
    this.host?.remove();
    this.host = this.root = this.panel = this.treeEl = this.highlightBtn = null;
    this.locRow = this.testidRow = this.auditBtn = null;
    this.open_ = false;
  }
}
