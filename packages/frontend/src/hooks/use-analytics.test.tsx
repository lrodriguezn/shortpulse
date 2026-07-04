/**
 * Tests for the Analytics TanStack Query hooks.
 *
 * Three hooks: `useAnalyticsSummary` (KPIs), `useAnalytics` (events
 * list), `useTimeseries` (bucketed series). The summary hook has
 * no params; the other two pass their params straight through to
 * the corresponding api-client function, which serialises them
 * into the querystring. Each test mocks fetch and asserts the
 * right URL was hit + the parsed body is returned.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

import { useAnalytics, useAnalyticsSummary, useTimeseries } from './use-analytics.js';
import { resetApiBaseUrl, setApiBaseUrl } from '../lib/api-base-url.js';

const ORIGINAL_FETCH = globalThis.fetch;

function makeWrapper(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  setApiBaseUrl('http://api.test');
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  resetApiBaseUrl();
  vi.restoreAllMocks();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('useAnalyticsSummary', () => {
  it('fetches the summary and returns the KPIs', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        total_links: 3,
        total_clicks: 12,
        clicks_today: 4,
        clicks_last_7_days: 10,
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useAnalyticsSummary(), { wrapper: makeWrapper(qc) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.total_clicks).toBe(12);
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://api.test/api/analytics/summary');
  });
});

describe('useAnalytics', () => {
  it('fetches the events list with the given params', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      jsonResponse({ data: [], total: 0, page: 1, page_size: 20 }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useAnalytics({ country: 'ES', page: 2, page_size: 50 }), {
      wrapper: makeWrapper(qc),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toContain('http://api.test/api/analytics?');
    expect(url).toContain('country=ES');
    expect(url).toContain('page=2');
    expect(url).toContain('page_size=50');
  });
});

describe('useTimeseries', () => {
  it('fetches the timeseries with the given granularity', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse({ data: [] }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useTimeseries({ granularity: 'week' }), {
      wrapper: makeWrapper(qc),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toContain('http://api.test/api/analytics/timeseries?');
    expect(url).toContain('granularity=week');
  });
});
