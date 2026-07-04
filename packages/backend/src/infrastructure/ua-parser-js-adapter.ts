/**
 * `UaParserJsAdapter` — `ua-parser-js` implementation of the `UaParser` port.
 *
 * Wraps the `ua-parser-js` library and translates its result into
 * the domain `UaParseResult`. The library is stateless (the parser
 * is a small object built per call), so the adapter is a thin
 * facade.
 *
 * The contract (per `domain/ports/ua-parser.ts`) requires:
 *  - never throw;
 *  - return `{browser: null}` on unrecognised input.
 *
 * `ua-parser-js` v2 returns `null` for the browser name on misses
 * (the library uses ES module exports + ES2022 features). The
 * adapter does NOT cache parsed results — the cost is microseconds
 * and caching adds stale-data risk without meaningful benefit at
 * the redirect rate.
 *
 * Spec references:
 *  - `openspec/specs/analytics/spec.md` requirement #1 (browser parsed)
 *  - `openspec/changes/add-shortpulse-app/design.md` §3 (ports)
 */
import { UAParser } from 'ua-parser-js';

import type { UaParser, UaParseResult } from '../domain/ports/ua-parser.js';

export class UaParserJsAdapter implements UaParser {
  /**
   * Parse a user-agent string and return the browser family name,
   * or `null` when unrecognised. Never throws.
   */
  parse(userAgent: string): UaParseResult {
    if (typeof userAgent !== 'string' || userAgent.length === 0) {
      return { browser: null };
    }
    try {
      const result = new UAParser(userAgent).getBrowser();
      // `result.name` is the family name (e.g. "Chrome", "Firefox"),
      // or `undefined` when the library cannot classify the UA.
      const name = result.name;
      return { browser: name ?? null };
    } catch {
      // Defensive: the library should never throw, but the port
      // contract guarantees no-throw. Catch any unexpected error
      // and degrade to nulls.
      return { browser: null };
    }
  }
}
