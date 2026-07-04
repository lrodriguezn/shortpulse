/**
 * `apiClient` — the only place the FE talks to the BE.
 *
 * The client is a thin `fetch` wrapper:
 *  - Base URL from `getApiBaseUrl()` (VITE_API_URL, fallback to
 *    relative). The base-URL is read at call time so tests can
 *    swap it via `setApiBaseUrl` without rebuilding the bundle.
 *  - JSON body + JSON content-type, except for 204 / 304 (no body).
 *  - Non-2xx responses throw an `ApiError` whose `message` and
 *    `detail` are the problem-details `detail` (the spec-locked
 *    Spanish strings, e.g. "Ese slug ya existe, prueba otro"
 *    on a 409). The error has a `status` field for callers
 *    that need to branch on the HTTP code.
 *
 * The 8 endpoint functions match the BE's API contract
 * (design §5). Phase 8 / 9 hook these into TanStack Query
 * (see `useLinks`, `useCreateLink`, etc.).
 */
import type {
  AnalyticsEvent,
  AnalyticsSummary,
  CreateLinkInput,
  HealthResponse,
  LinkResponse,
  ListAnalyticsQuery,
  ListLinksQuery,
  TimeseriesQuery,
  TimeseriesResponse,
} from '@shortpulse/shared';

import { getApiBaseUrl } from './api-base-url.js';

/** Shape of the paginated list responses (`GET /api/links`, `GET /api/analytics`). */
export interface PagedResponse<T> {
  data: T[];
  total: number;
  page: number;
  page_size: number;
}

/** Thrown by every endpoint function on a non-2xx response. */
export class ApiError extends Error {
  readonly status: number;
  readonly detail: string | undefined;

  constructor(status: number, message: string, detail?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

type JsonValue =
  string | number | boolean | null | undefined | JsonValue[] | { [k: string]: JsonValue };

/**
 * Build a URL from the base + path, with an optional querystring
 * assembled from a flat object. `null` / `undefined` values are
 * skipped (so callers can spread optional fields without
 * serialising them as `key=undefined`).
 */
function buildUrl(path: string, query?: Record<string, JsonValue>): string {
  const base = getApiBaseUrl();
  const fallback = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
  const url = new URL(path, base || fallback);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === null || v === undefined) continue;
      url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  query?: Record<string, JsonValue>;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal, query } = opts;
  const headers: Record<string, string> = { Accept: 'application/json' };
  let serialized: BodyInit | undefined;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    serialized = JSON.stringify(body);
  }
  const url = buildUrl(path, query);
  const res = await fetch(url, { method, headers, body: serialized, signal });
  if (!res.ok) {
    const problem = await safeReadProblem(res);
    throw new ApiError(
      res.status,
      problem.detail ?? problem.title ?? `HTTP ${res.status}`,
      problem.detail,
    );
  }
  // 204 / 205 / 304 — no body.
  if (res.status === 204 || res.status === 205 || res.status === 304) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

interface ProblemLike {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
}

async function safeReadProblem(res: Response): Promise<ProblemLike> {
  try {
    return (await res.json()) as ProblemLike;
  } catch {
    return {};
  }
}

// --- Endpoints --------------------------------------------------------------

/** `POST /api/links` — create a short link. */
export function createLink(input: CreateLinkInput, signal?: AbortSignal): Promise<LinkResponse> {
  return request<LinkResponse>('/api/links', {
    method: 'POST',
    body: input,
    ...(signal ? { signal } : {}),
  });
}

/** `GET /api/links` — paginated, filterable list. */
export function listLinks(
  query: Partial<ListLinksQuery> = {},
  signal?: AbortSignal,
): Promise<PagedResponse<LinkResponse>> {
  return request<PagedResponse<LinkResponse>>('/api/links', {
    query: query as Record<string, JsonValue>,
    ...(signal ? { signal } : {}),
  });
}

/** `DELETE /api/links/:id` — soft-delete a link. */
export function deleteLink(id: string, signal?: AbortSignal): Promise<void> {
  return request<void>(`/api/links/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    ...(signal ? { signal } : {}),
  });
}

/**
 * Build the public short URL for a given slug.
 *
 * The browser hits this URL via a regular navigation; the BE
 * (Fastify) returns a 302 with the `Location` header set to the
 * original URL. We expose this as a URL builder (no fetch) so
 * the FE never has to second-guess the BASE_URL composition.
 */
export function redirectUrl(slug: string): string {
  return `${getApiBaseUrl().replace(/\/$/, '')}/${slug}`;
}

/** `GET /api/analytics/summary` — 4 KPI summary. */
export function getAnalyticsSummary(signal?: AbortSignal): Promise<AnalyticsSummary> {
  return request<AnalyticsSummary>('/api/analytics/summary', {
    ...(signal ? { signal } : {}),
  });
}

/** `GET /api/analytics` — paginated events list. */
export function listAnalytics(
  query: Partial<ListAnalyticsQuery> = {},
  signal?: AbortSignal,
): Promise<PagedResponse<AnalyticsEvent>> {
  return request<PagedResponse<AnalyticsEvent>>('/api/analytics', {
    query: query as Record<string, JsonValue>,
    ...(signal ? { signal } : {}),
  });
}

/** `GET /api/analytics/timeseries` — bucketed series. */
export function getTimeseries(
  query: TimeseriesQuery,
  signal?: AbortSignal,
): Promise<TimeseriesResponse> {
  return request<TimeseriesResponse>('/api/analytics/timeseries', {
    query: query as Record<string, JsonValue>,
    ...(signal ? { signal } : {}),
  });
}

/** `GET /health` — liveness / readiness probe. */
export function health(signal?: AbortSignal): Promise<HealthResponse> {
  return request<HealthResponse>('/health', {
    ...(signal ? { signal } : {}),
  });
}
