import type { ApiEndpoint, ApiMap, IdePreset, InspectResult, Settings } from './types';

export interface FileRef {
  file: string;
  line?: number;
}

/** Parse a "relpath:line" reference; the trailing ":N" is optional. */
export function parseFileRef(raw: string): FileRef {
  const idx = raw.lastIndexOf(':');
  if (idx > 0 && /^\d+$/.test(raw.slice(idx + 1))) {
    return { file: raw.slice(0, idx), line: Number(raw.slice(idx + 1)) };
  }
  return { file: raw };
}

export const IDE_TEMPLATES: Record<Exclude<IdePreset, 'custom'>, string> = {
  vscode: 'vscode://file/{path}:{line}:{col}',
  cursor: 'cursor://file/{path}:{line}',
  jetbrains: 'jetbrains://open?file={path}&line={line}',
};

function isAbsolute(p: string): boolean {
  return p.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(p);
}

function normalizeSlashes(p: string): string {
  return p.replace(/\\/g, '/');
}

export function buildOpenUrl(settings: Settings, file: string, line: number | undefined): string | null {
  const template = settings.ide === 'custom' ? settings.ideUrlTemplate : IDE_TEMPLATES[settings.ide];
  if (!template) return null;

  const f = normalizeSlashes(file);
  let path: string;
  if (isAbsolute(f)) {
    path = f;
  } else if (settings.projectRoot) {
    path = `${normalizeSlashes(settings.projectRoot).replace(/\/$/, '')}/${f}`;
  } else {
    return null;
  }

  const ln = String(line ?? 1);
  return template
    .replace(/\{path\}/g, path)
    .replace(/\{line\}/g, ln)
    .replace(/\{col\}/g, '1');
}

/**
 * Nearest custom-element ancestor (breadcrumb, nearest-first) that is a key in the
 * map. The nearest element is often a third-party component (mat-card, p-table,
 * ngx-*); this walks outward to the first selector that belongs to the project.
 */
export function nearestSelectorInMap(
  breadcrumb: string[],
  selector: string | undefined,
  map: Record<string, unknown> | null | undefined,
): string | null {
  if (!map) return null;
  const candidates = breadcrumb.length ? [...breadcrumb].reverse() : selector ? [selector] : [];
  for (const sel of candidates) {
    if (Object.prototype.hasOwnProperty.call(map, sel)) return sel;
  }
  return null;
}

/**
 * Resolve an open-in-IDE URL for an inspected element. Prefers an exact
 * data-dl-file (`sourceFile`); otherwise looks up the nearest own component in a
 * selector→"relpath:line" map. Returns null when neither yields a usable path.
 */
export function resolveOpenUrlFor(
  settings: Settings,
  result: InspectResult,
  map: Record<string, string> | null | undefined,
): string | null {
  if (result.sourceFile) {
    return buildOpenUrl(settings, result.sourceFile, result.sourceLine);
  }
  const sel = nearestSelectorInMap(result.breadcrumb, result.selector, map);
  if (sel && map) {
    const { file, line } = parseFileRef(map[sel]);
    return buildOpenUrl(settings, file, line);
  }
  return null;
}

/** Endpoints of the nearest own component for a hovered element, or null. */
export function resolveApisFor(result: InspectResult, map: ApiMap | null | undefined): ApiEndpoint[] | null {
  if (!map) return null;
  const sel = nearestSelectorInMap(result.breadcrumb, result.selector, map.components);
  if (!sel) return null;
  const out: ApiEndpoint[] = [];
  for (const svc of map.components[sel] ?? []) {
    for (const ep of map.services[svc] ?? []) {
      out.push({ service: svc, method: ep.method, path: ep.path });
    }
  }
  return out.length ? out : null;
}
