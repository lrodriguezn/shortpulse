/**
 * `GetAnalyticsSummaryUseCase` (Phase 4 application layer).
 *
 * Thin composition over `AnalyticsRepository.getSummary`. The
 * repository owns the 4 KPI computations and the spec semantics
 * (count soft-deleted-link clicks, UTC day boundary, rolling 168h
 * window); the use-case owns the application boundary that the
 * presentation layer (Phase 6) injects and the controller calls.
 *
 * Returning `Promise<AnalyticsSummary>` (the exact domain type) keeps
 * the test contract identical to the repo contract — the use-case is
 * a type-stable seam, not a value-transformation step. If the
 * presentation layer needs a snake_case DTO, the schema mapper
 * (`@shortpulse/shared/analyticsSummarySchema`) is the right place
 * for that conversion.
 *
 * Spec references:
 *  - `openspec/specs/analytics/spec.md` requirement #2 (summary KPIs)
 *  - `openspec/changes/add-shortpulse-app/design.md` §5 (API contract)
 */
import type {
  AnalyticsRepository,
  AnalyticsSummary,
} from '../domain/repositories/analytics-repository.js';

/** Use-case input. No parameters — the summary is repo-wide. */
export type GetAnalyticsSummaryInput = Record<string, never>;

/** Use-case output — the 4 KPIs from spec analytics #2. */
export type GetAnalyticsSummaryOutput = AnalyticsSummary;

/** Dependency bag — injected by `container.ts` (Phase 6). */
export interface GetAnalyticsSummaryDeps {
  analyticsRepository: AnalyticsRepository;
}

export class GetAnalyticsSummaryUseCase {
  constructor(private readonly deps: GetAnalyticsSummaryDeps) {}

  async execute(_input: GetAnalyticsSummaryInput = {}): Promise<GetAnalyticsSummaryOutput> {
    return this.deps.analyticsRepository.getSummary();
  }
}
