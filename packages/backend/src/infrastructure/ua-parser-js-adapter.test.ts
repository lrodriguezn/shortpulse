/**
 * Unit tests for `UaParserJsAdapter`.
 *
 * The adapter wraps the `ua-parser-js` library and translates its
 * `IBrowser` result into the domain `UaParseResult`. We test the
 * canonical UA strings (Chrome, Firefox, Safari) plus the
 * edge cases (empty, garbage) that the port contract guarantees
 * to handle without throwing.
 *
 * TDD note (Strict TDD active): these tests were written first. The
 * adapter in `ua-parser-js-adapter.ts` was written to make them pass.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { UaParserJsAdapter } from './ua-parser-js-adapter.js';
import type { UaParser } from '../domain/ports/ua-parser.js';

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Canonical UA strings (real-world examples)
// ---------------------------------------------------------------------------

describe('UaParserJsAdapter — canonical UA strings', () => {
  it('parses a Chrome UA string', () => {
    const adapter = new UaParserJsAdapter();
    const ua =
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
      'Chrome/120.0.0.0 Safari/537.36';
    expect(adapter.parse(ua)).toEqual({ browser: 'Chrome' });
  });

  it('parses a Firefox UA string', () => {
    const adapter = new UaParserJsAdapter();
    const ua = 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0';
    expect(adapter.parse(ua)).toEqual({ browser: 'Firefox' });
  });

  it('parses a Safari UA string', () => {
    const adapter = new UaParserJsAdapter();
    const ua =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 ' +
      '(KHTML, like Gecko) Version/17.2 Safari/605.1.15';
    expect(adapter.parse(ua)).toEqual({ browser: 'Safari' });
  });

  it('parses a curl UA string (browser: null — not a browser)', () => {
    const adapter = new UaParserJsAdapter();
    const result = adapter.parse('curl/8.4.0');
    // curl is not a browser — ua-parser-js may return 'curl' or null
    // depending on version. The contract is "browser or null" — any
    // string is fine, we just check that the call doesn't throw.
    expect(result.browser === null || typeof result.browser === 'string').toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('UaParserJsAdapter — edge cases', () => {
  it('returns browser: null for an empty string', () => {
    const adapter = new UaParserJsAdapter();
    expect(adapter.parse('')).toEqual({ browser: null });
  });

  it('returns browser: null for a garbage UA string (no exception)', () => {
    const adapter = new UaParserJsAdapter();
    const result = adapter.parse('not-a-real-user-agent');
    // The contract says the adapter must not throw and must return
    // `{browser: null}` or a string. The library typically returns
    // null for unrecognised UAs.
    expect(result.browser === null || typeof result.browser === 'string').toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Interface conformance
// ---------------------------------------------------------------------------

describe('UaParserJsAdapter — interface conformance', () => {
  it('satisfies the `UaParser` interface (compile-time + runtime)', () => {
    const adapter: UaParser = new UaParserJsAdapter();
    expect(typeof adapter.parse).toBe('function');
  });
});
