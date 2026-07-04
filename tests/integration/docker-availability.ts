/**
 * Docker availability probe.
 *
 * Returns `true` when the local Docker daemon accepts requests. The
 * integration tests use this to skip cleanly when Docker isn't available
 * (e.g. in a dev container without `docker` group membership, or on a
 * CI runner that hasn't started the daemon yet). The tests always run
 * in CI where the daemon is configured; local devs without Docker see
 * a clear skip message instead of a hang.
 *
 * We probe by reading `/var/run/docker.sock` permissions + a `docker
 * info` round-trip. The probe is fast (< 1s) and never mutates state.
 */

import { execSync } from 'node:child_process';

let cached: boolean | null = null;

export function isDockerAvailable(): boolean {
  if (cached !== null) return cached;
  try {
    // `docker info` is the canonical "is the daemon up" check. We
    // capture stderr; if the daemon is down, the process exits non-zero
    // and `execSync` throws.
    execSync('docker info', { stdio: 'ignore', timeout: 5_000 });
    cached = true;
  } catch {
    cached = false;
  }
  return cached;
}
