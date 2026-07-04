import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const ROOT = resolve(__dirname, '..', '..');

describe('tsconfig structure', () => {
  it('has a tsconfig.base.json at the root', () => {
    expect(existsSync(resolve(ROOT, 'tsconfig.base.json'))).toBe(true);
  });

  it('root tsconfig.base.json enables strict mode and targets ES2022 with NodeNext resolution', () => {
    const ts = JSON.parse(readFileSync(resolve(ROOT, 'tsconfig.base.json'), 'utf8'));
    expect(ts.compilerOptions?.strict).toBe(true);
    expect(ts.compilerOptions?.target).toBe('ES2022');
    expect(ts.compilerOptions?.module).toBe('NodeNext');
    expect(ts.compilerOptions?.moduleResolution).toBe('NodeNext');
  });

  it('each workspace package extends the root base tsconfig', () => {
    for (const name of ['shared', 'backend', 'frontend']) {
      const tsPath = resolve(ROOT, 'packages', name, 'tsconfig.json');
      expect(existsSync(tsPath), `${tsPath} should exist`).toBe(true);
      const ts = JSON.parse(readFileSync(tsPath, 'utf8'));
      expect(ts.extends).toBe('../../tsconfig.base.json');
    }
  });

  it('the shared package tsconfig is set up to emit distributable output', () => {
    const ts = JSON.parse(
      readFileSync(resolve(ROOT, 'packages', 'shared', 'tsconfig.json'), 'utf8'),
    );
    expect(ts.compilerOptions?.outDir).toBeDefined();
    expect(ts.compilerOptions?.declaration).toBe(true);
  });
});
