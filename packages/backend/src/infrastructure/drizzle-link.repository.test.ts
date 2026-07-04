/**
 * Unit tests for `DrizzleLinkRepository`.
 *
 * Mocks the Drizzle client with a fluent-builder Proxy so the tests
 * run without a live Postgres (no Docker). The integration tests
 * under `tests/integration/drizzle-link.repository.test.ts` exercise
 * the same surface against a real testcontainers Postgres.
 *
 * The mock records every fluent call (method + args) in a call log
 * and yields a canned result on `await`. Each test pre-arms the
 * first/second result so the repository sees a deterministic value
 * when it `await`s the query.
 *
 * TDD note (Strict TDD active): these tests were written first. The
 * repository implementation in `drizzle-link.repository.ts` was
 * written to make them pass.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createLink } from '../domain/entities/link.js';
import { SlugCollisionError } from '../domain/errors.js';
import { DrizzleLinkRepository } from './drizzle-link.repository.js';

import type { ShortPulseDb } from '../db/client.js';

// ---------------------------------------------------------------------------
// Drizzle query-builder fakes
// ---------------------------------------------------------------------------

interface CallLog {
  /** Method name → args recorded (in invocation order). */
  methods: string[];
}

/**
 * Recursively stringify an arbitrary value into a short, log-friendly
 * representation. Handles the Drizzle object types we encounter
 * (`PgTable`, `PgColumn`, `SQL`).
 *
 *  - `PgTable` is detected via the `Symbol(drizzle:BaseName)` symbol
 *    and rendered as `<table links>`.
 *  - `PgColumn` is detected via the `name` + `columnType` pair and
 *    rendered as `<col slug>`.
 *  - `SQL` is detected via the `queryChunks` array and rendered as
 *    `<sql ...chunks...>`.
 *  - Plain objects are rendered as a shallow `{key: value}` summary
 *    to avoid the circular refs in Drizzle table objects.
 */
function stringify(v: unknown): string {
  if (v === null || v === undefined) return String(v);
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v instanceof Date) return `Date(${v.toISOString()})`;
  if (Array.isArray(v)) return `[${v.map(stringify).join(', ')}]`;
  if (typeof v === 'function') return `[fn ${(v as { name?: string }).name ?? 'anon'}]`;
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    // Drizzle PgTable: identified by the BaseName symbol.
    const symbols = Object.getOwnPropertySymbols(o);
    const baseNameSym = symbols.find((s) => s.toString() === 'Symbol(drizzle:BaseName)');
    if (baseNameSym) {
      return `<table ${String(o[baseNameSym])}>`;
    }
    // Drizzle PgColumn: a `name` (string) + a `columnType` marker.
    if (typeof o['name'] === 'string' && 'columnType' in o) {
      return `<col ${o['name']}>`;
    }
    // Drizzle SQL: an array of `queryChunks`.
    if (Array.isArray(o['queryChunks'])) {
      const chunks = (o['queryChunks'] as unknown[]).map(stringify);
      return `<sql ${chunks.join(' ')}>`;
    }
    // Generic object: shallow key:value summary, capped at 4 keys
    // to keep the log readable and avoid circular ref errors.
    try {
      const keys = Object.keys(o).slice(0, 4);
      const parts = keys.map((k) => `${k}:${stringify(o[k])}`);
      return `<obj {${parts.join(', ')}}>`;
    } catch {
      return `<obj ${(o.constructor as { name?: string } | undefined)?.name ?? 'anon'}>`;
    }
  }
  return String(v);
}

function makeDb(
  opts: {
    /** Result for the FIRST `await`-resolved query. */
    firstResult?: unknown;
    /** Result for the SECOND `await`-resolved query (for the list path's data + total). */
    secondResult?: unknown;
    /** Result for any additional awaits. Defaults to `[]`. */
    defaultResult?: unknown;
  } = {},
): { db: ShortPulseDb; log: CallLog } {
  const log: CallLog = { methods: [] };
  const queue: unknown[] = [];
  if (opts.firstResult !== undefined) queue.push(opts.firstResult);
  if (opts.secondResult !== undefined) queue.push(opts.secondResult);

  function nextResult() {
    if (queue.length > 0) return queue.shift()!;
    return opts.defaultResult ?? [];
  }

  const builder: Record<string, unknown> = {
    then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => {
      try {
        resolve(nextResult());
      } catch (e) {
        if (reject) reject(e);
        else throw e;
      }
    },
  };

  // Every fluent method logs + returns the same builder so the
  // chain keeps building until `await`.
  const fluentMethods = [
    'select',
    'insert',
    'update',
    'delete',
    'from',
    'where',
    'limit',
    'offset',
    'orderBy',
    'values',
    'set',
    'returning',
    'innerJoin',
    'leftJoin',
    'rightJoin',
  ];
  for (const m of fluentMethods) {
    builder[m] = (...args: unknown[]) => {
      log.methods.push(`${m}(${args.map(stringify).join(', ')})`);
      return builder;
    };
  }

  const db = {
    select: (...args: unknown[]) => {
      log.methods.push(`select(${args.map(stringify).join(', ')})`);
      return builder;
    },
    insert: (...args: unknown[]) => {
      log.methods.push(`insert(${args.map(stringify).join(', ')})`);
      return builder;
    },
    update: (...args: unknown[]) => {
      log.methods.push(`update(${args.map(stringify).join(', ')})`);
      return builder;
    },
    delete: (...args: unknown[]) => {
      log.methods.push(`delete(${args.map(stringify).join(', ')})`);
      return builder;
    },
  } as unknown as ShortPulseDb;

  return { db, log };
}

