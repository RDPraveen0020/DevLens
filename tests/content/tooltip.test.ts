import { describe, it, expect } from 'vitest';
import { renderTooltipHTML } from '../../src/content/tooltip';
import type { InspectResult, Settings } from '../../src/shared/types';

const result: InspectResult = {
  framework: 'angular',
  name: 'UserCardComponent',
  breadcrumb: ['app-root', 'app-user-card'],
  identityPath: 'app-user-card › UserCardComponent',
  tag: 'div',
  notes: undefined,
};

const allOn: Settings = {
  showName: true,
  showBreadcrumb: true,
  showIdentityPath: true,
  clickAction: 'copy',
  ide: 'vscode',
  ideUrlTemplate: 'vscode://file/{path}:{line}:{col}',
  projectRoot: '',
  ownPrefix: 'app',
  showApis: true,
  apiLimit: 10,
  tooltipPosition: 'cursor',
};

describe('renderTooltipHTML', () => {
  it('includes every enabled field', () => {
    const html = renderTooltipHTML(result, allOn);
    expect(html).toContain('UserCardComponent');
    expect(html).toContain('app-user-card › UserCardComponent');
    expect(html).toContain('app-root › app-user-card');
  });

  it('omits fields disabled in settings', () => {
    const html = renderTooltipHTML(result, { ...allOn, showBreadcrumb: false, showIdentityPath: false });
    expect(html).toContain('UserCardComponent');
    expect(html).not.toContain('›');
  });

  it('escapes HTML to prevent injection from page content', () => {
    const evil = { ...result, name: '<img src=x onerror=alert(1)>' };
    const html = renderTooltipHTML(evil, allOn);
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });
});

import type { ApiEndpoint } from '../../src/shared/types';

const apis: ApiEndpoint[] = [
  { service: 'AnnouncementService', method: 'GET', path: 'Announcements/GetAll' },
  { service: 'AnnouncementService', method: 'POST', path: 'Announcements/Add' },
  { service: 'OtherService', method: 'DELETE', path: 'Other/Remove/{param}' },
];

describe('renderTooltipHTML APIs section', () => {
  it('renders endpoints grouped by service when showApis is on', () => {
    const html = renderTooltipHTML(result, allOn, apis);
    expect(html).toContain('APIs');
    expect(html).toContain('AnnouncementService');
    expect(html).toContain('GET');
    expect(html).toContain('Announcements/GetAll');
  });

  it('omits the APIs section when showApis is off', () => {
    expect(renderTooltipHTML(result, { ...allOn, showApis: false }, apis)).not.toContain('APIs');
  });

  it('caps the list at apiLimit and shows a +N more note', () => {
    const html = renderTooltipHTML(result, { ...allOn, apiLimit: 1 }, apis);
    expect(html).toContain('+2 more');
  });

  it('renders nothing extra when there are no apis', () => {
    expect(renderTooltipHTML(result, allOn, [])).not.toContain('APIs');
  });
});
