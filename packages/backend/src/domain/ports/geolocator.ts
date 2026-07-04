/**
 * `Geolocator` — port interface for IP → geo lookup.
 *
 * The application layer (Phase 4) depends ONLY on this port. The
 * concrete MaxMind implementation lives in Phase 5
 * (`infrastructure/maxmind-geolocator.ts`); the test fallback lives
 * in `infrastructure/dummy-geolocator.ts`.
 *
 * Spec references:
 *  - `openspec/specs/analytics/spec.md` requirement #1 (geo fields MAY be null)
 *  - `openspec/changes/add-shortpulse-app/design.md` §9
 */
export interface GeoLookupResult {
  /** ISO country code (e.g. "US") or null when the DB misses. */
  readonly country: string | null;
  /** City name (English) or null when the DB misses. */
  readonly city: string | null;
}

/**
 * Domain-side contract for IP geolocation. Implementations:
 *  - MUST return `{country: null, city: null}` on miss (never throw).
 *  - SHOULD be cheap enough to call on the redirect hot path.
 */
export interface Geolocator {
  lookup(ip: string): GeoLookupResult;
}
