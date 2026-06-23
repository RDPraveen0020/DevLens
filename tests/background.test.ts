import { describe, it, expect, vi } from 'vitest';

vi.mock('webextension-polyfill', () => ({ default: {} }));

import { createToggler } from '../src/background';

describe('createToggler', () => {
  it('injects scripts and activates on first toggle, deactivates on second', async () => {
    const inject = vi.fn(async () => {});
    const send = vi.fn(async () => {});
    const toggle = createToggler({ inject, send });

    await toggle(42);
    expect(inject).toHaveBeenCalledWith(42);
    expect(send).toHaveBeenLastCalledWith(42, { type: 'activate' });

    await toggle(42);
    expect(send).toHaveBeenLastCalledWith(42, { type: 'deactivate' });
    expect(inject).toHaveBeenCalledTimes(1); // not re-injected on deactivate
  });

  it('tracks tabs independently', async () => {
    const inject = vi.fn(async () => {});
    const send = vi.fn(async () => {});
    const toggle = createToggler({ inject, send });

    await toggle(1);
    await toggle(2);
    expect(send).toHaveBeenCalledWith(1, { type: 'activate' });
    expect(send).toHaveBeenCalledWith(2, { type: 'activate' });
  });
});
