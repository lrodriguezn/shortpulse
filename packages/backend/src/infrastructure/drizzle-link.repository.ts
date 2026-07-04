/**
 * `DrizzleLinkRepository` — Drizzle/Postgres implementation of `LinkRepository`.
 *
 * Implements the `LinkRepository` contract from
 * `domain/repositories/link-repository.ts` using the Drizzle schema in
 * `db/schema.ts` and the postgres.js connection in `db/client.ts`.
 *
 * Contract mapping (per `LinkRepository` docstring):
 *  - `findBySlug` and `findById` MUST exclude soft-deleted links
 *    (`deleted_at IS NULL`). The `WHERE deleted_at IS NULL` clause is
 *    part of the contract, not a presentation decision.
 *  - `save` lowercases the slug before insert (case-insensitive unique
 *    index relies on canonical storage; design §4).
 *  - `softDelete` is idempotent — `WHERE deleted_at IS NULL` makes
 *    the UPDATE a no-op for an already-deleted row.
 *  - `list` paginates + sorts + filters by `search`; it does NOT
 *    enrich with `click_count` (the use-case calls
 *    `countClicksByLink` per row, the N+1 is documented in
 *    `application/list-links.use-case.ts`; future optimisation folds
 *    the click_count into a single LEFT JOIN + GROUP BY).
 *  - `countClicksByLink` issues one `COUNT(*)` against `analytics`.
 *
 * Spec references:
 *  - `openspec/specs/links/spec.md` requirements #1-#4
 *  - `openspec/changes/add-shortpulse-app/design.md` §3 (infra layer)
 *    + §4 (DB schema) + ADR-004 (soft-delete + retention)
 */
import { and, asc, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';

import { createLink, type Link } from '../domain/entities/link.js';
import type { LinkRepository, ListLinksQuery } from '../domain/repositories/link-repository.js';
import { SlugCollisionError } from '../domain/errors.js';
import { analytics, links } from '../db/schema.js';
import type { ShortPulseDb } from '../db/client.js';

/** Drizzle's PG-specific unique-violation error code. */
const PG_UNIQUE_VIOLATION = '23505';

export class DrizzleLinkRepository implements LinkRepository {
  constructor(private readonly db: ShortPulseDb) {}

  async findById(id: string): Promise<Link | null> {
    const rows = await this.db
      .select()
      .from(links)
      .where(and(eq(links.id, id), isNull(links.deletedAt)))
      .limit(1);
    const row = rows[0];
    return row ? rowToLink(row) : null;
  }

  async findBySlug(slug: string): Promise<Link | null> {
    const rows = await this.db
      .select()
      .from(links)
      .where(and(eq(links.slug, slug.toLowerCase()), isNull(links.deletedAt)))
      .limit(1);
    const row = rows[0];
    return row ? rowToLink(row) : null;
  }

  async save(link: Link): Promise<Link> {
    // The Link entity already lowercases the slug (createLink does it
    // in the factory), but we re-normalise here as a defensive
    // guarantee that the stored slug is canonical.
    const canonicalSlug = link.slug.toLowerCase().trim();
    try {
      const rows = await this.db
        .insert(links)
        .values({
          id: link.id,
          originalUrl: link.originalUrl,
          slug: canonicalSlug,
          createdAt: link.createdAt,
        })
        .returning();
      const row = rows[0];
      if (!row) {
        throw new Error('DrizzleLinkRepository.save: insert returned no rows');
      }
      return rowToLink(row);
    } catch (err) {
      // Drizzle wraps PG errors in objects with a `.code` field (or
      // a nested `cause.code`). We branch on PG error 23505
      // (unique_violation) and re-throw as a domain error so the
      // application layer can map it to 409.
      const code = extractPgErrorCode(err);
      if (code === PG_UNIQUE_VIOLATION) {
        throw new SlugCollisionError(canonicalSlug);
      }
      throw err;
    }
  }

  async softDelete(id: string): Promise<void> {
    // Idempotent: the WHERE deleted_at IS NULL guard makes a
    // re-delete a no-op (matches the contract in link-repository.ts).
    await this.db
      .update(links)
      .set({ deletedAt: new Date() })
      .where(and(eq(links.id, id), isNull(links.deletedAt)));
  }

  async list(query: ListLinksQuery): Promise<{ data: Link[]; total: number }> {
    // Build the WHERE clause shared between the data and the count
    // queries so the two are always consistent.
    const where = buildListWhere(query);

    // ORDER BY — use a safe whitelist to avoid SQL injection through
    // the sortBy / sortDir params.
    const orderBy = buildOrderBy(query.sortBy ?? 'created_at', query.sortDir ?? 'desc');

    const offset = (query.page - 1) * query.pageSize;

    const dataRows = await this.db
      .select()
      .from(links)
      .where(where)
      .orderBy(...orderBy)
      .limit(query.pageSize)
      .offset(offset);

    const totalRows = await this.db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(links)
      .where(where);

    const total = totalRows[0]?.count ?? 0;

    return {
      data: dataRows.map(rowToLink),
      total,
    };
  }

  async countClicksByLink(linkId: string): Promise<number> {
    const rows = await this.db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(analytics)
      .where(eq(analytics.linkId, linkId));
    return rows[0]?.count ?? 0;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Drizzle row shape (as selected by `db.select().from(links)`). */
interface LinkRow {
  id: string;
  originalUrl: string;
  slug: string;
  createdAt: Date;
  deletedAt: Date | null;
}

/** Convert a Drizzle row into the domain `Link` entity. */
function rowToLink(row: LinkRow): Link {
  return createLink({
    id: row.id,
    originalUrl: row.originalUrl,
    slug: row.slug,
    createdAt: row.createdAt,
  });
}

/**
 * Build the shared WHERE clause for the list endpoint.
 *
 *   - Always excludes soft-deleted rows.
 *   - When `search` is provided, matches an ILIKE against `original_url`
 *     OR `slug` (substring, case-insensitive — Postgres default).
 */
function buildListWhere(query: ListLinksQuery) {
  const conditions = [isNull(links.deletedAt)];
  if (query.search !== undefined && query.search.length > 0) {
    const pattern = `%${query.search}%`;
    conditions.push(or(ilike(links.originalUrl, pattern), ilike(links.slug, pattern))!);
  }
  return and(...conditions);
}

/** Whitelist-mapped ORDER BY clause. */
function buildOrderBy(
  sortBy: NonNullable<ListLinksQuery['sortBy']>,
  sortDir: NonNullable<ListLinksQuery['sortDir']>,
) {
  const dir = sortDir === 'asc' ? asc : desc;
  switch (sortBy) {
    case 'created_at':
      return [dir(links.createdAt)];
    case 'original_url':
      return [dir(links.originalUrl)];
    case 'slug':
      return [dir(links.slug)];
    case 'click_count':
      // The pure data path does not have a click_count aggregate; we
      // fall back to created_at so the SQL is well-formed. Callers
      // needing a true click_count sort should issue a custom query.
      return [dir(links.createdAt)];
  }
}

/**
 * Extract the Postgres error code from a Drizzle/Postgres.js error
 * chain. Both drivers attach the PG code as `err.code` (top level)
 * or `err.cause.code` (wrapped).
 */
function extractPgErrorCode(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const e = err as { code?: unknown; cause?: { code?: unknown } };
  if (typeof e.code === 'string') return e.code;
  if (e.cause && typeof e.cause.code === 'string') return e.cause.code;
  return undefined;
}
