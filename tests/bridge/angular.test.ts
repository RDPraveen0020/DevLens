import { describe, it, expect } from 'vitest';
import { inspectAngular } from '../../src/bridge/adapters/angular';

function build(html: string): Document {
  const doc = document.implementation.createHTMLDocument('t');
  doc.body.innerHTML = html;
  return doc;
}

describe('inspectAngular', () => {
  it('uses the nearest custom-element selector when no runtime is present', () => {
    const doc = build('<app-root><app-user-card><span id="t">hi</span></app-user-card></app-root>');
    const el = doc.getElementById('t')!;
    const r = inspectAngular(el, {});
    expect(r.framework).toBe('angular');
    expect(r.name).toBe('app-user-card');
    expect(r.identityPath).toBe('app-user-card');
    expect(r.breadcrumb).toEqual(['app-root', 'app-user-card']);
  });

  it('uses ng.getComponent class name when available (dev build)', () => {
    const doc = build('<app-user-card id="h"></app-user-card>');
    const el = doc.getElementById('h')!;
    class UserCardComponent {}
    const win = { ng: { getComponent: () => new UserCardComponent() } };
    const r = inspectAngular(el, win);
    expect(r.name).toBe('UserCardComponent');
    expect(r.identityPath).toBe('app-user-card › UserCardComponent');
    expect(r.notes).toBeUndefined();
  });

  it('prefers the nearest own-prefix component over a library component', () => {
    const doc = build('<app-mail-onboard><mat-card><span id="t">x</span></mat-card></app-mail-onboard>');
    const r = inspectAngular(doc.getElementById('t')!, {}, 'app');
    expect(r.selector).toBe('app-mail-onboard');
    expect(r.name).toBe('app-mail-onboard');
    expect(r.identityPath).toBe('app-mail-onboard');
  });

  it('falls back to the nearest custom element when no own-prefix ancestor exists', () => {
    const doc = build('<mat-card><span id="t">x</span></mat-card>');
    const r = inspectAngular(doc.getElementById('t')!, {}, 'app');
    expect(r.selector).toBe('mat-card');
  });

  it('reads the class name from the own-prefix host when the runtime is present', () => {
    const doc = build('<app-mail-onboard id="h"><mat-card id="t"></mat-card></app-mail-onboard>');
    class MailOnboardComponent {}
    const host = doc.getElementById('h')!;
    const win = { ng: { getComponent: (el: Element) => (el === host ? new MailOnboardComponent() : null) } };
    const r = inspectAngular(doc.getElementById('t')!, win, 'app');
    expect(r.name).toBe('MailOnboardComponent');
    expect(r.identityPath).toBe('app-mail-onboard › MailOnboardComponent');
  });

  it('flags a minified class name', () => {
    const doc = build('<app-x id="h"></app-x>');
    const el = doc.getElementById('h')!;
    class e {}
    const win = { ng: { getComponent: () => new e() } };
    const r = inspectAngular(el, win);
    expect(r.identityPath).toBe('app-x › e (minified)');
    expect(r.notes).toBe('minified');
  });
});