/** Build a Drizzle-shaped link row for return values. The default slug
 *  has length 3 (the minimum allowed by the domain validation). */
function makeLinkRow(
  overrides: Partial<{
    id: string;
    originalUrl: string;
    slug: string;
    createdAt: Date;
    deletedAt: Date | null;
  }> = {},
) {
  return {
    id: overrides.id ?? '11111111-1111-4111-8111-111111111111',
    originalUrl: overrides.originalUrl ?? 'https://example.com',
    slug: overrides.slug ?? 'my-link',
    createdAt: overrides.createdAt ?? new Date('2026-01-01T00:00:00.000Z'),
    deletedAt: overrides.deletedAt ?? null,
  };
}

const FIXED_UUID = '11111111-1111-4111-8111-111111111111';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DrizzleLinkRepository — findById', () => {
  it('returns the link when the row exists and is not soft-deleted', async () => {
    const fake = makeDb({ firstResult: [makeLinkRow()] });
    const repo = new DrizzleLinkRepository(fake.db);
    const link = await repo.findById(FIXED_UUID);
    expect(link).not.toBeNull();
    expect(link!.id).toBe(FIXED_UUID);
    expect(link!.slug).toBe('my-link');
  });

  it('returns null when the row does not exist', async () => {
    const fake = makeDb({ firstResult: [] });
    const repo = new DrizzleLinkRepository(fake.db);
    const link = await repo.findById('99999999-9999-4999-8999-999999999999');
    expect(link).toBeNull();
  });

  it('queries the `links` table via a select ... from chain', async () => {
    const fake = makeDb({ firstResult: [makeLinkRow()] });
    const repo = new DrizzleLinkRepository(fake.db);
    await repo.findById(FIXED_UUID);
    expect(fake.log.methods[0]).toMatch(/^select\(/);
    expect(fake.log.methods).toContain('from(<table links>)');
    // The WHERE clause references the id and the deleted_at column.
    const whereCall = fake.log.methods.find((m) => m.startsWith('where('));
    expect(whereCall).toBeDefined();
    expect(whereCall).toContain('<col id>');
    expect(whereCall).toContain('<col deleted_at>');
  });
});

describe('DrizzleLinkRepository — findBySlug', () => {
  it('returns the link when the active row exists', async () => {
    const fake = makeDb({ firstResult: [makeLinkRow({ slug: 'hello' })] });
    const repo = new DrizzleLinkRepository(fake.db);
    const link = await repo.findBySlug('hello');
    expect(link).not.toBeNull();
    expect(link!.slug).toBe('hello');
  });

  it('lowercases the slug before the query (case-insensitive storage)', async () => {
    const fake = makeDb({ firstResult: [makeLinkRow({ slug: 'hello' })] });
    const repo = new DrizzleLinkRepository(fake.db);
    await repo.findBySlug('Hello');
    // The WHERE clause must reference the lowercased slug.
    const whereCall = fake.log.methods.find((m) => m.startsWith('where('));
    expect(whereCall).toBeDefined();
    expect(whereCall).toContain('"hello"');
    expect(whereCall).toContain('<col slug>');
  });

  it('returns null when no row matches', async () => {
    const fake = makeDb({ firstResult: [] });
    const repo = new DrizzleLinkRepository(fake.db);
    expect(await repo.findBySlug('missing')).toBeNull();
  });
});

