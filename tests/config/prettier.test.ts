import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const ROOT = resolve(__dirname, '..', '..');

describe('Prettier configuration', () => {
  it('has a .prettierrc file (json or cjs) at the root', () => {
    const hasJson = existsSync(resolve(ROOT, '.prettierrc'));
    const hasJsonC = existsSync(resolve(ROOT, '.prettierrc.json'));
    const hasCjs = existsSync(resolve(ROOT, '.prettierrc.cjs'));
    const hasMjs = existsSync(resolve(ROOT, '.prettierrc.mjs'));
    expect(hasJson || hasJsonC || hasCjs || hasMjs, 'prettier config must exist').toBe(true);
  });

  it('prettier config uses printWidth 100, single quotes, trailing comma all, and semicolons', () => {
    // All four filename variants use a JSON body for this project, so the
    // simplest assertion is to read whichever one exists.
    const candidates = ['.prettierrc', '.prettierrc.json', '.prettierrc.cjs', '.prettierrc.mjs'];
    const path = candidates.map((name) => resolve(ROOT, name)).find((p) => existsSync(p));
    expect(path, 'prettier config must exist').toBeDefined();
    const raw = readFileSync(path!, 'utf8');
    const cfg = JSON.parse(raw) as Record<string, unknown>;
    expect(cfg.printWidth).toBe(100);
    expect(cfg.singleQuote).toBe(true);
    expect(cfg.trailingComma).toBe('all');
    expect(cfg.semi).toBe(true);
  });

  it('has a .prettierignore that excludes build outputs and dependencies', () => {
    const path = resolve(ROOT, '.prettierignore');
    expect(existsSync(path)).toBe(true);
    const raw = readFileSync(path, 'utf8');
    expect(raw).toMatch(/node_modules/);
    expect(raw).toMatch(/dist/);
  });
});
