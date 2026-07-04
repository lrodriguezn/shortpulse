/**
 * `OriginalUrl` value object.
 *
 * The branded `OriginalUrl` type is a phantom: it is a `string` at
 * runtime but a distinct type at compile time. The factory wraps the
 * shared `isValidHttpsUrl` (single source of truth for the protocol
 * rule) and returns a discriminated result so the application layer
 * can pattern-match without `try/catch`.
 *
 * `isValidHttpsUrl` is re-exported so callers that only need the
 * boolean (e.g. fast-path validation in the redirect handler) do not
 * have to import from `@shortpulse/shared` directly.
 *
 * Spec references:
 *  - `openspec/specs/links/spec.md` requirement #1
 *  - `openspec/changes/add-shortpulse-app/design.md` §5
 */
import { isValidHttpsUrl as sharedIsValidHttpsUrl } from '@shortpulse/shared';

/**
 * Branded `OriginalUrl` type. At runtime it is a plain string; the
 * `__originalUrl` phantom marker is what makes TypeScript refuse to
 * assign a raw `string` to an `OriginalUrl` parameter.
 */
export type OriginalUrl = string & { readonly __originalUrl: unique symbol };

/** Discriminated error variant for `createOriginalUrl`. */
export type OriginalUrlError = {
  readonly success: false;
  readonly error: string;
};

/** Discriminated result type returned by `createOriginalUrl`. */
export type OriginalUrlResult =
  { readonly success: true; readonly url: OriginalUrl } | OriginalUrlError;

/** Internal — wrap a validated raw string in the `OriginalUrl` brand. */
function brand(value: string): OriginalUrl {
  return value as OriginalUrl;
}

/**
 * Composite validator. Returns a discriminated result. The error
 * string mentions http/https so the API layer can show it verbatim
 * (spec links #1 — http(s) only).
 */
export function createOriginalUrl(input: string): OriginalUrlResult {
  if (typeof input !== 'string') {
    return { success: false, error: 'originalUrl must be a string' };
  }
  if (sharedIsValidHttpsUrl(input)) {
    return { success: true, url: brand(input) };
  }
  return {
    success: false,
    error: 'originalUrl must be a valid http or https URL',
  };
}

/** Re-export of the shared boolean check. Use when the caller only needs a yes/no. */
export function isValidHttpsUrl(value: string): boolean {
  return sharedIsValidHttpsUrl(value);
}
