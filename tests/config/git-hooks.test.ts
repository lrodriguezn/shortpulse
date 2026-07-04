import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const ROOT = resolve(__dirname, '..', '..');

describe('Husky git hooks', () => {
  it('.husky/pre-commit exists and runs lint-staged', () => {
    const path = resolve(ROOT, '.husky', 'pre-commit');
    expect(existsSync(path)).toBe(true);
    const raw = readFileSync(path, 'utf8');
    expect(raw).toMatch(/lint-staged/);
  });

  it('.husky/commit-msg exists and runs commitlint', () => {
    const path = resolve(ROOT, '.husky', 'commit-msg');
    expect(existsSync(path)).toBe(true);
    const raw = readFileSync(path, 'utf8');
    expect(raw).toMatch(/commitlint/);
  });

  it('root package.json has a prepare script that wires husky', () => {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));
    expect(pkg.scripts.prepare).toBeDefined();
    expect(pkg.scripts.prepare).toMatch(/husky/);
  });
});

describe('lint-staged configuration', () => {
  it('has a .lintstagedrc config file at the root', () => {
    const candidates = [
      '.lintstagedrc',
      '.lintstagedrc.json',
      '.lintstagedrc.cjs',
      '.lintstagedrc.mjs',
    ];
    const found = candidates.some((name) => existsSync(resolve(ROOT, name)));
    expect(found, 'lint-staged config must exist').toBe(true);
  });

  it('lint-staged runs eslint --fix and prettier --write on staged source files', () => {
    const candidates = [
      '.lintstagedrc',
      '.lintstagedrc.json',
      '.lintstagedrc.cjs',
      '.lintstagedrc.mjs',
    ];
    const path = candidates.map((name) => resolve(ROOT, name)).find((p) => existsSync(p));
    expect(path).toBeDefined();
    const raw = readFileSync(path!, 'utf8');
    expect(raw).toMatch(/eslint/);
    expect(raw).toMatch(/--fix/);
    expect(raw).toMatch(/prettier/);
    expect(raw).toMatch(/--write/);
  });
});

describe('commitlint configuration', () => {
  it('has a commitlint config file (commitlint.config.* or .commitlintrc.*) at the root', () => {
    const candidates = [
      'commitlint.config.js',
      'commitlint.config.cjs',
      'commitlint.config.mjs',
      '.commitlintrc',
      '.commitlintrc.json',
      '.commitlintrc.cjs',
    ];
    const found = candidates.some((name) => existsSync(resolve(ROOT, name)));
    expect(found, 'commitlint config must exist').toBe(true);
  });

  it('commitlint extends @commitlint/config-conventional', () => {
    const candidates = [
      'commitlint.config.js',
      'commitlint.config.cjs',
      'commitlint.config.mjs',
      '.commitlintrc',
      '.commitlintrc.json',
      '.commitlintrc.cjs',
    ];
    const path = candidates.map((name) => resolve(ROOT, name)).find((p) => existsSync(p));
    expect(path).toBeDefined();
    const raw = readFileSync(path!, 'utf8');
    expect(raw).toMatch(/@commitlint\/config-conventional/);
  });
});
