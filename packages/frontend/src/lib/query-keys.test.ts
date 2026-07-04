/**
 * Tests for the query-key factory.
 *
 * The factory is the single source of truth for the cache-key
 * shape that every TanStack Query hook (Phase 7 ships the keys;
 * Phase 8 / 9 consume them in `useLinks`, `useCreateLink`, etc.).
 * Two queries with the same key MUST return the same array so
 * the cache is stable; two queries with the same logical key but
 * different param references MUST still match (deep equality is
 * a TanStack Query feature, but stable references make it
 * cheaper).
 */
import { describe, expect, it } from 'vitest';

import { qk } from './query-keys.js';

describe('qk.links', () => {
  it('all is a stable tuple', () => {
    expect(qk.links.all).toEqual(['links']);
  });

  it('list key is parametrised by the query input', () => {
    const params = { page: 1, page_size: 20 } as const;
    const key = qk.links.list(params);
    expect(key[0]).toBe('links');
    expect(key[1]).toBe('list');
    expect(key[2]).toBe(params);
  });
});

describe('qk.analytics', () => {
  it('summary is a stable tuple', () => {
    expect(qk.analytics.summary).toEqual(['analytics', 'summary']);
  });

  it('events key is parametrised', () => {
    const params = { page: 1, page_size: 20 } as const;
    const key = qk.analytics.events(params);
    expect(key[0]).toBe('analytics');
    expect(key[1]).toBe('events');
    expect(key[2]).toBe(params);
  });

  it('timeseries key is parametrised', () => {
    const params = { granularity: 'day' as const };
    const key = qk.analytics.timeseries(params);
    expect(key[0]).toBe('analytics');
    expect(key[1]).toBe('timeseries');
    expect(key[2]).toBe(params);
  });
});
