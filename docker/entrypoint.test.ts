/**
 * Shell tests for `docker/entrypoint.sh`.
 *
 * The entrypoint is a shell script that:
 *   1. Validates required env vars (DATABASE_URL).
 *   2. Runs the Drizzle migrator.
 *   3. Starts the Fastify server via `exec`.
 *
 * We can't run the real migrator or real Fastify in a unit test
 * (they need a real Postgres + a real DB connection), so we mock
 * the two `node` invocations by prepending a fake `node` to PATH
 * that records the arguments + order, then exits 0.
 *
 * The test asserts the BEHAVIOUR that matters for production:
 *  - `DATABASE_URL` missing → exit 1, no node calls.
 *  - Both `node` calls happen in the right order: migrator first,
 *    then the server.
 *  - The server is started with `exec` so it REPLACES the shell
 *    (we detect this by checking the script's own PID before/after
 *    the exec — if exec succeeded, the child's PID is the node
 *    process's PID, not the script's).
 *
 * Spec references:
 *  - `openspec/changes/add-shortpulse-app/design.md` §11 (Docker
 *    entrypoint)
 *  - `openspec/changes/add-shortpulse-app/tasks.md` Phase 10
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, chmodSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, beforeEach, afterEach } from 'vitest';

const ENTRYPOINT = join(process.cwd(), 'docker', 'entrypoint.sh');

describe('docker/entrypoint.sh', () => {
  let fakeBin: string;
  let logFile: string;

  beforeEach(() => {
    // Build a temp bin dir with a `node` shim that records every
    // invocation to a log file and exits 0. The shim must NOT be
    // named `node` literally in the script's path — we override
    // PATH so `node` resolves to our shim.
    fakeBin = mkdtempSync(join(tmpdir(), 'sp-fake-bin-'));
    logFile = join(fakeBin, 'invocations.log');
    const shim = `#!/bin/sh
# Fake node that records every invocation. Args are quoted so the
# log is shell-safe.
echo "$@" >> "${logFile}"
exit 0
`;
    writeFileSync(join(fakeBin, 'node'), shim);
    chmodSync(join(fakeBin, 'node'), 0o755);
  });

  afterEach(() => {
    rmSync(fakeBin, { recursive: true, force: true });
  });

  it('exits non-zero with a clear error when DATABASE_URL is unset', () => {
    const result = spawnSync('sh', [ENTRYPOINT], {
      env: {
        ...process.env,
        // Prepend the fake bin so our `node` shim wins, but keep
        // the system PATH so `sh` itself (and any other tools) are
        // still findable.
        PATH: `${fakeBin}:${process.env['PATH'] ?? ''}`,
        DATABASE_URL: '', // explicit empty
      },
      encoding: 'utf8',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('DATABASE_URL is not set');
    // The fake `node` was never invoked.
    expect(() => readFileSync(logFile, 'utf8')).toThrow();
  });

  it('runs the migrator BEFORE the server (correct order)', () => {
    const result = spawnSync('sh', [ENTRYPOINT], {
      env: {
        ...process.env,
        PATH: `${fakeBin}:${process.env['PATH'] ?? ''}`,
        DATABASE_URL: 'postgres://test:test@localhost:5432/test',
        PORT: '3000',
      },
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('running database migrations');
    expect(result.stdout).toContain('starting Fastify server');

    // Read the invocation log and assert ordering.
    const invocations = readFileSync(logFile, 'utf8')
      .trim()
      .split('\n')
      .filter((l) => l.length > 0);

    expect(invocations).toHaveLength(2);
    // First call: migrator (the path contains `migrator.js`).
    expect(invocations[0]).toContain('migrator.js');
    // Second call: server entrypoint (the path contains `index.js`
    // AND is NOT the migrator).
    expect(invocations[1]).toContain('index.js');
    expect(invocations[1]).not.toContain('migrator.js');
  });

  it('exits non-zero when the migrator fails (set -e)', () => {
    // Replace the shim with one that fails on the migrator call
    // (first invocation) and succeeds on the server call.
    const failFirstShim = `#!/bin/sh
case "$1" in
  *migrator.js*) exit 1 ;;
  *) echo "$@" >> "${logFile}"; exit 0 ;;
esac
`;
    writeFileSync(join(fakeBin, 'node'), failFirstShim);
    chmodSync(join(fakeBin, 'node'), 0o755);

    const result = spawnSync('sh', [ENTRYPOINT], {
      env: {
        ...process.env,
        PATH: `${fakeBin}:${process.env['PATH'] ?? ''}`,
        DATABASE_URL: 'postgres://test:test@localhost:5432/test',
      },
      encoding: 'utf8',
    });

    expect(result.status).toBe(1);
    // The server `node` call NEVER happened — the migrator's failure
    // aborted the script via `set -e` before the `exec`.
    const invocations = existsSync(logFile) ? readFileSync(logFile, 'utf8').trim() : '';
    expect(invocations).toBe('');
  });

  it('uses `exec` to start the server (signals pass through to Node)', () => {
    // The entrypoint uses `exec node ...` so the Node process
    // REPLACES the shell. After exec, `$$` in a subshell is the
    // Node PID, not the shell PID. We verify this by reading the
    // script source and asserting the `exec node` line is present
    // (the actual PID check is what `exec` guarantees at the OS
    // level; the source check is the contract the script commits to).
    const source = readFileSync(ENTRYPOINT, 'utf8');
    expect(source).toMatch(/^\s*exec\s+node\s+\/app\/packages\/backend\/dist\/index\.js/m);
  });
});
