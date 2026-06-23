import { detectFramework } from './detect';
import { inspectAngular } from './adapters/angular';
import { inspectMendix } from './adapters/mendix';
import { inspectReact } from './adapters/react';
import { inspectVue } from './adapters/vue';
import { inspectBlazor } from './adapters/blazor';
import { inspectGeneric } from './adapters/generic';
import type { InspectResult } from '../shared/types';

export function inspectElement(el: Element, doc: Document, win: any, ownPrefix?: string): InspectResult {
  switch (detectFramework(doc, win)) {
    case 'angular':
      return inspectAngular(el, win, ownPrefix);
    case 'mendix':
      return inspectMendix(el, win);
    case 'react':
      return inspectReact(el);
    case 'vue':
      return inspectVue(el);
    case 'blazor':
      return inspectBlazor(el);
    default:
      return inspectGeneric(el);
  }
}
