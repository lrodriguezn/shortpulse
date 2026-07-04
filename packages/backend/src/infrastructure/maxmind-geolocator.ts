/**
 * `MaxMindGeolocator` — MaxMind mmdb implementation of the `Geolocator` port.
 *
 * Reads a GeoLite2-City mmdb file from disk and returns the ISO
 * country code + English city name per IP. Designed for **graceful
 * degradation** — when the file is missing, the path is unset, or
 * the lookup misses, the adapter returns `{country: null, city:
 * null}` and never throws. The redirect handler stays functional
 * even without a MaxMind DB (analytics still records; geo columns
 * are simply null).
 *
 * Two construction paths are supported:
 *
 *  1. **`{ dbPath: string }`** — async file load. The constructor
 *     attempts `maxmind.open(dbPath)` and, on any error
 *     (ENOENT, invalid file, permission), stores an internal
 *     "unavailable" flag. All `lookup()` calls then return nulls.
 *     `load()` is exposed so the container can `await` the file
 *     open at boot.
 *
 *  2. **`{ reader: Reader<CityResponse> }`** — direct injection.
 *     Used by tests and by alternative wirings (e.g. a pre-loaded
 *     reader from a network fetch). Skips the file system entirely.
 *
 * Spec references:
 *  - `openspec/specs/analytics/spec.md` requirement #1 (geo nullable)
 *  - `openspec/changes/add-shortpulse-app/design.md` §9 (Geolocator)
 *    + ADR-005 (MaxMind over HTTP API)
 */
import { open, type Reader } from 'maxmind';
import type { CityResponse } from 'maxmind';

import type { Geolocator, GeoLookupResult } from '../domain/ports/geolocator.js';

/** Either a `dbPath` to load from disk, or a pre-loaded `reader`. */
export interface MaxMindGeolocatorConfig {
  dbPath?: string;
  reader?: Reader<CityResponse>;
}

export class MaxMindGeolocator implements Geolocator {
  private reader: Reader<CityResponse> | null = null;
  private loadFailed = false;

  constructor(config: MaxMindGeolocatorConfig) {
    if (config.reader) {
      // Direct injection — tests + alternative wirings.
      this.reader = config.reader;
    }
    // The file path is loaded lazily via `load()` (called by the
    // container at boot). The constructor itself is sync and
    // never throws.
  }

  /**
   * Open the mmdb file from disk. Idempotent — calling twice is a
   * no-op. Returns `true` on success, `false` on any failure
   * (file missing, permission, invalid format). Never throws.
   */
  async load(dbPath: string): Promise<boolean> {
    if (!dbPath) return false;
    if (this.reader) return true; // already wired
    try {
      this.reader = await open<CityResponse>(dbPath);
      this.loadFailed = false;
      return true;
    } catch {
      this.reader = null;
      this.loadFailed = true;
      return false;
    }
  }

  /**
   * IP → geo lookup. Never throws. Returns `{country: null, city:
   * null}` on miss / unavailable / invalid input.
   */
  lookup(ip: string): GeoLookupResult {
    if (typeof ip !== 'string' || ip.length === 0) {
      return { country: null, city: null };
    }
    if (!this.reader) {
      return { country: null, city: null };
    }
    const record = this.reader.get(ip);
    if (record === null || record === undefined) {
      return { country: null, city: null };
    }
    return {
      country: record.country?.iso_code ?? null,
      city: record.city?.names?.en ?? null,
    };
  }
}
