import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/shared/types';

describe('DEFAULT_SETTINGS', () => {
  it('enables all tooltip fields by default and follows the cursor', () => {
    expect(DEFAULT_SETTINGS).toEqual({
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
    });
  });
});
