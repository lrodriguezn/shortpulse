import { describe, it, expect } from 'vitest';

import { schema, links, analytics } from './schema.js';

/**
 * Schema definition tests (RED → GREEN → TRIANGULATE).
 *
 * The schema is the single source of truth for the DB tables; these tests
 * pin the contract derived from `openspec/changes/add-shortpulse-app/design.md`
 * §4 and the two specs (links, analytics). They are cheap, fast, and fail
 * loudly on typos in column names, nullability, or the column set.
 *
 * The generated SQL itself (including the unique index, the FK with
 * `ON DELETE RESTRICT`, and the exact CREATE TABLE body) is covered
 * separately by `migration.test.ts` — it reads `drizzle/0000_init.sql`
 * and asserts the actual SQL output.
 */
describe('db schema — links table', () => {
  it('is exported under `schema.links` and as a top-level `links` reference', () => {
    expect(schema.links).toBeDefined();
    expect(links).toBeDefined();
    expect(schema.links).toBe(links);
  });

  it('defines the expected column set on the `links` pgTable', () => {
    const colNames = Object.keys(links);
    for (const name of ['id', 'originalUrl', 'slug', 'createdAt', 'deletedAt']) {
      expect(colNames, `links.${name} must exist`).toContain(name);
    }
  });

  it('uses snake_case SQL column names (id, original_url, slug, created_at, deleted_at)', () => {
    expect(links.id.name).toBe('id');
    expect(links.originalUrl.name).toBe('original_url');
    expect(links.slug.name).toBe('slug');
    expect(links.createdAt.name).toBe('created_at');
    expect(links.deletedAt.name).toBe('deleted_at');
  });

  it('marks `id`, `originalUrl`, `slug`, `createdAt` NOT NULL and `deletedAt` nullable', () => {
    expect(links.id.notNull).toBe(true);
    expect(links.originalUrl.notNull).toBe(true);
    expect(links.slug.notNull).toBe(true);
    expect(links.createdAt.notNull).toBe(true);
    // Soft-delete flag: NULL = active, set = deleted.
    expect(links.deletedAt.notNull).toBe(false);
  });

  it('every column declares a Drizzle `columnType` (PgUUID / PgText / PgTimestamp)', () => {
    // The `columnType` is a getter on the column prototype, so we access
    // each column by name to trigger the getter. (Object.values() would
    // only return own enumerable properties and miss prototype getters.)
    // Drizzle also attaches an `enableRLS()` helper to the table object,
    // so we filter to plain object members.
    for (const name of Object.keys(links) as Array<keyof typeof links>) {
      const member = links[name];
      if (typeof member === 'function') continue;
      const col = member as unknown as { columnType?: string };
      expect(col.columnType, `links.${String(name)} must declare a Drizzle columnType`).toMatch(
        /^Pg/,
      );
    }
  });

  it('uses the expected Drizzle column types per column', () => {
    // Pins the column type to the design's intent. A regression that swaps
    // `uuid` for `text` or `timestamp` for `integer` will fail here.
    expect(links.id.columnType).toBe('PgUUID');
    expect(links.originalUrl.columnType).toBe('PgText');
    expect(links.slug.columnType).toBe('PgText');
    expect(links.createdAt.columnType).toBe('PgTimestamp');
    expect(links.deletedAt.columnType).toBe('PgTimestamp');
  });
});

describe('db schema — analytics table', () => {
  it('is exported under `schema.analytics` and as a top-level `analytics` reference', () => {
    expect(schema.analytics).toBeDefined();
    expect(analytics).toBeDefined();
    expect(schema.analytics).toBe(analytics);
  });

  it('defines the expected column set on the `analytics` pgTable', () => {
    const colNames = Object.keys(analytics);
    for (const name of [
      'id',
      'linkId',
      'timestamp',
      'ip',
      'userAgent',
      'referer',
      'country',
      'city',
      'browser',
    ]) {
      expect(colNames, `analytics.${name} must exist`).toContain(name);
    }
  });

  it('uses snake_case SQL column names (id, link_id, timestamp, ip, user_agent, referer, country, city, browser)', () => {
    expect(analytics.id.name).toBe('id');
    expect(analytics.linkId.name).toBe('link_id');
    expect(analytics.timestamp.name).toBe('timestamp');
    expect(analytics.ip.name).toBe('ip');
    expect(analytics.userAgent.name).toBe('user_agent');
    expect(analytics.referer.name).toBe('referer');
    expect(analytics.country.name).toBe('country');
    expect(analytics.city.name).toBe('city');
    expect(analytics.browser.name).toBe('browser');
  });

  it('marks `id`, `linkId`, `timestamp`, `ip` NOT NULL and the geo/UA fields nullable', () => {
    // Per spec analytics #1: ip MUST be stored; country/city/user_agent/referer/browser MAY be null.
    expect(analytics.id.notNull).toBe(true);
    expect(analytics.linkId.notNull).toBe(true);
    expect(analytics.timestamp.notNull).toBe(true);
    expect(analytics.ip.notNull).toBe(true);
    expect(analytics.userAgent.notNull).toBe(false);
    expect(analytics.referer.notNull).toBe(false);
    expect(analytics.country.notNull).toBe(false);
    expect(analytics.city.notNull).toBe(false);
    expect(analytics.browser.notNull).toBe(false);
  });

  it('uses the expected Drizzle column types per column', () => {
    expect(analytics.id.columnType).toBe('PgUUID');
    expect(analytics.linkId.columnType).toBe('PgUUID');
    expect(analytics.timestamp.columnType).toBe('PgTimestamp');
    expect(analytics.ip.columnType).toBe('PgText');
    expect(analytics.userAgent.columnType).toBe('PgText');
    expect(analytics.referer.columnType).toBe('PgText');
    expect(analytics.country.columnType).toBe('PgText');
    expect(analytics.city.columnType).toBe('PgText');
    expect(analytics.browser.columnType).toBe('PgText');
  });
});

describe('db schema — aggregate exports', () => {
  it('exposes a `schema` object containing every table exactly once', () => {
    // Drizzle's recommended pattern: group all tables in a single `schema`
    // object so the migrator can introspect the full DB in one place.
    const tableNames = Object.keys(schema).sort();
    expect(tableNames).toEqual(['analytics', 'links']);
  });
});
