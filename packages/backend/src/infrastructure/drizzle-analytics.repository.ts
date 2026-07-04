/**
 * `DrizzleAnalyticsRepository` — Drizzle/Postgres implementation of `AnalyticsRepository`.
 *
 * Implements the `AnalyticsRepository` contract from
 * `domain/repositories/analytics-repository.ts` using the Drizzle schema
 * in `db/schema.ts` and the postgres.js connection in `db/client.ts`.
 *
 * Contract mapping (per `AnalyticsRepository` docstring):
 *  - `save` inserts a single event row and returns the persisted entity.
 *  - `list` paginates the events with optional filters
 *    (linkId / dateFrom / dateTo / country) and returns the total count.
 *  - `listWithLinkLabel` performs a `LEFT JOIN` against the `links`
 *    table so soft-deleted links remain in the result with `slug = NULL`
 *    (spec analytics #3 + #5, design ADR-004). The use-case maps
 *    `null → "(deleted link)"`.
 *  - `getSummary` computes the 4 KPIs (totalLinks, totalClicks,
 *    clicksToday, clicksLast7Days) per spec analytics #2 and the
 *    retention invariant (totalClicks counts ALL events including
 *    soft-deleted-link events).
 *  - `getTimeseries` buckets events by `day`/`week`/`month` using
 *    `date_trunc(...) AT TIME ZONE 'UTC'` (spec analytics #4).
 *
 * Spec references:
 *  - `openspec/specs/analytics/spec.md` requirements #1-#4
 *  - `openspec/changes/add-shortpulse-app/design.md` §3 (infra layer)
 *    + §4 (DB schema) + ADR-004 (retention)
 */
import { and, asc, count, desc, eq, gte, isNull, lte, sql } from 'drizzle-orm';

import { createAnalyticsEvent, type AnalyticsEvent } from '../domain/entities/analytics-event.js';
import type {
  AnalyticsListQuery,
  AnalyticsRepository,
  AnalyticsSummary,
  TimeseriesBucket,
} from '../domain/repositories/analytics-repository.js';
import { analytics, links } from '../db/schema.js';
import type { ShortPulseDb } from '../db/client.js';

export class DrizzleAnalyticsRepository implements AnalyticsRepository {
  constructor(private readonly db: ShortPulseDb) {}

  async save(event: AnalyticsEvent): Promise<AnalyticsEvent> {
    const rows = await this.db
      .insert(analytics)
      .values({
        id: event.id,
        linkId: event.linkId,
        timestamp: event.timestamp,
        ip: event.ip,
        userAgent: event.userAgent,
        referer: event.referer,
        country: event.country,
        city: event.city,
        browser: event.browser,
      })
      .returning();
    const row = rows[0];
    if (!row) {
      throw new Error('DrizzleAnalyticsRepository.save: insert returned no rows');
    }
    return rowToEvent(row);
  }

  async list(query: AnalyticsListQuery): Promise<{ data: AnalyticsEvent[]; total: number }> {
    const where = buildListWhere(query);
    const offset = (query.page - 1) * query.pageSize;

    const dataRows = await this.db
      .select()
      .from(analytics)
      .where(where)
      .orderBy(desc(analytics.timestamp))
      .limit(query.pageSize)
      .offset(offset);

    const totalRows = await this.db.select({ count: count() }).from(analytics).where(where);

    const total = totalRows[0]?.count ?? 0;
    return {
      data: dataRows.map(rowToEvent),
      total,
    };
  }

  async listWithLinkLabel(
    query: AnalyticsListQuery,
  ): Promise<{ data: Array<AnalyticsEvent & { slug: string | null }>; total: number }> {
    const where = buildListWhere(query);
    const offset = (query.page - 1) * query.pageSize;

    // LEFT JOIN links on analytics.link_id = links.id. Soft-deleted
    // links remain in the result with `links.slug` and `links.deleted_at`
    // both populated — we project the slug as-is; the use-case maps
    // NULL → "(deleted link)". The join filter on `links.deleted_at
    // IS NULL` is intentionally OMITTED (LEFT JOIN, not INNER JOIN)
    // so the retention invariant holds: events for soft-deleted links
    // still appear in the events list.
    const dataRows = await this.db
      .select({
        id: analytics.id,
        linkId: analytics.linkId,
        timestamp: analytics.timestamp,
        ip: analytics.ip,
        userAgent: analytics.userAgent,
        referer: analytics.referer,
        country: analytics.country,
        city: analytics.city,
        browser: analytics.browser,
        slug: links.slug,
      })
      .from(analytics)
      .leftJoin(links, eq(analytics.linkId, links.id))
      .where(where)
      .orderBy(desc(analytics.timestamp))
      .limit(query.pageSize)
      .offset(offset);

    const totalRows = await this.db.select({ count: count() }).from(analytics).where(where);

    const total = totalRows[0]?.count ?? 0;
    return {
      data: dataRows.map((row) => ({
        ...rowToEvent(row),
        slug: row.slug ?? null,
      })),
      total,
    };
  }

