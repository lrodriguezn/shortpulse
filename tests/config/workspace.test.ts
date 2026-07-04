import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const ROOT = resolve(__dirname, '..', '..');

describe('monorepo workspace structure', () => {
  it('declares the three packages in pnpm-workspace.yaml', () => {
    const raw = readFileSync(resolve(ROOT, 'pnpm-workspace.yaml'), 'utf8');
    expect(raw).toContain('packages/*');
  });

  it('has a root package.json named "shortpulse" and private', () => {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));
    expect(pkg.name).toBe('shortpulse');
    expect(pkg.private).toBe(true);
  });

  it('has the three workspace package directories with package.json', () => {
    for (const name of ['shared', 'backend', 'frontend']) {
      const pkgPath = resolve(ROOT, 'packages', name, 'package.json');
      expect(existsSync(pkgPath), `${pkgPath} should exist`).toBe(true);
    }
  });

  it('scopes the three workspace packages under @shortpulse/* and keeps them private', () => {
    for (const name of ['shared', 'backend', 'frontend']) {
      const pkg = JSON.parse(
        readFileSync(resolve(ROOT, 'packages', name, 'package.json'), 'utf8'),
      );
      expect(pkg.name).toBe(`@shortpulse/${name}`);
      expect(pkg.private).toBe(true);
    }
  });
});
