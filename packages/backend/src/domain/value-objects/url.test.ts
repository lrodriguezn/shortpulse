/**
 * Tests for the `OriginalUrl` value object.
 *
 * The value object wraps the shared `isValidHttpsUrl` and adds:
 *  - A branded `OriginalUrl` type so the domain can distinguish a raw
 *    user input from a validated URL.
 *  - A `createOriginalUrl` composite that returns a discriminated
 *    result (mirrors the `Slug` value object).
 *  - A re-export of `isValidHttpsUrl` so application layer code that
 *    only needs the boolean check (e.g. fast-path validation) does not
 *    have to import from `@shortpulse/shared` directly.
 *
 * Spec references:
 *  - `openspec/specs/links/spec.md` requirement #1 (valid http(s) URL)
 *  - `openspec/changes/add-shortpulse-app/design.md` §5 (URL validation)
 */
import { describe, it, expect } from 'vitest';

import { createOriginalUrl, isValidHttpsUrl, type OriginalUrl } from './url.js';

describe('createOriginalUrl', () => {
  it('returns { success: true, url } for a valid https URL', () => {
    const result = createOriginalUrl('https://example.com');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.url).toBe('https://example.com');
      // Brand proof: a OriginalUrl is assignable to a string.
      const asString: string = result.url;
      expect(asString).toBe('https://example.com');
    }
  });

  it('accepts http URLs (the spec allows both http and https)', () => {
    const result = createOriginalUrl('http://example.com');
    expect(result.success).toBe(true);
  });

  it('accepts URLs with paths, query strings, ports, and subdomains', () => {
    const cases = [
      'https://example.com/path',
      'https://example.com/?a=1&b=2',
      'https://example.com:8443/api',
      'https://www.example.com',
      'https://example.co.uk/some/deep/path?q=hello+world#fragment',
    ];
    for (const url of cases) {
      const result = createOriginalUrl(url);
      expect(result.success).toBe(true);
    }
  });

  it('rejects non-http(s) protocols (ftp, file, data, mailto, ws)', () => {
    const cases = [
      'ftp://example.com',
      'file:///etc/passwd',
      'data:text/plain;base64,SGVsbG8=',
      'mailto:[email protected]',
      'ws://example.com',
      'wss://example.com',
    ];
    for (const url of cases) {
      const result = createOriginalUrl(url);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(typeof result.error).toBe('string');
        expect(result.error.length).toBeGreaterThan(0);
      }
    }
  });

  it('rejects an empty string', () => {
    const result = createOriginalUrl('');
    expect(result.success).toBe(false);
  });

  it('rejects a non-URL string (not a URL at all)', () => {
    const result = createOriginalUrl('not-a-url');
    expect(result.success).toBe(false);
  });

  it('rejects a URL missing the protocol', () => {
    const result = createOriginalUrl('example.com');
    expect(result.success).toBe(false);
  });

  it('rejects a non-string input', () => {
    // @ts-expect-error -- testing runtime guard
    const result = createOriginalUrl(1234);
    expect(result.success).toBe(false);
  });

  it('the error message mentions http/https so the API can show it verbatim', () => {
    const result = createOriginalUrl('ftp://example.com');
    expect(result.success).toBe(false);
    if (!result.success) {
      // Should guide the user toward the fix.
      expect(result.error.toLowerCase()).toMatch(/http/);
    }
  });
});

describe('isValidHttpsUrl (re-export)', () => {
  it('returns true for valid http(s) URLs', () => {
    expect(isValidHttpsUrl('https://example.com')).toBe(true);
    expect(isValidHttpsUrl('http://example.com')).toBe(true);
  });

  it('returns false for everything else', () => {
    expect(isValidHttpsUrl('not-a-url')).toBe(false);
    expect(isValidHttpsUrl('ftp://example.com')).toBe(false);
    expect(isValidHttpsUrl('')).toBe(false);
  });
});

describe('OriginalUrl brand type', () => {
  it('the success variant of createOriginalUrl produces a value typed as OriginalUrl', () => {
    // Compile-time proof: `url` is typed `OriginalUrl`. The runtime
    // value is still a plain string, but the type is the test.
    const result = createOriginalUrl('https://example.com');
    if (result.success) {
      const url: OriginalUrl = result.url;
      expect(typeof url).toBe('string');
    }
  });
});
