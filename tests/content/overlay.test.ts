import { describe, it, expect, beforeEach } from 'vitest';
import { Overlay } from '../../src/content/overlay';

beforeEach(() => {
  document.body.innerHTML = '';
  document.getElementById('devlens-overlay')?.remove();
});

describe('Overlay', () => {
  it('mounts a single shadow-root host and removes it on destroy', () => {
    const o = new Overlay();
    o.mount();
    const hosts = document.querySelectorAll('#devlens-overlay');
    expect(hosts.length).toBe(1);
    expect((hosts[0] as HTMLElement).shadowRoot).toBeTruthy();
    o.destroy();
    expect(document.querySelectorAll('#devlens-overlay').length).toBe(0);
  });

  it('renders tooltip html into the shadow root when shown', () => {
    const o = new Overlay();
    o.mount();
    o.show({ left: 10, top: 10, width: 50, height: 20 }, '<div class="dl-name">Hello</div>', 10, 10);
    const root = (document.querySelector('#devlens-overlay') as HTMLElement).shadowRoot!;
    expect(root.querySelector('.dl-name')?.textContent).toBe('Hello');
    o.destroy();
  });
});
