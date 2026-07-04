/**
 * Unit tests for `MaxMindGeolocator`.
 *
 * The geolocator adapter reads an mmdb file from disk and returns
 * `{country, city}` per IP. We test two paths:
 *
 *  1. **Constructor-level graceful degradation** — when the file is
 *     missing or `GEOIP_DB_PATH` is unset, the constructed geolocator
 *     never throws and every `lookup` returns `{country: null, city:
 *     null}`. This path is always runnable (no MaxMind DB file
 *     dependency in the test environment).
 *
 *  2. **Reader-level lookup** — when a `Reader` is injected (the
 *     production wiring path), the geolocator translates a MaxMind
 *     `CityResponse` into the domain `GeoLookupResult`. We mock the
 *     reader with a plain object that returns canned data.
 *
 * TDD note (Strict TDD active): these tests were written first. The
 * adapter in `maxmind-geolocator.ts` was written to make them pass.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MaxMindGeolocator } from './maxmind-geolocator.js';

import type { Reader } from 'maxmind';
import type { CityResponse } from 'maxmind';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a mock MaxMind `Reader<CityResponse>` whose `.get()` returns
 * a canned object (or `null` for miss scenarios).
 */
function makeReader(responses: Map<string, CityResponse | null>): Reader<CityResponse> {
  return {
    get: (ip: string) => responses.get(ip) ?? null,
  } as unknown as Reader<CityResponse>;
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'shortpulse-geoip-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Graceful degradation paths (always runnable, no MaxMind file required)
// ---------------------------------------------------------------------------

describe('MaxMindGeolocator — graceful degradation', () => {
  it('returns nulls when the mmdb file does not exist (no throw)', () => {
    const ghostPath = join(tmpDir, 'does-not-exist.mmdb');
    const geo = new MaxMindGeolocator({ dbPath: ghostPath });
    const result = geo.lookup('8.8.8.8');
    expect(result).toEqual({ country: null, city: null });
  });

  it('returns nulls when dbPath is empty (no throw)', () => {
    const geo = new MaxMindGeolocator({ dbPath: '' });
    expect(geo.lookup('8.8.8.8')).toEqual({ country: null, city: null });
  });

  it('returns nulls for every IP after a missing-file init (per-call, not cached)', () => {
    const ghostPath = join(tmpDir, 'ghost.mmdb');
    const geo = new MaxMindGeolocator({ dbPath: ghostPath });
    expect(geo.lookup('1.1.1.1')).toEqual({ country: null, city: null });
    expect(geo.lookup('2.2.2.2')).toEqual({ country: null, city: null });
  });
});

// ---------------------------------------------------------------------------
// Loaded-reader path (the production wiring path: container.ts calls
// maxmind.open() and injects the reader; here we just inject directly)
// ---------------------------------------------------------------------------

describe('MaxMindGeolocator — reader lookup', () => {
  it('returns the country ISO code and city English name on a hit', () => {
    const reader = makeReader(
      new Map([
        [
          '8.8.8.8',
          {
            country: { iso_code: 'US', names: { en: 'United States' } },
            city: { names: { en: 'Mountain View' } },
          },
        ],
      ]),
    );
    const geo = new MaxMindGeolocator({ reader });
    const result = geo.lookup('8.8.8.8');
    expect(result).toEqual({ country: 'US', city: 'Mountain View' });
  });

  it('returns nulls when the reader misses the IP (no record found)', () => {
    const reader = makeReader(new Map()); // empty → all `.get()` return null
    const geo = new MaxMindGeolocator({ reader });
    expect(geo.lookup('203.0.113.99')).toEqual({ country: null, city: null });
  });

  it('returns null country when the reader record has no country field', () => {
    const reader = makeReader(
      new Map([
        [
          '8.8.8.8',
          {
            // No `country` field — the record exists but is incomplete.
            city: { names: { en: 'Mountain View' } },
          },
        ],
      ]),
    );
    const geo = new MaxMindGeolocator({ reader });
    const result = geo.lookup('8.8.8.8');
    expect(result.country).toBeNull();
    expect(result.city).toBe('Mountain View');
  });

  it('returns null city when the record has a country but no city', () => {
    const reader = makeReader(
      new Map([
        [
          '8.8.8.8',
          {
            country: { iso_code: 'US', names: { en: 'United States' } },
            // No `city` field — country-level record only.
          },
        ],
      ]),
    );
    const geo = new MaxMindGeolocator({ reader });
    const result = geo.lookup('8.8.8.8');
    expect(result.country).toBe('US');
    expect(result.city).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Interface conformance
// ---------------------------------------------------------------------------

describe('MaxMindGeolocator — interface conformance', () => {
  it('satisfies the `Geolocator` interface (compile-time + runtime)', () => {
    const geo: import('../domain/ports/geolocator.js').Geolocator = new MaxMindGeolocator({
      dbPath: '',
    });
    expect(typeof geo.lookup).toBe('function');
  });
});
