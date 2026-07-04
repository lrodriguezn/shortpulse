/**
 * Slug generator — produces random mixed-case slugs for the auto-generation
 * path (`POST /api/links` with no `slug` body field).
 *
 * The generator is intentionally pure modulo the CSPRNG call:
 *   - Input: optional `length` (defaults to `AUTO_SLUG_LENGTH = 7`).
 *   - Output: a string of exactly `length` characters drawn uniformly from
 *     `AUTO_SLUG_ALPHABET` (54 chars, mixed case + digits, see constants.ts).
 *   - RNG: `crypto.randomBytes` (Node built-in CSPRNG).
 *
 * Modulo bias: 54 does not divide 256 evenly (`256 / 54 ≈ 4.74`), so
 * `randomByte % 54` would slightly bias toward the first 40 alphabet indices.
 * We mitigate this with **rejection sampling**: keep drawing bytes until we
 * land in the largest 256 − (256 mod 54) = 256 − 40 = **216** range, then
 * take `byte % 54`. This is the textbook approach and keeps the
 * distribution uniform at the cost of a tiny expected number of redraws
 * (~16% rejection rate).
 *
 * Spec references:
 *  - `openspec/specs/links/spec.md` requirement #5 (slug generation)
 *  - `openspec/changes/add-shortpulse-app/design.md` §8 (algorithm)
 */
import { randomBytes } from 'node:crypto';
import { AUTO_SLUG_ALPHABET, AUTO_SLUG_LENGTH } from './constants.js';

/**
 * Largest multiple of `AUTO_SLUG_ALPHABET.length` (54) that fits in a byte (256).
 * 256 − (256 mod 54) = 256 − 40 = 216. Bytes ≥ 216 are rejected to keep
 * the modulo uniform.
 */
const ALPHABET_LEN = AUTO_SLUG_ALPHABET.length; // 54
const REJECT_THRESHOLD = 256 - (256 % ALPHABET_LEN); // 216

/**
 * Generate a random slug of exactly `length` characters, drawn uniformly
 * from `AUTO_SLUG_ALPHABET`.
 *
 * @param length  Desired output length. Defaults to `AUTO_SLUG_LENGTH` (7).
 *                Must be a non-negative integer; 0 returns ''.
 * @returns       A mixed-case string of exactly `length` characters.
 */
export function generateRandomSlug(length: number = AUTO_SLUG_LENGTH): string {
  if (length <= 0) return '';

  // Build the result by drawing one alphabet char at a time. We over-allocate
  // by a small factor because of rejection sampling, then slice to `length`.
  // In the worst case 1 / 0.84 ≈ 1.19× extra bytes; we round up to 2× to be
  // safe and avoid a second `randomBytes` call.
  const out: string[] = [];
  while (out.length < length) {
    const buf = randomBytes(length * 2);
    for (let i = 0; i < buf.length && out.length < length; i += 1) {
      const byte = buf[i] as number; // randomBytes(1+) always fills the buffer
      if (byte < REJECT_THRESHOLD) {
        // SAFE: byte % ALPHABET_LEN ∈ [0, 53] which is always a valid index
        // into AUTO_SLUG_ALPHABET (a 54-char string). The non-null assertion
        // is guarded by the index range, not by an unchecked optional.
        out.push(AUTO_SLUG_ALPHABET[byte % ALPHABET_LEN]!);
      }
    }
  }
  return out.join('');
}
