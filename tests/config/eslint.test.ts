import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const ROOT = resolve(__dirname, '..', '..');

describe('ESLint configuration', () => {
  it('has a flat config file (eslint.config.js / .mjs / .cjs / .ts) at the root', () => {
    const candidates = [
      'eslint.config.js',
      'eslint.config.mjs',
      'eslint.config.cjs',
      'eslint.config.ts',
    ];
    const found = candidates.some((name) => existsSync(resolve(ROOT, name)));
    expect(found, 'eslint flat config must exist').toBe(true);
  });

  it('the ESLint config does not include the legacy .eslintrc patterns', () => {
    const legacy = ['.eslintrc', '.eslintrc.json', '.eslintrc.js', '.eslintrc.cjs'];
    for (const name of legacy) {
      expect(existsSync(resolve(ROOT, name)), `legacy ${name} must not exist`).toBe(false);
    }
  });

  it('root package.json has a working lint script (not the WU1 placeholder)', () => {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));
    expect(pkg.scripts.lint).toBeDefined();
    expect(pkg.scripts.lint).not.toMatch(/^echo/);
    expect(pkg.scripts.lint).toMatch(/eslint/);
  });

  it('eslint config exports a flat config array (or array-shaped value)', () => {
    // The simplest way to assert "flat config" without loading the module is
    // to read the file and check for the tseslint.config() / array export.
    const candidates = [
      'eslint.config.js',
      'eslint.config.mjs',
      'eslint.config.cjs',
      'eslint.config.ts',
    ];
    const path = candidates.map((name) => resolve(ROOT, name)).find((p) => existsSync(p));
    expect(path).toBeDefined();
    const raw = readFileSync(path!, 'utf8');
    // Either a plain array literal or the tseslint.config() helper call
    const looksLikeFlat =
      raw.includes('tseslint.config(') ||
      raw.includes('defineConfig(') ||
      /\[\s*\n?\s*\{/.test(raw);
    expect(looksLikeFlat, 'eslint config must be a flat-config array shape').toBe(true);
  });
});
