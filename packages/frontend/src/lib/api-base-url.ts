/**
 * API base-URL configuration for the frontend.
 *
 * The base URL is read from `VITE_API_URL` at build time (Vite
 * inlines `import.meta.env.VITE_*` into the bundle, so the value
 * MUST be a literal string \u2014 no runtime overrides). When the
 * env var is unset (typical for local dev with a Vite proxy), the
 * client falls back to a relative URL `''` so the browser hits
 * the same origin and the dev-server proxy (or the single-port
 * production server) can forward to the backend.
 *
 * The default is read once at module load. Tests use
 * `setApiBaseUrl` / `resetApiBaseUrl` to swap the value without
 * rebuilding the bundle.
 */

let baseUrl: string = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

export function getApiBaseUrl(): string {
  return baseUrl;
}

export function setApiBaseUrl(value: string): void {
  baseUrl = value;
}

export function resetApiBaseUrl(): void {
  baseUrl = (import.meta.env.VITE_API_URL as string | undefined) ?? '';
}
