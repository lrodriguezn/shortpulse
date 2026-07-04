/**
 * `NodeCryptoRandomBytes` — `node:crypto.randomBytes` implementation of the `RandomBytes` port.
 *
 * Thin wrapper over the built-in CSPRNG. Used by the `CreateLinkUseCase`
 * auto-slug generator; the port is the injection seam that lets
 * tests force deterministic collisions.
 *
 * Spec references:
 *  - `openspec/changes/add-shortpulse-app/design.md` §8 (slug algorithm)
 */
import { randomBytes as nodeRandomBytes } from 'node:crypto';

import type { RandomBytes } from '../domain/ports/random-bytes.js';

export class NodeCryptoRandomBytes implements RandomBytes {
  /**
   * Return `size` cryptographically-strong random bytes.
   * Delegates to `node:crypto.randomBytes` (Node built-in CSPRNG).
   */
  randomBytes(size: number): Buffer {
    return nodeRandomBytes(size);
  }
}
