import type { ApiEndpoint, InspectResult, Settings } from '../shared/types';

function escapeHtml(s: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return s.replace(/[&<>"']/g, (c) => map[c]);
}

export function renderTooltipHTML(result: InspectResult, settings: Settings, apis?: ApiEndpoint[]): string {
  const rows: string[] = [];
  rows.push(`<div class="dl-fw dl-fw-${result.framework}">${escapeHtml(result.framework)}</div>`);
  if (settings.showName && result.name) {
    rows.push(`<div class="dl-name">${escapeHtml(result.name)}</div>`);
  }
  if (settings.showIdentityPath && result.identityPath) {
    rows.push(`<div class="dl-path">${escapeHtml(result.identityPath)}</div>`);
  }
  if (settings.showBreadcrumb && result.breadcrumb.length) {
    rows.push(`<div class="dl-crumb">${result.breadcrumb.map(escapeHtml).join(' › ')}</div>`);
  }
  if (result.notes) {
    rows.push(`<div class="dl-note">${escapeHtml(result.notes)}</div>`);
  }
  if (settings.showApis && apis && apis.length) {
    rows.push('<div class="dl-apis-title">APIs</div>');
    const limit = Math.max(0, settings.apiLimit);
    let shown = 0;
    let lastService = '';
    for (const ep of apis) {
      if (shown >= limit) break;
      if (ep.service !== lastService) {
        rows.push(`<div class="dl-api-svc">${escapeHtml(ep.service)}</div>`);
        lastService = ep.service;
      }
      rows.push(
        `<div class="dl-api"><span class="dl-api-m">${escapeHtml(ep.method)}</span> ${escapeHtml(ep.path)}</div>`,
      );
      shown++;
    }
    if (apis.length > shown) {
      rows.push(`<div class="dl-api-more">+${apis.length - shown} more</div>`);
    }
  }
  return rows.join('');
}
