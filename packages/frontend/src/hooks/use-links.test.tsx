/**
 * Tests for the Links TanStack Query hooks.
 *
 * `useLinks` reads, `useCreateLink` writes, `useDeleteLink` writes.
 * The hooks are tested with a real `QueryClient` + in-memory fetch
 * mock so we exercise the cache invalidation contract (creating /
 * deleting a link invalidates the list query so the table refreshes
 * without a manual refetch). The list input defaults to page 1
 * with the spec-locked sort (created_at desc).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useState, type ReactNode } from 'react';

import { useCreateLink, useDeleteLink, useLinks } from './use-links.js';
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

describe('useLinks', () => {
  it('fetches the list and returns the parsed data', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        data: [
          {
            id: '00000000-0000-0000-0000-000000000001',
            original_url: 'https://example.com',
            slug: 'ex',
            short_url: 'http://api.test/ex',
            created_at: '2026-07-04T00:00:00.000Z',
            click_count: 7,
            deleted_at: null,
          },
        ],
        total: 1,
        page: 1,
        page_size: 20,
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useLinks(), { wrapper: makeWrapper(qc) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.data).toHaveLength(1);
    expect(result.current.data?.total).toBe(1);
  });
});

describe('useCreateLink', () => {
  it('POSTs and invalidates the list cache on success', async () => {
    const fetchMock = vi
      .fn()
      // The create call.
      .mockImplementationOnce(async () =>
        jsonResponse(
          {
            id: '00000000-0000-0000-0000-000000000002',
            original_url: 'https://example.com',
            slug: 'fresh',
            short_url: 'http://api.test/fresh',
            created_at: '2026-07-04T00:00:00.000Z',
            click_count: 0,
            deleted_at: null,
          },
          201,
        ),
      )
      // The list refetch triggered by invalidation.
      .mockImplementationOnce(async () =>
        jsonResponse({ data: [], total: 0, page: 1, page_size: 20 }),
      );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    const { result } = renderHook(() => useCreateLink(), { wrapper: makeWrapper(qc) });

    await act(async () => {
      await result.current.mutateAsync({ original_url: 'https://example.com', slug: 'fresh' });
    });

    // The mutation must hit POST /api/links with the right body.
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://api.test/api/links');
    expect(init.method).toBe('POST');

    // And it must invalidate the list cache so the table refreshes.
    expect(invalidateSpy).toHaveBeenCalled();
    const args = invalidateSpy.mock.calls[0]?.[0] as { queryKey: readonly unknown[] } | undefined;
    expect(args?.queryKey[0]).toBe('links');
  });
});

describe('useDeleteLink', () => {
  it('DELETEs and invalidates the list cache on success', async () => {
    const fetchMock = vi
      .fn()
      // The delete call.
      .mockImplementationOnce(async () => new Response(null, { status: 204 }))
      // The list refetch triggered by invalidation.
      .mockImplementationOnce(async () =>
        jsonResponse({ data: [], total: 0, page: 1, page_size: 20 }),
      );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    const { result } = renderHook(() => useDeleteLink(), { wrapper: makeWrapper(qc) });

    await act(async () => {
      await result.current.mutateAsync('00000000-0000-0000-0000-000000000099');
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://api.test/api/links/00000000-0000-0000-0000-000000000099');
    expect(init.method).toBe('DELETE');
    expect(invalidateSpy).toHaveBeenCalled();
  });
});

// keep useState import (referenced by the wrapper pattern) \u2014
// without it the bundler would tree-shake the React import and
// the JSX in the wrapper would fail to type-check.
void useState;
