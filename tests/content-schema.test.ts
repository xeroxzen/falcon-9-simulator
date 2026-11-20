import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALL_COMPONENTS } from '../src/content/registry.js';
import { validateComponentContent } from '../src/content/schema.js';

describe('Component content JSON schema validation', () => {
  it('validates every JSON file in src/content/components/ with no uncited specs', () => {
    const dir = path.resolve(process.cwd(), 'src/content/components');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
    expect(files.length).toBeGreaterThanOrEqual(13);

    const seenIds = new Set<string>();
    for (const file of files) {
      const raw = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      const validated = validateComponentContent(raw, file);
      expect(seenIds.has(validated.id)).toBe(false);
      seenIds.add(validated.id);
      expect(validated.sources.length).toBeGreaterThan(0);
      for (const spec of validated.specs) {
        expect(spec.source.trim().length).toBeGreaterThan(0);
        expect(['SOURCED', 'ASSUMED']).toContain(spec.status);
      }
    }

    // Registry covers every JSON file on disk
    expect(ALL_COMPONENTS.length).toBe(files.length);
  });
});
