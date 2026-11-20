export type SpecStatus = 'SOURCED' | 'ASSUMED';

export interface ComponentSpecItem {
  readonly label: string;
  readonly value: string;
  readonly unit: string;
  readonly source: string;
  readonly status: SpecStatus;
}

export interface ComponentContent {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  readonly function: string;
  readonly materials: string;
  readonly specs: readonly ComponentSpecItem[];
  readonly history: string;
  readonly sources: readonly string[];
}

/**
 * Strict build-time / test-time schema validator for component content JSONs.
 * Rejects missing required fields, empty sources, or uncited specs.
 */
export function validateComponentContent(
  raw: unknown,
  fileHint: string
): ComponentContent {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`${fileHint}: must be a JSON object`);
  }
  const obj = raw as Record<string, unknown>;
  const reqStrings = ['id', 'name', 'summary', 'function', 'materials', 'history'] as const;
  for (const key of reqStrings) {
    if (typeof obj[key] !== 'string' || obj[key].trim().length === 0) {
      throw new Error(`${fileHint}: missing or empty required string "${key}"`);
    }
  }

  if (!Array.isArray(obj['sources']) || obj['sources'].length === 0) {
    throw new Error(`${fileHint}: "sources" must be a non-empty array`);
  }
  for (const [i, src] of (obj['sources'] as unknown[]).entries()) {
    if (typeof src !== 'string' || src.trim().length === 0) {
      throw new Error(`${fileHint}: sources[${i}] must be a non-empty string`);
    }
  }

  if (!Array.isArray(obj['specs']) || obj['specs'].length === 0) {
    throw new Error(`${fileHint}: "specs" must be a non-empty array`);
  }
  for (const [i, item] of (obj['specs'] as unknown[]).entries()) {
    if (!item || typeof item !== 'object') {
      throw new Error(`${fileHint}: specs[${i}] must be an object`);
    }
    const s = item as Record<string, unknown>;
    for (const k of ['label', 'value', 'source'] as const) {
      if (typeof s[k] !== 'string' || s[k].trim().length === 0) {
        throw new Error(`${fileHint}: specs[${i}].${k} must be a non-empty string`);
      }
    }
    if (typeof s['unit'] !== 'string') {
      throw new Error(`${fileHint}: specs[${i}].unit must be a string`);
    }
    if (s['status'] !== 'SOURCED' && s['status'] !== 'ASSUMED') {
      throw new Error(
        `${fileHint}: specs[${i}].status must be "SOURCED" or "ASSUMED"`
      );
    }
  }

  return raw as ComponentContent;
}
