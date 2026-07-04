/**
 * `ListLinksUseCase` (Phase 4 application layer).
 *
 * Returns the paginated list of active links (soft-deleted excluded
 * by the repository contract) with the per-link `clickCount` enriched
 * from `LinkRepository.countClicksByLink`.
 *
 * Spec references:
 *  - `openspec/specs/links/spec.md` requirement #2 (list)
 *  - `openspec/changes/add-shortpulse-app/design.md` §5 (API contract)
 *
 * NOTE on N+1: the use-case issues one `list` + N `countClicksByLink`
 * calls. At page sizes up to 100 this is a known N+1. The Phase 5
 * Drizzle implementation can optimise this to a single `LEFT JOIN`
 * with a `GROUP BY links.id` aggregate; the use-case seam stays the
 * same.
 */
import type { Link } from '../domain/entities/link.js';
import type { LinkRepository, ListLinksQuery } from '../domain/repositories/link-repository.js';

/** Use-case input. All fields are optional except `page` + `pageSize`
 *  which the API boundary coerces/defaults. */
export interface ListLinksInput {
  page: number;
  pageSize: number;
  search?: string;
  sortBy?: 'created_at' | 'original_url' | 'slug' | 'click_count';
  sortDir?: 'asc' | 'desc';
}

/** Single row in the use-case output. Mirrors the `linkResponseSchema`
 *  fields needed by the API; `shortUrl` is composed by the controller
 *  because the use-case has no `baseUrl` context. */
export interface ListLinksRow {
  id: string;
  originalUrl: string;
  slug: string;
  createdAt: Date;
  clickCount: number;
}

/** Use-case output — matches the list endpoint response envelope
 *  (`{data, total, page, page_size}` per design §5). */
export interface ListLinksOutput {
  data: ListLinksRow[];
  total: number;
  page: number;
  pageSize: number;
}

/** Dependency bag — injected by `container.ts` (Phase 6). */
export interface ListLinksDeps {
  linkRepository: LinkRepository;
}

export class ListLinksUseCase {
  constructor(private readonly deps: ListLinksDeps) {}

  async execute(input: ListLinksInput): Promise<ListLinksOutput> {
    const query: ListLinksQuery = {
      page: input.page,
      pageSize: input.pageSize,
      ...(input.search !== undefined ? { search: input.search } : {}),
      ...(input.sortBy !== undefined ? { sortBy: input.sortBy } : {}),
      ...(input.sortDir !== undefined ? { sortDir: input.sortDir } : {}),
    };

    const { data, total } = await this.deps.linkRepository.list(query);

    // Enrich with clickCount. Parallelise so the wall-clock cost is
    // a single DB round-trip (Promise.all is non-blocking from the
    // caller's perspective, even if the underlying DB driver still
    // issues N queries — see N+1 note above).
    const rows: ListLinksRow[] = await Promise.all(
      data.map(async (link: Link) => ({
        id: link.id,
        originalUrl: link.originalUrl,
        slug: link.slug,
        createdAt: link.createdAt,
        clickCount: await this.deps.linkRepository.countClicksByLink(link.id),
      })),
    );

    return {
      data: rows,
      total,
      page: input.page,
      pageSize: input.pageSize,
    };
  }
}
