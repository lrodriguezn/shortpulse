import { describe, it, expect } from 'vitest';
import {
  analyticsEventSchema,
  analyticsSummarySchema,
  listAnalyticsQuerySchema,
  timeseriesQuerySchema,
  timeseriesResponseSchema,
} from './analytics.js';

const UUID = '11111111-2222-4333-8444-555555555555';

describe('analyticsEventSchema', () => {
  it('parses a fully-populated event', () => {
    const result = analyticsEventSchema.safeParse({
      link_id: UUID,
      timestamp: '2026-07-04T12:00:00.000Z',
      ip: '1.2.3.4',
      user_agent: 'Mozilla/5.0',
      referer: 'https://google.com',
      country: 'US',
      city: 'Mountain View',
      browser: 'Chrome',
    });
    expect(result.success).toBe(true);
  });

  it('accepts null for the nullable geo/browser fields', () => {
    const result = analyticsEventSchema.safeParse({
      link_id: UUID,
      timestamp: '2026-07-04T12:00:00.000Z',
      ip: '1.2.3.4',
      user_agent: 'Mozilla/5.0',
      referer: '',
      country: null,
      city: null,
      browser: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a non-UUID link_id', () => {
    const result = analyticsEventSchema.safeParse({
      link_id: 'not-a-uuid',
      timestamp: '2026-07-04T12:00:00.000Z',
      ip: '1.2.3.4',
      user_agent: 'Mozilla/5.0',
      referer: '',
      country: null,
      city: null,
      browser: null,
    });
    expect(result.success).toBe(false);
  });
});

describe('analyticsSummarySchema', () => {
  it('parses a valid summary', () => {
    const result = analyticsSummarySchema.safeParse({
      total_links: 42,
      total_clicks: 1337,
      clicks_today: 7,
      clicks_last_7_days: 88,
    });
    expect(result.success).toBe(true);
  });

  it('rejects negative counts', () => {
    const result = analyticsSummarySchema.safeParse({
      total_links: -1,
      total_clicks: 0,
      clicks_today: 0,
      clicks_last_7_days: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe('listAnalyticsQuerySchema', () => {
  it('applies defaults (page=1, page_size=20) when no params passed', () => {
    const result = listAnalyticsQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.page_size).toBe(20);
    }
  });

  it('accepts an optional link_id filter', () => {
    const result = listAnalyticsQuerySchema.safeParse({ link_id: UUID });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.link_id).toBe(UUID);
    }
  });

  it('rejects a non-UUID link_id filter', () => {
    const result = listAnalyticsQuerySchema.safeParse({ link_id: 'nope' });
    expect(result.success).toBe(false);
  });

  it('accepts ISO date_from / date_to', () => {
    const result = listAnalyticsQuerySchema.safeParse({
      date_from: '2026-07-01T00:00:00.000Z',
      date_to: '2026-07-04T23:59:59.999Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a non-ISO date_from', () => {
    const result = listAnalyticsQuerySchema.safeParse({ date_from: 'yesterday' });
    expect(result.success).toBe(false);
  });

  it('rejects page_size > 100', () => {
    const result = listAnalyticsQuerySchema.safeParse({ page_size: '500' });
    expect(result.success).toBe(false);
  });
});

describe('timeseriesQuerySchema', () => {
  it('accepts each valid granularity (day, week, month)', () => {
    for (const granularity of ['day', 'week', 'month']) {
      const result = timeseriesQuerySchema.safeParse({ granularity });
      expect(result.success).toBe(true);
    }
  });

  it('rejects granularity=hour (not in the spec set)', () => {
    const result = timeseriesQuerySchema.safeParse({ granularity: 'hour' });
    expect(result.success).toBe(false);
  });

  it('rejects a missing granularity (required field)', () => {
    const result = timeseriesQuerySchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('accepts optional date_from / date_to', () => {
    const result = timeseriesQuerySchema.safeParse({
      granularity: 'day',
      date_from: '2026-07-01T00:00:00.000Z',
      date_to: '2026-07-04T23:59:59.999Z',
    });
    expect(result.success).toBe(true);
  });
});

describe('timeseriesResponseSchema', () => {
  it('parses a valid response with two buckets', () => {
    const result = timeseriesResponseSchema.safeParse({
      data: [
        { bucket_start: '2026-07-01T00:00:00.000Z', count: 10 },
        { bucket_start: '2026-07-02T00:00:00.000Z', count: 7 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('accepts an empty data array (no clicks in the window)', () => {
    const result = timeseriesResponseSchema.safeParse({ data: [] });
    expect(result.success).toBe(true);
  });

  it('rejects a bucket without bucket_start', () => {
    const result = timeseriesResponseSchema.safeParse({ data: [{ count: 1 }] });
    expect(result.success).toBe(false);
  });
});
