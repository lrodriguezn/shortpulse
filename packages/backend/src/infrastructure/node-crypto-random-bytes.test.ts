/**
 * Unit tests for `NodeCryptoRandomBytes`.
 *
 * The adapter is a thin wrapper over `node:crypto.randomBytes` —
 * we test the two essential guarantees:
 *  - the returned buffer has the requested size;
 *  - the buffer is non-deterministic (two calls produce different
 *    bytes — we can't prove CSPRNG-quality with a finite sample, but
 *    we can prove the wrapper does not return a constant buffer).
 *
 * TDD note (Strict TDD active): these tests were written first. The
 * adapter in `node-crypto-random-bytes.ts` was written to make them
 * pass.
 */
import { describe, expect, it } from 'vitest';

import { NodeCryptoRandomBytes } from './node-crypto-random-bytes.js';
import type { RandomBytes } from '../domain/ports/random-bytes.js';

describe('NodeCryptoRandomBytes', () => {
  it('returns a Buffer of the requested size', () => {
    const rng = new NodeCryptoRandomBytes();
    const buf = rng.randomBytes(8);
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf).toHaveLength(8);
  });

  it('returns an empty Buffer for size 0', () => {
    const rng = new NodeCryptoRandomBytes();
    const buf = rng.randomBytes(0);
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf).toHaveLength(0);
  });

  it('produces non-deterministic output across calls (no constant buffer)', () => {
    const rng = new NodeCryptoRandomBytes();
    const a = rng.randomBytes(32);
    const b = rng.randomBytes(32);
    // Two random 32-byte buffers should never be byte-equal in
    // practice. If the wrapper accidentally returns a constant
    // buffer (e.g. a stub left in by a refactor), this catches it.
    expect(Buffer.compare(a, b)).not.toBe(0);
  });

  it('satisfies the `RandomBytes` interface (compile-time + runtime)', () => {
    const rng: RandomBytes = new NodeCryptoRandomBytes();
    expect(typeof rng.randomBytes).toBe('function');
  });
});
