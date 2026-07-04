import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { sql } from 'drizzle-orm';

import { createDb } from '../../src/db/client.js';
import { runMigrations } from '../../src/db/migrator.js';
import { links, analytics } from '../../src/db/schema.js';
import { isDockerAvailable } from '../../../../tests/integration/docker-availability.js';

/**
 * Integration tests for the DB layer (RED → GREEN).
 *
 * These tests spin up a real Postgres testcontainer, apply the generated
 * migration via our `runMigrations()`, and round-trip the schema:
 *  - `links` table accepts inserts, returns the row, and rejects
 *    duplicate slugs (UNIQUE index).
 *  - `analytics` table accepts inserts with a valid FK to `links`.
 *  - Hard delete of a link is BLOCKED by the FK `ON DELETE RESTRICT`
 *    (the design's soft-delete + retention invariant).
 *  - Soft delete (`deleted_at IS NOT NULL`) leaves analytics queryable
 *    (the spec's analytics-retention invariant).
 *
 * **When Docker is unavailable** the entire `describe` is skipped with
 * a single `it.skip` reason — see `docker-availability.ts`. The tests
 * always run in CI (which has Docker configured); local devs without
 * Docker see a clear skip message instead of a hang.
 *
 * **TDD note:** Strict TDD wants red-then-green. Here the "RED" is the
 * skipped state in a Docker-less environment; the assertions are
 * designed to fail loudly the moment Docker becomes available and the
 * test runs against a real Postgres. We do not write a "mock Postgres"
 * fallback because that would mask contract drift between the test
 * and the actual database.
 */

const dockerUp = isDockerAvailable();
const describeIntegration = dockerUp ? describe : describe.skip;

if (!dockerUp) {
  // Print once at file load so the skip is visible in CI logs even
  // when the test reporter collapses skipped tests.

  console.warn(
    '[integration] Docker not available — skipping testcontainers tests. ' +
      'They will run in CI where the Docker daemon is configured.',
  );
}

