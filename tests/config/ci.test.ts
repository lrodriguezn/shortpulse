import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const ROOT = resolve(__dirname, '..', '..');

describe('CI workflow', () => {
  it('has a CI workflow at .github/workflows/ci.yml', () => {
    expect(existsSync(resolve(ROOT, '.github', 'workflows', 'ci.yml'))).toBe(true);
  });

  it('CI workflow triggers on push and pull_request', () => {
    const raw = readFileSync(resolve(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
    expect(raw).toMatch(/on:/);
    expect(raw).toMatch(/push:/);
    expect(raw).toMatch(/pull_request:/);
  });

  it('CI workflow runs pnpm install, lint, typecheck, and test', () => {
    const raw = readFileSync(resolve(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
    expect(raw).toMatch(/pnpm install/);
    expect(raw).toMatch(/pnpm lint/);
    expect(raw).toMatch(/pnpm typecheck/);
    expect(raw).toMatch(/pnpm test/);
  });

  it('CI workflow uses the Node version compatible with engines.node (>=20)', () => {
    const raw = readFileSync(resolve(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
    expect(raw).toMatch(/node-version:\s*['"]?2[0-9]/);
  });
});
