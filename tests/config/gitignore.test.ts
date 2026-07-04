import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const ROOT = resolve(__dirname, '..', '..');

/**
 * .gitignore is a pure-static file with no runtime behaviour, so we assert
 * its contents directly. We don't try to "test gitignore" — we test that the
 * rules we depend on are present.
 */
describe('.gitignore covers the paths this slice relies on', () => {
  const raw = readFileSync(resolve(ROOT, '.gitignore'), 'utf8');

  it.each([['node_modules'], ['dist'], ['.env'], ['coverage'], ['*.mmdb'], ['.DS_Store']])(
    'ignores %s',
    (pattern) => {
      expect(raw).toContain(pattern);
    },
  );
});