describeIntegration('db integration (testcontainers Postgres)', () => {
  let container: StartedPostgreSqlContainer;
  let db: ReturnType<typeof createDb>;

  beforeAll(async () => {
    // Spin up Postgres 16 (matches the design §1 stack) on an ephemeral
    // port. The container is torn down in `afterAll`.
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('shortpulse_test')
      .withUsername('test')
      .withPassword('test')
      .start();
    const connectionString = container.getConnectionUri();

    // Apply the generated migration. This is the same code path the
    // Docker entrypoint uses; if it fails, the whole `describe` fails
    // (good — we want the contract broken before any tests run).
    await runMigrations({ connectionString });

    // Build the Drizzle client for the assertions.
    db = createDb({ connectionString });
  }, 120_000);

  afterAll(async () => {
    if (container) {
      await container.stop();
    }
  });

  it('round-trips a link insert + select', async () => {
    const inserted = await db
      .insert(links)
      .values({
        originalUrl: 'https://example.com',
        slug: 'hello',
      })
      .returning();
    expect(inserted).toHaveLength(1);
    const row = inserted[0]!;
    expect(row.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(row.originalUrl).toBe('https://example.com');
    expect(row.slug).toBe('hello');
    expect(row.createdAt).toBeInstanceOf(Date);
    expect(row.deletedAt).toBeNull();

    // Re-select to confirm persistence.
    const found = await db
      .select()
      .from(links)
      .where(sql`${links.slug} = 'hello'`);
    expect(found).toHaveLength(1);
    expect(found[0]!.id).toBe(row.id);
  });

  it('rejects a duplicate slug via the unique index', async () => {
    await db.insert(links).values({
      originalUrl: 'https://example.com/a',
      slug: 'dupe',
    });
    // Second insert with the same slug MUST fail. Drizzle wraps the PG
    // unique-violation error code (23505) into a `uniqueViolation` (or
    // the generic error has a `code` property).
    let caught: unknown = null;
    try {
      await db.insert(links).values({
        originalUrl: 'https://example.com/b',
        slug: 'dupe',
      });
    } catch (err) {
      caught = err;
    }
    expect(caught, 'second insert with the same slug must throw').not.toBeNull();
  });

  it('round-trips an analytics insert with a valid FK to links', async () => {
    const link = (
      await db
        .insert(links)
        .values({ originalUrl: 'https://example.com/c', slug: 'fk-test' })
        .returning()
    )[0]!;

    const event = (
      await db
        .insert(analytics)
        .values({
          linkId: link.id,
          ip: '1.2.3.4',
          userAgent: 'Mozilla/5.0',
          referer: 'https://google.com',
          country: 'US',
          city: 'Mountain View',
          browser: 'Chrome',
        })
        .returning()
    )[0]!;

    expect(event.linkId).toBe(link.id);
    expect(event.ip).toBe('1.2.3.4');
    expect(event.timestamp).toBeInstanceOf(Date);

    // Joining analytics → links works (the FK is real, not a string).
    const joined = await db
      .select({ slug: links.slug, ip: analytics.ip })
      .from(analytics)
      .innerJoin(links, sql`${analytics.linkId} = ${links.id}`);
    expect(joined).toHaveLength(1);
    expect(joined[0]).toEqual({ slug: 'fk-test', ip: '1.2.3.4' });
  });

  it('rejects analytics insert when linkId references a non-existent link (FK enforcement)', async () => {
    const fakeUuid = '00000000-0000-0000-0000-000000000000';
    let caught: unknown = null;
    try {
      await db.insert(analytics).values({
        linkId: fakeUuid,
        ip: '1.2.3.4',
      });
    } catch (err) {
      caught = err;
    }
    expect(caught, 'FK violation must throw on insert').not.toBeNull();
  });

  it('blocks hard-delete of a link that has analytics (ON DELETE RESTRICT)', async () => {
    // Insert link + analytics, then try to DELETE the link. PG must
    // refuse because of the FK RESTRICT.
    const link = (
      await db
        .insert(links)
        .values({ originalUrl: 'https://example.com/d', slug: 'restrict' })
        .returning()
    )[0]!;
    await db.insert(analytics).values({ linkId: link.id, ip: '1.2.3.4' });

    let caught: unknown = null;
    try {
      await db.delete(links).where(sql`${links.id} = ${link.id}`);
    } catch (err) {
      caught = err;
    }
    expect(caught, 'hard delete must be blocked by FK RESTRICT').not.toBeNull();

    // The link is still there.
    const stillThere = await db
      .select()
      .from(links)
      .where(sql`${links.id} = ${link.id}`);
    expect(stillThere).toHaveLength(1);
    expect(stillThere[0]!.deletedAt).toBeNull();
  });

  it('soft-delete (deleted_at IS NOT NULL) leaves analytics queryable (retention invariant)', async () => {
    const link = (
      await db
        .insert(links)
        .values({ originalUrl: 'https://example.com/e', slug: 'soft' })
        .returning()
    )[0]!;
    await db.insert(analytics).values({ linkId: link.id, ip: '1.2.3.4' });

    // Soft delete.
    await db
      .update(links)
      .set({ deletedAt: new Date() })
      .where(sql`${links.id} = ${link.id}`);

    // The link row is still there, with deletedAt populated.
    const soft = await db
      .select()
      .from(links)
      .where(sql`${links.id} = ${link.id}`);
    expect(soft).toHaveLength(1);
    expect(soft[0]!.deletedAt).toBeInstanceOf(Date);

    // Analytics row is still queryable (retention invariant, spec
    // analytics #5).
    const events = await db
      .select()
      .from(analytics)
      .where(sql`${analytics.linkId} = ${link.id}`);
    expect(events).toHaveLength(1);
    expect(events[0]!.linkId).toBe(link.id);
  });
});
