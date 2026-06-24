import type { Box } from '../shared/types';

const STYLE = `
:host { all: initial; }
.dl-box {
  position: fixed; pointer-events: none; z-index: 2147483646;
  border: 1px solid #4f9cff; background: rgba(79,156,255,0.12); display: none;
}
.dl-multi { position: fixed; left: 0; top: 0; pointer-events: none; z-index: 2147483645; }
.dl-multi-box {
  position: fixed; pointer-events: none;
  border: 1px solid #f0883e; background: rgba(240,136,62,0.14);
}
.dl-multi-box.missing { border-color: #f14c4c; background: rgba(241,76,76,0.16); }
.dl-tip {
  position: fixed; pointer-events: none; z-index: 2147483647;
  max-width: 360px; padding: 6px 8px; border-radius: 6px;
  background: #1e1e1e; color: #eaeaea; font: 12px/1.4 ui-monospace, monospace;
  box-shadow: 0 2px 8px rgba(0,0,0,0.4); display: none; word-break: break-word;
}
.dl-fw { text-transform: uppercase; font-size: 10px; letter-spacing: .04em; opacity: .7; }
.dl-name { font-weight: 600; color: #7ec699; }
.dl-path { color: #9cdcfe; }
.dl-crumb { color: #c8c8c8; }
.dl-note { color: #d7a35c; font-style: italic; }
.dl-apis-title { margin-top: 4px; padding-top: 4px; border-top: 1px solid #3a3a3a; text-transform: uppercase; font-size: 10px; letter-spacing: .04em; opacity: .7; }
.dl-api-svc { color: #c586c0; margin-top: 2px; }
.dl-api { color: #d4d4d4; padding-left: 8px; }
.dl-api-m { display: inline-block; min-width: 46px; color: #569cd6; font-weight: 600; }
.dl-api-more { color: #808080; font-style: italic; padding-left: 8px; }
`;

export class Overlay {
  private host: HTMLElement | null = null;
  private box: HTMLElement | null = null;
  private tip: HTMLElement | null = null;
  private multi: HTMLElement | null = null;

  mount(): void {
    if (this.host) return;
    const host = document.createElement('div');
    host.id = 'devlens-overlay';
    const root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = STYLE;
    const multi = document.createElement('div');
    multi.className = 'dl-multi';
    const box = document.createElement('div');
    box.className = 'dl-box';
    const tip = document.createElement('div');
    tip.className = 'dl-tip';
    root.append(style, multi, box, tip);
    document.documentElement.appendChild(host);
    this.host = host;
    this.box = box;
    this.tip = tip;
    this.multi = multi;
  }

  /** Draw one box per rect. `variant` switches color (orange instances / red audit). */
  showBoxes(boxes: Box[], variant: 'instances' | 'missing' = 'instances'): void {
    if (!this.multi) return;
    this.multi.replaceChildren();
    for (const b of boxes) {
      const el = document.createElement('div');
      el.className = variant === 'missing' ? 'dl-multi-box missing' : 'dl-multi-box';
      Object.assign(el.style, {
        left: `${b.left}px`,
        top: `${b.top}px`,
        width: `${b.width}px`,
        height: `${b.height}px`,
      });
      this.multi.appendChild(el);
    }
  }

  clearBoxes(): void {
    this.multi?.replaceChildren();
  }

  show(box: Box, tooltipHtml: string, tipX: number, tipY: number): void {
    if (!this.box || !this.tip) return;
    Object.assign(this.box.style, {
      display: 'block',
      left: `${box.left}px`,
      top: `${box.top}px`,
      width: `${box.width}px`,
      height: `${box.height}px`,
    });
    this.tip.innerHTML = tooltipHtml;
    Object.assign(this.tip.style, {
      display: 'block',
      left: `${tipX + 12}px`,
      top: `${tipY + 12}px`,
    });
  }

  hide(): void {
    if (this.box) this.box.style.display = 'none';
    if (this.tip) this.tip.style.display = 'none';
  }

  destroy(): void {
    this.host?.remove();
    this.host = this.box = this.tip = this.multi = null;
  }
}
