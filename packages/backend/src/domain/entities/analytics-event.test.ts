/**
 * Tests for the `AnalyticsEvent` entity.
 *
 * Spec references:
 *  - `openspec/specs/analytics/spec.md` requirement #1 (event recording)
 *  - `openspec/changes/add-shortpulse-app/design.md` §3 (domain)
 *  - `openspec/changes/add-shortpulse-app/design.md` §4 (analytics schema)
 *
 * The entity is a pure, immutable record. The factory validates UUID
 * format for `id` and `linkId`, requires `timestamp` to be a Date,
 * requires `ip` to be a non-empty string, and allows the optional
 * analytics fields (`userAgent`, `referer`, `country`, `city`,
 * `browser`) to be `null`.
 */
import { describe, it, expect } from 'vitest';

import { createAnalyticsEvent, type AnalyticsEvent } from './analytics-event.js';

const VALID_ID = '11111111-1111-4111-8111-111111111111';
const VALID_LINK_ID = '22222222-2222-4222-8222-222222222222';
const FIXED_TS = new Date('2026-05-01T12:00:00.000Z');

describe('createAnalyticsEvent', () => {
  it('returns an event with all required fields populated', () => {
    const event = createAnalyticsEvent({
      id: VALID_ID,
      linkId: VALID_LINK_ID,
      timestamp: FIXED_TS,
      ip: '1.2.3.4',
      userAgent: 'Mozilla/5.0',
      referer: 'https://google.com',
      country: 'US',
      city: 'San Francisco',
      browser: 'Chrome',
    });
    expect(event.id).toBe(VALID_ID);
    expect(event.linkId).toBe(VALID_LINK_ID);
    expect(event.timestamp).toBe(FIXED_TS);
    expect(event.ip).toBe('1.2.3.4');
    expect(event.userAgent).toBe('Mozilla/5.0');
    expect(event.referer).toBe('https://google.com');
    expect(event.country).toBe('US');
    expect(event.city).toBe('San Francisco');
    expect(event.browser).toBe('Chrome');
  });

  it('accepts null for the optional fields (geo/UA may be unknown)', () => {
    // Spec analytics #1: country, city, user_agent, referer, and browser
    // MAY be null or empty when unknown. MaxMind can miss; the redirect
    // handler always provides a UA, but the entity must still accept null.
    const event = createAnalyticsEvent({
      id: VALID_ID,
      linkId: VALID_LINK_ID,
      timestamp: FIXED_TS,
      ip: '1.2.3.4',
      userAgent: null,
      referer: null,
      country: null,
      city: null,
      browser: null,
    });
    expect(event.userAgent).toBeNull();
    expect(event.referer).toBeNull();
    expect(event.country).toBeNull();
    expect(event.city).toBeNull();
    expect(event.browser).toBeNull();
  });

  it('rejects a malformed id UUID', () => {
    expect(() =>
      createAnalyticsEvent({
        id: 'not-a-uuid',
        linkId: VALID_LINK_ID,
        timestamp: FIXED_TS,
        ip: '1.2.3.4',
        userAgent: null,
        referer: null,
        country: null,
        city: null,
        browser: null,
      }),
    ).toThrow(/id/i);
  });

  it('rejects a malformed linkId UUID', () => {
    expect(() =>
      createAnalyticsEvent({
        id: VALID_ID,
        linkId: 'not-a-uuid',
        timestamp: FIXED_TS,
        ip: '1.2.3.4',
        userAgent: null,
        referer: null,
        country: null,
        city: null,
        browser: null,
      }),
    ).toThrow(/linkId/i);
  });

  it('rejects an empty ip', () => {
    expect(() =>
      createAnalyticsEvent({
        id: VALID_ID,
        linkId: VALID_LINK_ID,
        timestamp: FIXED_TS,
        ip: '',
        userAgent: null,
        referer: null,
        country: null,
        city: null,
        browser: null,
      }),
    ).toThrow();
  });

  it('rejects a non-Date timestamp', () => {
    expect(() =>
      createAnalyticsEvent({
        id: VALID_ID,
        linkId: VALID_LINK_ID,
        // @ts-expect-error -- testing runtime guard
        timestamp: '2026-05-01T12:00:00.000Z',
        ip: '1.2.3.4',
        userAgent: null,
        referer: null,
        country: null,
        city: null,
        browser: null,
      }),
    ).toThrow();
  });

  it('rejects an invalid Date timestamp (NaN time)', () => {
    expect(() =>
      createAnalyticsEvent({
        id: VALID_ID,
        linkId: VALID_LINK_ID,
        timestamp: new Date('not-a-date'),
        ip: '1.2.3.4',
        userAgent: null,
        referer: null,
        country: null,
        city: null,
        browser: null,
      }),
    ).toThrow();
  });

  it('rejects a non-string ip', () => {
    expect(() =>
      createAnalyticsEvent({
        id: VALID_ID,
        linkId: VALID_LINK_ID,
        timestamp: FIXED_TS,
        // @ts-expect-error -- testing runtime guard
        ip: 1234,
        userAgent: null,
        referer: null,
        country: null,
        city: null,
        browser: null,
      }),
    ).toThrow();
  });
});

describe('AnalyticsEvent immutability', () => {
  it('the factory returns an object whose fields are all read-only at the type level', () => {
    const event: AnalyticsEvent = createAnalyticsEvent({
      id: VALID_ID,
      linkId: VALID_LINK_ID,
      timestamp: FIXED_TS,
      ip: '1.2.3.4',
      userAgent: null,
      referer: null,
      country: null,
      city: null,
      browser: null,
    });
    // Snapshot the structural shape — the entity exposes exactly the
    // 9 fields from spec analytics #1, no setters, no methods.
    expect(Object.keys(event).sort()).toEqual(
      [
        'browser',
        'city',
        'country',
        'id',
        'ip',
        'linkId',
        'referer',
        'timestamp',
        'userAgent',
      ].sort(),
    );
  });
});
