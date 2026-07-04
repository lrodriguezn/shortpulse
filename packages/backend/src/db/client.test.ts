import { describe, it, expect } from 'vitest';
import { sql } from 'drizzle-orm';

import { createDb, db } from './client.js';
import { links } from './schema.js';

/**
 * DB client tests (RED → GREEN → TRIANGULATE).
 *
 * The client is the entry point for every repository and use-case; these
 * tests pin the contract:
 *  - `createDb({ connectionString })` returns a Drizzle instance backed by
 *    a postgres.js client. No global side effect: the instance must be
 *    independent of the singleton.
 *  - The returned instance exposes `execute(sql)` for raw SQL and
 *    `select().from(<table>)` for typed queries (the schema is wired in).
 *  - The `db` singleton is also a Drizzle instance.
 *
 * The migrator and the actual round-trip (insert + select) are covered
 * separately by `migrator.test.ts` and `integration.test.ts` (WU4).
 */
describe('db client — createDb', () => {
  it('returns a Drizzle instance that exposes `execute` for raw SQL', () => {
    const instance = createDb({
      connectionString: 'postgres://user:pass@localhost:5432/db',
    });
    expect(instance).toBeDefined();
    // `execute` is the canonical Drizzle entry point for raw SQL. The
    // query is never run — the test only asserts the builder exists.
    const builder = instance.execute(sql`select 1`);
    expect(builder).toBeDefined();
  });

  it('the returned instance lets you build a typed query against the `links` table', () => {
    // This is the real proof that the schema is wired in: we can build
    // a `db.select().from(links)` query without TypeScript errors or
    // runtime "table not found" exceptions. The query is never executed
    // (postgres.js is lazy) so the test is hermetic.
    const instance = createDb({
      connectionString: 'postgres://user:pass@localhost:5432/db',
    });
    const builder = instance.select().from(links);
    // The builder has the Drizzle QueryBuilder shape — a thenable that
    // resolves to the rows when awaited.
    expect(typeof builder.then).toBe('function');
  });

  it('each call to createDb returns an independent instance', () => {
    const a = createDb({ connectionString: 'postgres://a:b@localhost/db1' });
    const b = createDb({ connectionString: 'postgres://a:b@localhost/db2' });
    // Different connection strings → different underlying clients, but
    // more importantly the two wrappers must be distinct objects.
    expect(a).not.toBe(b);
  });
});

describe('db client — singleton `db`', () => {
  it('is exported as a Drizzle instance that exposes `execute`', () => {
    expect(db).toBeDefined();
    // Smoke: the singleton is a real Drizzle instance, not a stub.
    const builder = db.execute(sql`select 1`);
    expect(builder).toBeDefined();
  });
});
