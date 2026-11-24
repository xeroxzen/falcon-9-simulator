import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
  CONSTANTS_REGISTRY,
  REGISTRY_ENTRIES,
  renderConstantsRegistryMarkdown,
  type ConstantLabel,
} from '../src/sim/config/registry.js';

const VALID_LABELS = new Set<ConstantLabel>([
  'SOURCED',
  'CALIBRATED',
  'EMPIRICAL',
  'ASSUMED',
  'HEURISTIC',
]);

const LABEL_REGEX = /\b(SOURCED|CALIBRATED|EMPIRICAL|ASSUMED|HEURISTIC|DERIVED)\b/;

function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectTsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

describe('Constants Registry & Label Audit', () => {
  it('validates every registry entry has required provenance metadata', () => {
    expect(REGISTRY_ENTRIES.length).toBeGreaterThanOrEqual(45);

    for (const [key, item] of Object.entries(CONSTANTS_REGISTRY)) {
      expect(item.id).toBe(key);
      expect(VALID_LABELS.has(item.label)).toBe(true);
      expect(item.unit.trim().length).toBeGreaterThan(0);
      expect(item.sourceOrDerivation.trim().length).toBeGreaterThan(5);
      expect(item.commit.trim().length).toBeGreaterThanOrEqual(6);

      if (typeof item.value === 'number') {
        expect(Number.isFinite(item.value)).toBe(true);
      } else {
        expect(item.value.length).toBeGreaterThan(1);
      }

      if (item.label === 'CALIBRATED' || item.label === 'EMPIRICAL') {
        expect(
          item.calibratedOn.length,
          `${key} (${item.label}) must list calibratedOn flights/sources`
        ).toBeGreaterThan(0);
      }
    }

    // Specific provenance checks from v1.9.1 review
    expect(CONSTANTS_REGISTRY.ANTI_HOVER_FLARE_GATE_ALT_M.label).toBe('HEURISTIC');
    expect(CONSTANTS_REGISTRY.ANTI_HOVER_FLARE_DELAY_S.label).toBe('HEURISTIC');
    expect(CONSTANTS_REGISTRY.ANTI_HOVER_FLARE_RAMP_MS_PER_S.label).toBe('HEURISTIC');
    expect(CONSTANTS_REGISTRY.ANTI_HOVER_FLARE_MAX_ADD_MS.label).toBe('HEURISTIC');
    expect(CONSTANTS_REGISTRY.F9_S1_DRY_MASS_KG.sourceOrDerivation).toContain('27.0');
    expect(CONSTANTS_REGISTRY.F9_S1_DRY_MASS_KG.sourceOrDerivation).toContain('25.6');
  });

  it('keeps docs/ASSUMPTIONS.md generated registry tables strictly in sync with code', () => {
    const assumptionsPath = path.resolve(process.cwd(), 'docs/ASSUMPTIONS.md');
    const content = fs.readFileSync(assumptionsPath, 'utf8');
    const beginMarker = '<!-- BEGIN GENERATED: CONSTANTS_REGISTRY -->';
    const endMarker = '<!-- END GENERATED: CONSTANTS_REGISTRY -->';
    const beginIdx = content.indexOf(beginMarker);
    const endIdx = content.indexOf(endMarker);

    expect(beginIdx).toBeGreaterThanOrEqual(0);
    expect(endIdx).toBeGreaterThan(beginIdx);

    const actualBlock = content.slice(beginIdx, endIdx + endMarker.length);
    const expectedBlock = renderConstantsRegistryMarkdown();
    expect(actualBlock).toBe(expectedBlock);
  });

  it('fails if any numeric guidance/physics constant outside registry.ts lacks a provenance label', () => {
    const simDir = path.resolve(process.cwd(), 'src/sim');
    const files = collectTsFiles(simDir);
    const exemptBasenames = new Set(['registry.ts', 'math.ts', 'integrator.ts', 'types.ts']);
    const violations: string[] = [];

    // Matches `export const FOO_BAR = <rhs>` or `const FOO_BAR = <rhs>` where name is UPPER_SNAKE_CASE (>= 2 chars)
    const constDeclRe = /^\s*(?:export\s+)?const\s+([A-Z][A-Z0-9_]+)\s*(?::[^=]+)?=\s*(.*)$/;
    const registryRefRe = /\b(?:CONSTANTS_REGISTRY|R)\.[A-Z0-9_]+\.value\b/;
    const numericExprRe = /^[-+]?(?:\d|\.\d|Math\.)/;

    for (const file of files) {
      if (exemptBasenames.has(path.basename(file))) continue;
      const rel = path.relative(process.cwd(), file);
      const lines = fs.readFileSync(file, 'utf8').split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        const match = constDeclRe.exec(line);
        if (!match) continue;

        const constName = match[1]!;
        let rhs = match[2]!.trim();
        // Join next line when assignment wraps after '='
        if (rhs === '' && i + 1 < lines.length) {
          rhs = lines[i + 1]!.trim();
        }

        // Skip registry re-exports and non-numeric object/array/string constants
        if (registryRefRe.test(rhs)) continue;
        if (!numericExprRe.test(rhs)) continue;

        // Check inline comment and up to 6 preceding comment lines for an explicit label
        const contextLines = [line];
        for (let j = i - 1; j >= Math.max(0, i - 6); j--) {
          const prev = lines[j]!.trim();
          if (
            prev.startsWith('//') ||
            prev.startsWith('/*') ||
            prev.startsWith('*') ||
            prev.endsWith('*/')
          ) {
            contextLines.push(prev);
          } else if (prev === '') {
            continue;
          } else {
            break;
          }
        }
        const contextText = contextLines.join('\n');
        if (!LABEL_REGEX.test(contextText)) {
          violations.push(`${rel}:${i + 1} (${constName} = ${rhs})`);
        }
      }
    }

    expect(
      violations,
      `Unlabeled numeric constants found outside src/sim/config/registry.ts:\n${violations.join('\n')}`
    ).toEqual([]);
  });

  it('flags any magic numeric literal in src/sim/guidance/** and src/sim/models/** outside the allowlist', () => {
    // Tight allowlist: basic algebraic numbers, unit conversions, and tiny numerical epsilons.
    const ALLOWED_LITERALS = new Set<number>([0, 1, 2, 0.5, -1, 1000, 3600, 1e6]);
    const MATH_ANNOTATION_RE = /\/\*\s*math:\s*[^*]+\*\//;
    const dirs = [
      path.resolve(process.cwd(), 'src/sim/guidance'),
      path.resolve(process.cwd(), 'src/sim/models'),
    ];
    const violations: string[] = [];

    for (const dir of dirs) {
      for (const file of collectTsFiles(dir)) {
        const rel = path.relative(process.cwd(), file);
        const text = fs.readFileSync(file, 'utf8');
        const lines = text.split('\n');
        const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);

        const visit = (node: ts.Node): void => {
          if (ts.isNumericLiteral(node)) {
            const parent = node.parent;
            // Allow array index accesses (arr[i])
            if (ts.isElementAccessExpression(parent) && parent.argumentExpression === node) {
              return;
            }
            // Allow formatting / slice helpers (.toFixed(N), .slice(0, N))
            if (ts.isCallExpression(parent) && ts.isPropertyAccessExpression(parent.expression)) {
              const method = parent.expression.name.text;
              if (method === 'toFixed' || method === 'slice') {
                return;
              }
            }

            const rawVal = Number(node.text);
            const isNeg =
              ts.isPrefixUnaryExpression(parent) &&
              parent.operator === ts.SyntaxKind.MinusToken;
            const signedVal = isNeg ? -rawVal : rawVal;

            // Allow allowlisted numbers & pure numerical stability epsilons (0 < |v| <= 1e-3)
            const isTinyEpsilon = rawVal > 0 && rawVal <= 1e-3;
            if (ALLOWED_LITERALS.has(signedVal) || isTinyEpsilon) {
              return;
            }

            // Allow exact textbook mathematical formula coefficients explicitly annotated `/* math: ... */`
            const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
            if (MATH_ANNOTATION_RE.test(lines[line]!)) {
              return;
            }

            violations.push(`${rel}:${line + 1} [${signedVal}]  ${lines[line]!.trim()}`);
          }
          ts.forEachChild(node, visit);
        };
        visit(sf);
      }
    }

    expect(
      violations,
      `Unregistered numeric literals found in src/sim/guidance/** or src/sim/models/** — move to src/sim/config/registry.ts:\n${violations.join('\n')}`
    ).toEqual([]);
  });
});
