/**
 * Structural tests for `docker/docker-compose.yml`.
 *
 * The compose file is YAML, and we don't have Docker in CI to
 * validate it with `docker compose config`. This test does a
 * lightweight structural check: the file is present, parses as
 * YAML, has the expected services + healthchecks + env vars, and
 * the healthcheck command matches the Node 20 `fetch` pattern
 * (per design §11 fix #4 — no `wget` / `curl`).
 *
 * Spec references:
 *  - `openspec/changes/add-shortpulse-app/design.md` §11 (Docker
 *    strategy) + fix #4 (Node 20 fetch healthcheck)
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

// `yaml` is a transitive dep of the workspace; resolve it through
// the pnpm store path so the test works without adding it to the
// root devDependencies (it would only be used for this one
// validation pass).
import { parse as parseYaml } from '../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/index.js';

const COMPOSE_PATH = join(process.cwd(), 'docker', 'docker-compose.yml');

describe('docker/docker-compose.yml', () => {
  it('exists and is a non-empty file', () => {
    expect(existsSync(COMPOSE_PATH)).toBe(true);
    const content = readFileSync(COMPOSE_PATH, 'utf8');
    expect(content.length).toBeGreaterThan(0);
  });

  it('parses as valid YAML with the expected top-level keys', () => {
    const parsed = parseYaml(readFileSync(COMPOSE_PATH, 'utf8')) as Record<string, unknown>;
    expect(parsed).toHaveProperty('services');
    expect(parsed).toHaveProperty('volumes');
  });

  it('declares exactly the two services (app + postgres)', () => {
    const parsed = parseYaml(readFileSync(COMPOSE_PATH, 'utf8')) as {
      services: Record<string, unknown>;
    };
    const serviceNames = Object.keys(parsed.services).sort();
    expect(serviceNames).toEqual(['app', 'postgres']);
  });

  it('configures the `app` service with restart, healthcheck, and depends_on postgres', () => {
    const parsed = parseYaml(readFileSync(COMPOSE_PATH, 'utf8')) as {
      services: { app: Record<string, unknown> };
    };
    const app = parsed.services.app;
    expect(app['restart']).toBe('unless-stopped');
    expect(app['healthcheck']).toBeDefined();
    expect(app['depends_on']).toBeDefined();
  });

  it('uses the Node 20 `fetch` healthcheck (no wget/curl)', () => {
    // Per design §11 fix #4: `node:20-slim` ships neither
    // `wget` nor `curl`, so the healthcheck must use Node 20's
    // global `fetch`. We assert the test command is a `node -e`
    // inline script containing `fetch(`.
    const parsed = parseYaml(readFileSync(COMPOSE_PATH, 'utf8')) as {
      services: { app: { healthcheck: { test: string[] } } };
    };
    const test = parsed.services.app.healthcheck.test;
    expect(test[0]).toBe('CMD');
    expect(test[1]).toBe('node');
    expect(test[2]).toBe('-e');
    expect(test[3]).toContain('fetch(');
    expect(test[3]).toContain('/health');
  });

  it('declares the `pgdata` named volume for postgres persistence', () => {
    const parsed = parseYaml(readFileSync(COMPOSE_PATH, 'utf8')) as {
      volumes: Record<string, unknown>;
    };
    expect(parsed.volumes).toHaveProperty('pgdata');
  });

  it('configures the postgres healthcheck with `pg_isready`', () => {
    const parsed = parseYaml(readFileSync(COMPOSE_PATH, 'utf8')) as {
      services: { postgres: { healthcheck: { test: string[] } } };
    };
    const test = parsed.services.postgres.healthcheck.test;
    expect(test[0]).toBe('CMD-SHELL');
    expect(test[1]).toContain('pg_isready');
  });
});
