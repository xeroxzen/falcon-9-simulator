import fs from 'node:fs';
import path from 'node:path';
import { renderConstantsRegistryMarkdown } from '../src/sim/config/registry.js';

const ASSUMPTIONS_PATH = path.resolve(process.cwd(), 'docs/ASSUMPTIONS.md');
const BEGIN_MARKER = '<!-- BEGIN GENERATED: CONSTANTS_REGISTRY -->';
const END_MARKER = '<!-- END GENERATED: CONSTANTS_REGISTRY -->';

const generated = renderConstantsRegistryMarkdown();
const current = fs.readFileSync(ASSUMPTIONS_PATH, 'utf8');

let updated: string;
const beginIdx = current.indexOf(BEGIN_MARKER);
const endIdx = current.indexOf(END_MARKER);

if (beginIdx !== -1 && endIdx !== -1 && endIdx > beginIdx) {
  updated =
    current.slice(0, beginIdx) +
    generated +
    current.slice(endIdx + END_MARKER.length);
} else {
  // Insert right after the intro horizontal rule ("---")
  const hrIdx = current.indexOf('\n---\n');
  if (hrIdx !== -1) {
    const insertAt = hrIdx + '\n---\n'.length;
    updated =
      current.slice(0, insertAt) +
      '\n' +
      generated +
      '\n\n---\n' +
      current.slice(insertAt);
  } else {
    updated = `${current.trimEnd()}\n\n---\n\n${generated}\n`;
  }
}

if (process.argv.includes('--check')) {
  if (updated !== current) {
    console.error(
      'docs/ASSUMPTIONS.md is out of sync with src/sim/config/registry.ts. Run `pnpm docs:assumptions`.'
    );
    process.exit(1);
  }
  console.log('docs/ASSUMPTIONS.md is in sync with src/sim/config/registry.ts.');
} else {
  fs.writeFileSync(ASSUMPTIONS_PATH, updated, 'utf8');
  console.log('Updated docs/ASSUMPTIONS.md from src/sim/config/registry.ts.');
}
