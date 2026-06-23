import { describe, it, expect, vi } from 'vitest';
import { createActivationGate } from '../../src/content/activation';

describe('createActivationGate', () => {
  it('applies an activate that arrived BEFORE init finished (the 2-3 click bug)', () => {
    const gate = createActivationGate();
    gate.request(true); // background message arrives during async init
    const apply = vi.fn();
    gate.ready(apply); // init completes
    expect(apply).toHaveBeenLastCalledWith(true);
  });

  it('applies requests immediately once ready', () => {
    const gate = createActivationGate();
    const apply = vi.fn();
    gate.ready(apply);
    expect(apply).toHaveBeenLastCalledWith(false); // defaults to inactive
    gate.request(true);
    expect(apply).toHaveBeenLastCalledWith(true);
    gate.request(false);
    expect(apply).toHaveBeenLastCalledWith(false);
  });

  it('uses the latest desired state when several arrive before ready', () => {
    const gate = createActivationGate();
    gate.request(true);
    gate.request(false);
    const apply = vi.fn();
    gate.ready(apply);
    expect(apply).toHaveBeenLastCalledWith(false);
  });

  it('defaults to inactive when nothing was requested', () => {
    const gate = createActivationGate();
    const apply = vi.fn();
    gate.ready(apply);
    expect(apply).toHaveBeenCalledWith(false);
  });
});
