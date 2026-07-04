/**
 * `GetTimeseriesUseCase` (Phase 4 application layer).
 *
 * Returns bucketed click counts for the requested granularity and
 * date range. When `dateFrom` / `dateTo` are omitted, the use-case
 * applies the 30-day default (spec analytics #4: "When omitted, the
 * range MUST default to the last 30 days"). Granularity semantics
 * (day → 00:00 UTC buckets, week → Monday 00:00 UTC, month → 1st
 * 00:00 UTC) live in the repository — the Drizzle Phase 5 impl uses
 * Postgres `date_trunc` with `AT TIME ZONE 'UTC'`.
 *
 * The "now" reference is read via `new Date()` once at the start of
 * `execute`, so a single call is internally consistent (no clock
 * drift between the two defaults). Tests use `vi.setSystemTime` to
 * pin `now` and make the 30-day window deterministic.
 *
 * Spec references:
 *  - `openspec/specs/analytics/spec.md` requirement #4 (timeseries)
 *  - `openspec/changes/add-shortpulse-app/design.md` §5 + §6
 */
import type {
  AnalyticsRepository,
  TimeseriesBucket,
} from '../domain/repositories/analytics-repository.js';

/** Spec-locked default range when `date_from` / `date_to` are omitted
 *  (spec analytics #4: "the last 30 days"). */
export const DEFAULT_TIMESERIES_WINDOW_DAYS = 30;

/** Supported bucket granularities (mirrors `@shortpulse/shared` constants). */
export type TimeseriesGranularity = 'day' | 'week' | 'month';

/** Use-case input. `dateFrom` / `dateTo` are optional — when omitted
 *  the use-case applies the 30-day default. */
export interface GetTimeseriesInput {
  granularity: TimeseriesGranularity;
  dateFrom?: Date;
  dateTo?: Date;
}

/** Use-case output — `{data: TimeseriesBucket[]}` per spec analytics #4
 *  and design §5. */
export interface GetTimeseriesOutput {
  data: TimeseriesBucket[];
}

/** Dependency bag — injected by `container.ts` (Phase 6). */
export interface GetTimeseriesDeps {
  analyticsRepository: AnalyticsRepository;
}

export class GetTimeseriesUseCase {
  constructor(private readonly deps: GetTimeseriesDeps) {}

  async execute(input: GetTimeseriesInput): Promise<GetTimeseriesOutput> {
    // Read `now` once so the default from/to are internally consistent
    // (no clock drift between the two defaults within one execute call).
    const now = new Date();

    // 30 days = 30 × 24 × 60 × 60 × 1000 ms. The spec says "the last
    // 30 days" (rolling window, not a calendar month) so the ms math
    // is the literal spec requirement.
    const defaultFrom = new Date(
      now.getTime() - DEFAULT_TIMESERIES_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );

    const dateRange = {
      from: input.dateFrom ?? defaultFrom,
      to: input.dateTo ?? now,
    };

    const buckets = await this.deps.analyticsRepository.getTimeseries(input.granularity, dateRange);

    return { data: buckets };
  }
}
