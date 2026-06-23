import { describe, it, expect } from 'vitest';

describe('scaffold', () => {
  it('runs the test runner in a jsdom environment', () => {
    const el = document.createElement('div');
    expect(el.tagName).toBe('DIV');
  });
});
