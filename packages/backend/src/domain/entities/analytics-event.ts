/**
 * `AnalyticsEvent` domain entity.
 *
 * A pure, immutable record of a single redirect. The factory validates
 * the structural shape (UUIDs, required string, Date) and lets the
 * application layer (Phase 4 redirect use-case) decide which fields
 * came from where: `ip`/`userAgent`/`referer` from the request, the
 * geo pair from the `Geolocator` port, `browser` from the `UaParser`
 * port, `timestamp` from the system clock at insert time.
 *
 * PURE: no I/O, no clock access, no port calls. The application layer
 * is responsible for resolving the optional fields to either a value
 * or `null` (MaxMind miss, missing headers, etc.).
 *
 * Spec references:
 *  - `openspec/specs/analytics/spec.md` requirement #1
 *  - `openspec/changes/add-shortpulse-app/design.md` §3 + §4
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Immutable analytics event. Every field is required by the spec except the four nullable optionals. */
export type AnalyticsEvent = {
  readonly id: string;
  readonly linkId: string;
  readonly timestamp: Date;
  readonly ip: string;
  readonly userAgent: string | null;
  readonly referer: string | null;
  readonly country: string | null;
  readonly city: string | null;
  readonly browser: string | null;
};

/** Input shape for `createAnalyticsEvent`. Same as the entity; factory is the validation boundary. */
export interface CreateAnalyticsEventInput {
  id: string;
  linkId: string;
  timestamp: Date;
  ip: string;
  userAgent: string | null;
  referer: string | null;
  country: string | null;
  city: string | null;
  browser: string | null;
}

/**
 * Factory + invariant guard. Throws on any invalid input — the application
 * layer translates thrown errors into the right HTTP status (Phase 6
 * error-mapper).
 */
export function createAnalyticsEvent(input: CreateAnalyticsEventInput): AnalyticsEvent {
  if (typeof input.id !== 'string' || !UUID_RE.test(input.id)) {
    throw new Error(`AnalyticsEvent.id must be a UUID (got: ${String(input.id)})`);
  }
  if (typeof input.linkId !== 'string' || !UUID_RE.test(input.linkId)) {
    throw new Error(`AnalyticsEvent.linkId must be a UUID (got: ${String(input.linkId)})`);
  }
  if (!(input.timestamp instanceof Date) || Number.isNaN(input.timestamp.getTime())) {
    throw new Error(
      `AnalyticsEvent.timestamp must be a valid Date (got: ${String(input.timestamp)})`,
    );
  }
  if (typeof input.ip !== 'string' || input.ip.length === 0) {
    throw new Error(`AnalyticsEvent.ip must be a non-empty string (got: ${String(input.ip)})`);
  }
  // The four nullable fields may be string-or-null. We do not enforce
  // a non-empty string when the value is non-null (the redirect handler
  // may legitimately record '' for a missing header, depending on
  // spec #1 "MAY be null or empty when unknown"). At the entity level
  // the only rule is the type.
  for (const field of ['userAgent', 'referer', 'country', 'city', 'browser'] as const) {
    const v = input[field];
    if (v !== null && typeof v !== 'string') {
      throw new Error(`AnalyticsEvent.${field} must be a string or null (got: ${String(v)})`);
    }
  }

  return Object.freeze({
    id: input.id,
    linkId: input.linkId,
    timestamp: input.timestamp,
    ip: input.ip,
    userAgent: input.userAgent,
    referer: input.referer,
    country: input.country,
    city: input.city,
    browser: input.browser,
  });
}
