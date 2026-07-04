/**
 * `LinkRepository` — domain-side interface for link persistence.
 *
 * The application layer (Phase 4) depends ONLY on this interface; the
 * concrete Drizzle implementation lives in Phase 5
 * (`infrastructure/drizzle-link.repository.ts`). The mock
 * implementations used by the contract test live in
 * `domain/__tests__/contracts.test.ts`.
 *
 * Spec references:
 *  - `openspec/specs/links/spec.md` requirements #1, #2, #3, #4
 *  - `openspec/changes/add-shortpulse-app/design.md` §3 (ports & adapters)
 */
import type { Link } from '../entities/link.js';

/** Query parameters for the paginated list endpoint. */
export interface ListLinksQuery {
  /** 1-indexed page number. */
  readonly page: number;
  /** Items per page (1-100). */
  readonly pageSize: number;
  /** Optional substring search over original_url and slug. */
  readonly search?: string;
  /** Sort field — defaults to 'created_at'. */
  readonly sortBy?: 'created_at' | 'original_url' | 'slug' | 'click_count';
  /** Sort direction — defaults to 'desc'. */
  readonly sortDir?: 'asc' | 'desc';
}

/**
 * Domain-side contract for link persistence.
 *
 * Implementations MUST:
 *  - Exclude soft-deleted links from `findBySlug` and `list` results
 *    (the `deleted_at IS NULL` filter is part of the contract).
 *  - Lowercase the slug before insert (the case-insensitive unique
 *    index relies on canonical storage; per design §4).
 *  - Make `softDelete` idempotent — calling it twice on the same id
 *    MUST NOT throw.
 *  - Make `save` return the persisted entity (with whatever the
 *    implementation fills in, e.g. the DB-generated `id` and
 *    `createdAt`). The Phase 4 use-case composes the `Link` from
 *    what the repo returns.
 */
export interface LinkRepository {
  /** Find by primary key. Returns null if not found OR soft-deleted. */
  findById(id: string): Promise<Link | null>;
  /** Find by slug (case-insensitive — implementation lowercases). Returns null if not found OR soft-deleted. */
  findBySlug(slug: string): Promise<Link | null>;
  /** Persist a new link. Returns the persisted entity. */
  save(link: Link): Promise<Link>;
  /** Idempotent — sets `deleted_at` if not already set. */
  softDelete(id: string): Promise<void>;
  /** Paginated list, excluding soft-deleted. */
  list(query: ListLinksQuery): Promise<{ data: Link[]; total: number }>;
  /** Total analytics events for a single link (LEFT JOIN aggregate). */
  countClicksByLink(linkId: string): Promise<number>;
}
