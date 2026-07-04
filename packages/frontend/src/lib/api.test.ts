/**
 * Tests for the `apiClient` (fetch wrapper + 8 endpoint functions).
 *
 * The client is the only place the FE talks to the BE; Phase 7
 * ships the seam (URL building, method, body, error mapping) so
 * Phase 8 / 9 can compose queries and mutations without ever
 * re-implementing the request shape. The tests mock `fetch` and
 * assert the right URL + method + body for every endpoint, plus
 * the error-handling contract (non-2xx \u2192 ApiError with the
 * problem-details `detail` when available).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ApiError,
  createLink,
  deleteLink,
  getAnalyticsSummary,
  getTimeseries,
  health,
  listAnalytics,
  listLinks,
  redirectUrl,
} from './api.js';
import { resetApiBaseUrl, setApiBaseUrl } from './api-base-url.js';

const ORIGINAL_FETCH = globalThis.fetch;

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;

function mockFetchOnce(
  body: unknown,
  init: { status?: number; headers?: HeadersInit } = {},
): FetchMock {
  const status = init.status ?? 200;
  return vi.fn<typeof fetch>(async () => {
    // The Response constructor disallows a body on 204/205/304,
    // so callers can pass `null` as the body for those statuses.
    const responseBody =
      status === 204 || status === 205 || status === 304 ? null : JSON.stringify(body);
    return new Response(responseBody, {
      status,
      headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
    });
  });
}

beforeEach(() => {
  setApiBaseUrl('http://api.test');
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  resetApiBaseUrl();
  vi.restoreAllMocks();
});

describe('createLink', () => {
  it('POSTs to /api/links with the createLinkSchema body', async () => {
    const fetchMock = mockFetchOnce({
      id: '00000000-0000-0000-0000-000000000001',
      original_url: 'https://example.com',
      slug: 'my-link',
      short_url: 'http://api.test/my-link',
      created_at: '2026-07-04T00:00:00.000Z',
      click_count: 0,
      deleted_at: null,
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await createLink({ original_url: 'https://example.com', slug: 'my-link' });
    expect(result.slug).toBe('my-link');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://api.test/api/links');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init!.body as string)).toEqual({
      original_url: 'https://example.com',
      slug: 'my-link',
    });
  });
});

describe('listLinks', () => {
  it('GETs /api/links with serialized query params', async () => {
    const fetchMock = mockFetchOnce({
      data: [],
      total: 0,
      page: 1,
      page_size: 20,
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await listLinks({
      search: 'docs',
      sortBy: 'click_count',
      sortDir: 'asc',
      page: 2,
      page_size: 50,
    });
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toContain('http://api.test/api/links?');
    expect(url).toContain('search=docs');
    expect(url).toContain('sortBy=click_count');
    expect(url).toContain('sortDir=asc');
    expect(url).toContain('page=2');
    expect(url).toContain('page_size=50');
  });
});

describe('deleteLink', () => {
  it('DELETEs /api/links/:id', async () => {
    const fetchMock = mockFetchOnce(null, { status: 204 });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await deleteLink('00000000-0000-0000-0000-000000000099');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://api.test/api/links/00000000-0000-0000-0000-000000000099');
    expect(init?.method).toBe('DELETE');
  });
});

describe('redirectUrl', () => {
  it('builds the public short URL on the configured base', () => {
    expect(redirectUrl('my-link')).toBe('http://api.test/my-link');
  });
});

describe('getAnalyticsSummary', () => {
  it('GETs /api/analytics/summary', async () => {
    const fetchMock = mockFetchOnce({
      total_links: 0,
      total_clicks: 0,
      clicks_today: 0,
      clicks_last_7_days: 0,
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const summary = await getAnalyticsSummary();
    expect(summary.total_links).toBe(0);
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://api.test/api/analytics/summary');
  });
});

describe('listAnalytics', () => {
  it('GETs /api/analytics with serialized query params', async () => {
    const fetchMock = mockFetchOnce({ data: [], total: 0, page: 1, page_size: 20 });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await listAnalytics({
      country: 'ES',
      page: 1,
      page_size: 10,
    });
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toContain('http://api.test/api/analytics?');
    expect(url).toContain('country=ES');
    expect(url).toContain('page=1');
    expect(url).toContain('page_size=10');
  });
});

describe('getTimeseries', () => {
  it('GETs /api/analytics/timeseries with the granularity param', async () => {
    const fetchMock = mockFetchOnce({ data: [] });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await getTimeseries({ granularity: 'day' });
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toContain('http://api.test/api/analytics/timeseries?');
    expect(url).toContain('granularity=day');
  });
});

describe('health', () => {
  it('GETs /health and returns the parsed body', async () => {
    const fetchMock = mockFetchOnce({ status: 'ok', db: 'connected' });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const body = await health();
    expect(body).toEqual({ status: 'ok', db: 'connected' });
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://api.test/health');
  });
});

describe('error handling', () => {
  it('throws an ApiError with the problem-details detail on 4xx', async () => {
    const fetchMock = mockFetchOnce(
      {
        type: 'about:blank',
        title: 'Slug conflict',
        status: 409,
        detail: 'Ese slug ya existe, prueba otro',
      },
      { status: 409 },
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      createLink({ original_url: 'https://example.com', slug: 'taken' }),
    ).rejects.toMatchObject({
      name: 'ApiError',
      status: 409,
      message: 'Ese slug ya existe, prueba otro',
      detail: 'Ese slug ya existe, prueba otro',
    });
    // Sanity: ApiError is exported and instance-checkable.
    await expect(
      createLink({ original_url: 'https://example.com', slug: 'taken' }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('falls back to the problem title when no detail is present', async () => {
    const fetchMock = mockFetchOnce(
      { type: 'about:blank', title: 'Server down', status: 500 },
      { status: 500 },
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(health()).rejects.toMatchObject({
      name: 'ApiError',
      status: 500,
      message: 'Server down',
    });
  });

  it('falls back to "HTTP <status>" when the body is not JSON-parseable', async () => {
    // The `safeReadProblem` catch branch — the BE returns 5xx with
    // a non-JSON body (e.g. an upstream proxy error page). The
    // client must still surface a useful message.
    const fetchMock = vi.fn<typeof fetch>(async () => {
      // The Response body for the `await res.json()` call must
      // throw — the `safeReadProblem` swallows the throw and
      // returns `{}`, which falls through to the `HTTP ${status}`
      // message.
      return new Response('not json at all', { status: 502 });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(health()).rejects.toMatchObject({
      name: 'ApiError',
      status: 502,
      message: 'HTTP 502',
    });
  });
});

describe('api base URL resolution', () => {
  it('falls back to "http://localhost" when the configured base is empty (node env)', async () => {
    // The `base || fallback` branch — a misconfigured empty base
    // must still produce a valid URL. In node (no `window`) the
    // fallback is `'http://localhost'`; in jsdom the origin would
    // be used instead.
    setApiBaseUrl('');
    const fetchMock = mockFetchOnce({ status: 'ok', db: 'connected' });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await health();
    const [url] = fetchMock.mock.calls[0]!;
    // The URL is built from the fallback + '/health'.
    expect(url).toMatch(/^http:\/\/localhost\/health$/);
  });
});

describe('api signal plumbing', () => {
  it('forwards an AbortSignal to fetch when one is provided', async () => {
    const fetchMock = mockFetchOnce(null, { status: 204 });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const ac = new AbortController();
    await deleteLink('00000000-0000-0000-0000-000000000099', ac.signal);
    const [, init] = fetchMock.mock.calls[0]!;
    expect(init?.signal).toBe(ac.signal);
  });
});

describe('api querystring null/undefined skipping', () => {
  it('omits null and undefined values from the querystring', async () => {
    // The `v === null || v === undefined` branch — callers can
    // pass optional fields without polluting the URL with `key=`.
    const fetchMock = mockFetchOnce({ data: [], total: 0, page: 1, page_size: 20 });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await listAnalytics({
      country: null,
      page: 1,
      page_size: 10,
    } as unknown as Parameters<typeof listAnalytics>[0]);
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toContain('page=1');
    expect(url).toContain('page_size=10');
    // `country=null` is dropped by `URLSearchParams.set` (it
    // stringifies to 'null' but our `null` short-circuit prevents
    // the call from happening).
    expect(url).not.toContain('country=null');
  });
});
