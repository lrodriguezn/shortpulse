/**
 * URL validation helpers.
 *
 * `isValidHttpsUrl` mirrors the protocol check in
 * `createLinkSchema.original_url` (design §5). Both the API boundary and
 * the application layer use the same rule — accepting only `http:` and
 * `https:` schemes — so a URL that passes one passes the other.
 *
 * Why a separate helper? The Zod schema can only be called from inside a
 * Zod pipeline; the application layer (e.g. `domain/url-validator.ts`)
 * needs a plain function to call. This keeps the rule in one place.
 */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * True iff `url` parses as a URL AND uses the `http:` or `https:` protocol.
 *
 * - Uses the WHATWG `URL` constructor (Node 20+ has it built-in).
 * - Catches every kind of malformed input by relying on the constructor's
 *   throw-on-invalid behavior.
 * - Trims surrounding whitespace before parsing so callers can pass
 *   user-typed strings without pre-cleaning.
 */
export function isValidHttpsUrl(url: string): boolean {
  if (typeof url !== 'string' || url.trim() === '') return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return ALLOWED_PROTOCOLS.has(parsed.protocol);
}