describe('DrizzleLinkRepository — save', () => {
  it('persists a new link and returns the saved entity', async () => {
    const fake = makeDb({ firstResult: [makeLinkRow({ slug: 'new-link' })] });
    const repo = new DrizzleLinkRepository(fake.db);
    const link = createLink({
      id: FIXED_UUID,
      originalUrl: 'https://example.com',
      slug: 'new-link',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    const saved = await repo.save(link);
    expect(saved.id).toBe(link.id);
    expect(saved.slug).toBe('new-link');
    // The Drizzle insert path was hit.
    expect(fake.log.methods).toContain('insert(<table links>)');
    expect(fake.log.methods).toContain('returning()');
    // The values call carries the link's fields as a plain object
    // (Drizzle's `insert().values()` accepts a record, not a column
    // tuple — the column reference is implicit in the table binding).
    const valuesCall = fake.log.methods.find((m) => m.startsWith('values('));
    expect(valuesCall).toBeDefined();
    expect(valuesCall).toContain('originalUrl:');
    expect(valuesCall).toContain('slug:');
  });

  it('throws SlugCollisionError on PG unique-violation (code 23505)', async () => {
    // First insert raises a PG unique violation. We model this with
    // a builder that throws on await.
    const db = {
      insert: () => {
        const builder: Record<string, unknown> = {};
        const fns = ['values', 'returning', 'onConflictDoNothing', 'onConflictDoUpdate'];
        for (const m of fns) {
          builder[m] = () => builder;
        }
        builder['then'] = (_resolve: unknown, reject: (e: unknown) => void) => {
          const err = Object.assign(new Error('duplicate key value violates unique constraint'), {
            code: '23505',
          });
          reject(err);
        };
        return builder;
      },
    } as unknown as ShortPulseDb;

    const repo = new DrizzleLinkRepository(db);
    const link = createLink({
      id: FIXED_UUID,
      originalUrl: 'https://example.com',
      slug: 'taken',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    await expect(repo.save(link)).rejects.toBeInstanceOf(SlugCollisionError);
  });

  it('rethrows non-collision errors (does not swallow DB errors)', async () => {
    const db = {
      insert: () => {
        const builder: Record<string, unknown> = {};
        for (const m of ['values', 'returning']) {
          builder[m] = () => builder;
        }
        builder['then'] = (_resolve: unknown, reject: (e: unknown) => void) => {
          reject(new Error('connection refused'));
        };
        return builder;
      },
    } as unknown as ShortPulseDb;
    const repo = new DrizzleLinkRepository(db);
    const link = createLink({
      id: FIXED_UUID,
      originalUrl: 'https://example.com',
      slug: 'any',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    await expect(repo.save(link)).rejects.toThrow(/connection refused/);
  });
});

describe('DrizzleLinkRepository — softDelete', () => {
  it('issues an UPDATE that sets deletedAt', async () => {
    const fake = makeDb();
    const repo = new DrizzleLinkRepository(fake.db);
    await repo.softDelete(FIXED_UUID);
    expect(fake.log.methods).toContain('update(<table links>)');
    const setCall = fake.log.methods.find((m) => m.startsWith('set('));
    expect(setCall).toBeDefined();
    // The set() call carries `{deletedAt: <Date>}` — we verify the
    // key is present and the value is a Date (not a raw column).
    expect(setCall).toContain('deletedAt:');
    expect(setCall).toContain('Date(');
    expect(fake.log.methods.find((m) => m.startsWith('where('))).toBeDefined();
  });

  it('is idempotent: two softDelete calls on the same id are both safe (no throw)', async () => {
    const fake = makeDb();
    const repo = new DrizzleLinkRepository(fake.db);
    await repo.softDelete(FIXED_UUID);
    await repo.softDelete(FIXED_UUID);
    // The repository should not have thrown — the WHERE deleted_at
    // IS NULL guard makes the second call a no-op. We verify the
    // method was called twice and the WHERE clause includes the
    // `deleted_at IS NULL` guard.
    const updateCalls = fake.log.methods.filter((m) => m === 'update(<table links>)');
    expect(updateCalls).toHaveLength(2);
    const whereCalls = fake.log.methods.filter((m) => m.startsWith('where('));
    expect(whereCalls).toHaveLength(2);
    for (const w of whereCalls) {
      expect(w).toContain('<col deleted_at>');
    }
  });
});

describe('DrizzleLinkRepository — list', () => {
  it('returns the paginated data and total', async () => {
    const data = [
      makeLinkRow({ id: '11111111-1111-4111-8111-aaaaaaaaaaaa', slug: 'aaa' }),
      makeLinkRow({ id: '11111111-1111-4111-8111-bbbbbbbbbbbb', slug: 'bbb' }),
    ];
    const fake = makeDb({ firstResult: data, secondResult: [{ count: 2 }] });
    const repo = new DrizzleLinkRepository(fake.db);
    const result = await repo.list({ page: 1, pageSize: 20 });
    expect(result.data).toHaveLength(2);
    expect(result.total).toBe(2);
  });

  it('excludes soft-deleted links (always applies `deleted_at IS NULL`)', async () => {
    const fake = makeDb({ firstResult: [], secondResult: [{ count: 0 }] });
    const repo = new DrizzleLinkRepository(fake.db);
    await repo.list({ page: 1, pageSize: 20 });
    const whereCall = fake.log.methods.find((m) => m.startsWith('where('));
    expect(whereCall).toBeDefined();
    // The WHERE clause references the deleted_at column.
    expect(whereCall).toContain('<col deleted_at>');
  });

  it('applies a search filter against original_url OR slug (ILIKE)', async () => {
    const fake = makeDb({ firstResult: [], secondResult: [{ count: 0 }] });
    const repo = new DrizzleLinkRepository(fake.db);
    await repo.list({ page: 1, pageSize: 20, search: 'foo' });
    // The WHERE call must include the ilike pattern wrapped as %foo%
    // and reference both `original_url` and `slug` columns.
    const whereCall = fake.log.methods.find((m) => m.startsWith('where(')) ?? '';
    expect(whereCall).toContain('%foo%');
    expect(whereCall).toContain('<col original_url>');
    expect(whereCall).toContain('<col slug>');
  });

  it('does NOT include a search filter when `search` is omitted', async () => {
    const fake = makeDb({ firstResult: [], secondResult: [{ count: 0 }] });
    const repo = new DrizzleLinkRepository(fake.db);
    await repo.list({ page: 1, pageSize: 20 });
    const whereCall = fake.log.methods.find((m) => m.startsWith('where(')) ?? '';
    // No ILIKE pattern in the WHERE when search is omitted.
    expect(whereCall).not.toContain('%');
  });

  it('applies limit + offset derived from page and pageSize', async () => {
    const fake = makeDb({ firstResult: [], secondResult: [{ count: 0 }] });
    const repo = new DrizzleLinkRepository(fake.db);
    await repo.list({ page: 3, pageSize: 5 });
    expect(fake.log.methods).toContain('limit(5)');
    // Page 3 × 5 = offset 10.
    expect(fake.log.methods).toContain('offset(10)');
  });

  it('honours sortBy + sortDir (whitelisted columns only)', async () => {
    const fake = makeDb({ firstResult: [], secondResult: [{ count: 0 }] });
    const repo = new DrizzleLinkRepository(fake.db);
    await repo.list({
      page: 1,
      pageSize: 20,
      sortBy: 'original_url',
      sortDir: 'asc',
    });
    const orderCall = fake.log.methods.find((m) => m.startsWith('orderBy(')) ?? '';
    expect(orderCall).toContain('<col original_url>');
  });

  it('falls back to created_at for the unsupported click_count sort (no SQL error)', async () => {
    // The Drizzle impl chooses to fall back to created_at when
    // `sortBy === 'click_count'` rather than throwing — the pure
    // data path has no click_count aggregate. The test pins this
    // fallback so a refactor that adds the aggregate sees a clear
    // place to upgrade the orderBy clause.
    const fake = makeDb({ firstResult: [], secondResult: [{ count: 0 }] });
    const repo = new DrizzleLinkRepository(fake.db);
    await repo.list({
      page: 1,
      pageSize: 20,
      sortBy: 'click_count',
      sortDir: 'desc',
    });
    const orderCall = fake.log.methods.find((m) => m.startsWith('orderBy(')) ?? '';
    expect(orderCall).toContain('<col created_at>');
  });
});

describe('DrizzleLinkRepository — countClicksByLink', () => {
  it('returns the count of analytics rows for the given link', async () => {
    const fake = makeDb({ firstResult: [{ count: 42 }] });
    const repo = new DrizzleLinkRepository(fake.db);
    const count = await repo.countClicksByLink(FIXED_UUID);
    expect(count).toBe(42);
    // The select call shapes the count aggregate.
    const selectCall = fake.log.methods.find((m) => m.startsWith('select(')) ?? '';
    expect(selectCall).toContain('count:');
    expect(fake.log.methods).toContain('from(<table analytics>)');
  });

  it('returns 0 when there are no analytics for the link', async () => {
    const fake = makeDb({ firstResult: [{ count: 0 }] });
    const repo = new DrizzleLinkRepository(fake.db);
    expect(await repo.countClicksByLink(FIXED_UUID)).toBe(0);
  });
});

describe('DrizzleLinkRepository — interface conformance', () => {
  it('satisfies the `LinkRepository` interface (compile-time)', () => {
    // The variable is typed as the interface, so any missing or
    // wrongly-typed method on `DrizzleLinkRepository` would fail to
    // compile. No runtime assertion needed beyond a `typeof` smoke
    // check so a future refactor that strips a method fails this
    // test (not just the typecheck).
    const repo: import('../domain/repositories/link-repository.js').LinkRepository =
      new DrizzleLinkRepository({} as ShortPulseDb);
    expect(typeof repo.findById).toBe('function');
    expect(typeof repo.findBySlug).toBe('function');
    expect(typeof repo.save).toBe('function');
    expect(typeof repo.softDelete).toBe('function');
    expect(typeof repo.list).toBe('function');
    expect(typeof repo.countClicksByLink).toBe('function');
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
