/**
 * `ListAnalyticsUseCase` (Phase 4 application layer).
 *
 * Returns a paginated list of analytics events with a presentation
 * `linkLabel` per event. The `linkLabel` is the spec-locked rendering
 * for soft-deleted-link events (`"(deleted link)"`, obs #7) — the
 * use-case owns the literal so the spec contract is testable at the
 * application boundary without touching SQL.
 *
 * Flow (per design §5 + spec analytics #3 + #5):
 *   1. Forward the query (linkId / dateFrom / dateTo / country /
 *      page / pageSize) to `AnalyticsRepository.listWithLinkLabel`.
 *   2. For each returned row, map the raw `slug: string | null` to
 *      a presentation `linkLabel: string`:
 *      - `slug !== null` → `linkLabel = slug`
 *      - `slug === null` → `linkLabel = "(deleted link)"` (spec-locked)
 *   3. Return `{data, total, page, pageSize}` — same envelope as
 *      `ListLinksUseCase` per design §5.
 *
 * The Drizzle Phase 5 implementation performs a `LEFT JOIN` against
 * the `links` table so soft-deleted links produce `slug = NULL`. The
 * use-case is the only place that maps `NULL → "(deleted link)"` so
 * the rendering stays a single source of truth.
 *
 * Spec references:
 *  - `openspec/specs/analytics/spec.md` requirements #3, #5
 *  - `openspec/changes/add-shortpulse-app/design.md` §5 + ADR-004
 */
import type { AnalyticsEvent } from '../domain/entities/analytics-event.js';
import type {
  AnalyticsRepository,
  AnalyticsListQuery,
} from '../domain/repositories/analytics-repository.js';

/** Spec-locked rendering token for events whose link is soft-deleted. */
export const DELETED_LINK_LABEL = '(deleted link)' as const;

/** Use-case input. All filters optional except `page` + `pageSize`,
 *  which the API boundary coerces/defaults via Zod. */
export interface ListAnalyticsInput {
  page: number;
  pageSize: number;
  linkId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  country?: string;
}

/** One row in the use-case output. Extends `AnalyticsEvent` with a
 *  presentation `linkLabel` that the controller serialises. */
export interface AnalyticsEventWithLabel extends AnalyticsEvent {
  /** Spec-locked rendering: the live slug, or `"(deleted link)"`. */
  linkLabel: string;
}

/** Use-case output — matches the events endpoint response envelope
 *  (`{data, total, page, page_size}` per design §5). */
export interface ListAnalyticsOutput {
  data: AnalyticsEventWithLabel[];
  total: number;
  page: number;
  pageSize: number;
}

/** Dependency bag — injected by `container.ts` (Phase 6). */
export interface ListAnalyticsDeps {
  analyticsRepository: AnalyticsRepository;
}

export class ListAnalyticsUseCase {
  constructor(private readonly deps: ListAnalyticsDeps) {}

  async execute(input: ListAnalyticsInput): Promise<ListAnalyticsOutput> {
    // 1. Build the repo query — strip undefined optional fields so
    //    the repository's structural type matches the Drizzle WHERE
    //    clause (omitted vs `IS NULL` semantics differ in SQL).
    const query: AnalyticsListQuery = {
      page: input.page,
      pageSize: input.pageSize,
      ...(input.linkId !== undefined ? { linkId: input.linkId } : {}),
      ...(input.dateFrom !== undefined ? { dateFrom: input.dateFrom } : {}),
      ...(input.dateTo !== undefined ? { dateTo: input.dateTo } : {}),
      ...(input.country !== undefined ? { country: input.country } : {}),
    };

    // 2. Fetch the page joined with slug. The repo returns
    //    `(event, slug | null)` per row — the slug is the join
    //    projection; `null` means the link was soft-deleted.
    const { data, total } = await this.deps.analyticsRepository.listWithLinkLabel(query);

    // 3. Map slug → linkLabel. The literal lives here so the spec
    //    contract is testable at this seam.
    const enriched: AnalyticsEventWithLabel[] = data.map((row) => ({
      id: row.id,
      linkId: row.linkId,
      timestamp: row.timestamp,
      ip: row.ip,
      userAgent: row.userAgent,
      referer: row.referer,
      country: row.country,
      city: row.city,
      browser: row.browser,
      linkLabel: row.slug ?? DELETED_LINK_LABEL,
    }));

    return {
      data: enriched,
      total,
      page: input.page,
      pageSize: input.pageSize,
    };
  }
}
