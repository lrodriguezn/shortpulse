import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const ROOT = resolve(__dirname, '..', '..');

describe('.env.example', () => {
  it('exists at the repo root', () => {
    expect(existsSync(resolve(ROOT, '.env.example'))).toBe(true);
  });

  it('declares the four required env vars: DATABASE_URL, PORT, BASE_URL, GEOIP_DB_PATH', () => {
    const raw = readFileSync(resolve(ROOT, '.env.example'), 'utf8');
    for (const key of ['DATABASE_URL', 'PORT', 'BASE_URL', 'GEOIP_DB_PATH']) {
      // Either as a key=... line, or as a comment mentioning the key
      const re = new RegExp(`(^|\\n)\\s*#?\\s*${key}\\b`);
      expect(re.test(raw), `${key} must appear in .env.example`).toBe(true);
    }
  });

  it('is not the real .env (must not be loaded at runtime)', () => {
    expect(existsSync(resolve(ROOT, '.env'))).toBe(false);
  });
});
