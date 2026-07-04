import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const ROOT = resolve(__dirname, '..', '..');

describe('README stub', () => {
  it('exists at the repo root', () => {
    expect(existsSync(resolve(ROOT, 'README.md'))).toBe(true);
  });

  it('starts with an H1 that contains the project name "ShortPulse"', () => {
    const raw = readFileSync(resolve(ROOT, 'README.md'), 'utf8');
    expect(raw).toMatch(/^# .*ShortPulse/m);
  });

  it('mentions that the full documentation is coming soon (stub marker)', () => {
    const raw = readFileSync(resolve(ROOT, 'README.md'), 'utf8');
    // Either "under construction", "coming soon", or similar — the slice is
    // a stub. Anything beyond a title + one-liner is documented in slice 12.
    const isStub = /under construction|coming soon|work in progress|will be expanded|TODO/i.test(
      raw,
    );
    expect(isStub, 'README must be visibly a stub').toBe(true);
  });
});
