/**
 * `UaParser` — port interface for user-agent → browser name.
 *
 * The application layer (Phase 4) depends ONLY on this port. The
 * concrete `ua-parser-js` adapter lives in Phase 5
 * (`infrastructure/ua-parser-js.adapter.ts`).
 *
 * Spec references:
 *  - `openspec/specs/analytics/spec.md` requirement #1 (browser parsed from UA)
 *  - `openspec/changes/add-shortpulse-app/design.md` §3 (ports & adapters)
 */
export interface UaParseResult {
  /** Browser family name (e.g. "Chrome") or null when unrecognised. */
  readonly browser: string | null;
}

/**
 * Domain-side contract for user-agent parsing. Implementations:
 *  - MUST return `{browser: null}` on unrecognised input (never throw).
 *  - SHOULD NOT block the redirect hot path.
 */
export interface UaParser {
  parse(userAgent: string): UaParseResult;
}
