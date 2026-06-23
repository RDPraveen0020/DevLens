export interface ComponentRef {
  selector: string;
  ref: string; // "relpath:line"
}

export function extractComponents(code: string, fileName: string, rootDir: string): ComponentRef[];

export function buildMap(
  files: { fileName: string; code: string }[],
  rootDir: string,
): Record<string, string>;