  async getSummary(): Promise<AnalyticsSummary> {
    // We issue 4 small COUNT queries. At VPS scale (≤10⁴ events/day)
    // the 4 round-trips cost < 5 ms total, well under the
    // single-query alternative that would require a UNION ALL +
    // FILTER (Postgres-only) or a CTE. Keep it simple; the index
    // on analytics.timestamp covers the today/7d windows.

    // 1. totalLinks: COUNT(*) FROM links WHERE deleted_at IS NULL.
    const totalLinksRows = await this.db
      .select({ count: count() })
      .from(links)
      .where(isNull(links.deletedAt));
    const totalLinks = totalLinksRows[0]?.count ?? 0;

    // 2. totalClicks: COUNT(*) FROM analytics — ALL events, including
    // soft-deleted-link events (retention invariant, spec analytics #5).
    const totalClicksRows = await this.db.select({ count: count() }).from(analytics);
    const totalClicks = totalClicksRows[0]?.count ?? 0;

    // 3. clicksToday: COUNT(*) FROM analytics
    //    WHERE timestamp >= date_trunc('day', now() AT TIME ZONE 'UTC')
    //    The `AT TIME ZONE 'UTC'` makes the day boundary explicit
    //    (Postgres `date_trunc` truncates against the session timezone
    //    otherwise; we want UTC).
    const clicksTodayRows = await this.db
      .select({ count: count() })
      .from(analytics)
      .where(gte(analytics.timestamp, sql`date_trunc('day', now() AT TIME ZONE 'UTC')`));
    const clicksToday = clicksTodayRows[0]?.count ?? 0;

    // 4. clicksLast7Days: COUNT(*) FROM analytics
    //    WHERE timestamp >= now() - interval '7 days' (rolling 168h).
    const clicksLast7DaysRows = await this.db
      .select({ count: count() })
      .from(analytics)
      .where(gte(analytics.timestamp, sql`now() - interval '7 days'`));
    const clicksLast7Days = clicksLast7DaysRows[0]?.count ?? 0;

    return {
      totalLinks,
      totalClicks,
      clicksToday,
      clicksLast7Days,
    };
  }

  async getTimeseries(
    granularity: 'day' | 'week' | 'month',
    dateRange: { from: Date; to: Date },
  ): Promise<TimeseriesBucket[]> {
    // Bucket by the requested granularity in UTC. Postgres
    // `date_trunc('week', ...)` defaults to Monday (ISO 8601) — the
    // spec-locked Monday-anchored week semantics.
    const bucketExpr = sql<string>`date_trunc(${granularity}, ${analytics.timestamp} AT TIME ZONE 'UTC')`;

    const rows = await this.db
      .select({ bucket: bucketExpr, count: count() })
      .from(analytics)
      .where(and(gte(analytics.timestamp, dateRange.from), lte(analytics.timestamp, dateRange.to)))
      .groupBy(bucketExpr)
      .orderBy(asc(bucketExpr));

    return rows.map((r) => {
      // The `bucket` column is a `date_trunc(...)` result — Drizzle
      // surfaces it as a string in the postgres-js dialect (or a
      // Date in some drivers). The constructor accepts both, so we
      // route through `new Date(...)` unconditionally; if the
      // driver hands us a Date it converts via toISOString then
      // back, which is a few µs but well below the bucket cost.
      const bucketRaw = r.bucket as unknown;
      const bucketStart = bucketRaw instanceof Date ? bucketRaw : new Date(bucketRaw as string);
      return { bucketStart, count: Number(r.count) };
    });
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Drizzle analytics row shape (as selected by `db.select().from(analytics)`). */
interface AnalyticsRow {
  id: string;
  linkId: string;
  timestamp: Date;
  ip: string;
  userAgent: string | null;
  referer: string | null;
  country: string | null;
  city: string | null;
  browser: string | null;
}

/** Convert a Drizzle row into the domain `AnalyticsEvent` entity. */
function rowToEvent(row: AnalyticsRow): AnalyticsEvent {
  return createAnalyticsEvent({
    id: row.id,
    linkId: row.linkId,
    timestamp: row.timestamp,
    ip: row.ip,
    userAgent: row.userAgent,
    referer: row.referer,
    country: row.country,
    city: row.city,
    browser: row.browser,
  });
}

/**
 * Build the shared WHERE clause for the events list. All filters
 * are AND-ed; an omitted filter is simply absent (NOT `IS NULL` —
 * that's the whole reason we strip undefined keys before the call).
 */
function buildListWhere(query: AnalyticsListQuery) {
  const conditions = [];
  if (query.linkId !== undefined) {
    conditions.push(eq(analytics.linkId, query.linkId));
  }
  if (query.dateFrom !== undefined) {
    conditions.push(gte(analytics.timestamp, query.dateFrom));
  }
  if (query.dateTo !== undefined) {
    conditions.push(lte(analytics.timestamp, query.dateTo));
  }
  if (query.country !== undefined) {
    conditions.push(eq(analytics.country, query.country));
  }
  return conditions.length === 0 ? undefined : and(...conditions);
}
