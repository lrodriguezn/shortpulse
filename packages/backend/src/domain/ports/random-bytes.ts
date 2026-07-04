/**
 * `RandomBytes` — port interface for the CSPRNG used by the slug generator.
 *
 * The Phase 4 application layer injects this port into the
 * `generateSlug` helper so the auto-slug retry loop can be tested
 * deterministically (the shared `generateRandomSlug` uses
 * `node:crypto.randomBytes` directly; this port is the seam that
 * makes it testable).
 *
 * The default production implementation is a thin wrapper over
 * `node:crypto.randomBytes` and lives in Phase 5
 * (`infrastructure/node-crypto-random-bytes.ts`). Tests inject a
 * `FixedRandomBytes` to force collisions.
 *
 * Spec references:
 *  - `openspec/changes/add-shortpulse-app/design.md` §8 (slug algorithm)
 */
export interface RandomBytes {
  /**
   * Return a Buffer of `size` cryptographically-strong random bytes.
   * The default implementation maps to `node:crypto.randomBytes`;
   * tests inject a fixed buffer to force deterministic collisions.
   */
  randomBytes(size: number): Buffer;
}
