/**
 * Application layer barrel.
 *
 * Re-exports every public use-case class + the input/output types
 * the presentation layer (Phase 6 plugins) needs. The `container.ts`
 * (Phase 6) imports the classes from this barrel to wire the DI
 * graph.
 *
 * The application layer is the seam between the pure domain
 * (entities / value objects / repository interfaces) and the outer
 * adapters (infrastructure: Drizzle / MaxMind; presentation: Fastify).
 * It depends ONLY on `domain/` and `@shortpulse/shared` — no
 * drizzle, no fastify, no maxmind, no node:crypto beyond `randomUUID`
 * (used to generate event/link ids; the `RandomBytes` port is the
 * injection seam for the auto-slug retry loop in CreateLinkUseCase).
 *
 * Spec references:
 *  - `openspec/changes/add-shortpulse-app/design.md` §3 (hexagonal
 *    layering) + §5 (API contract) + §6 (sequence diagrams)
 */

// Create-link use-case (WU1)
export {
  CreateLinkUseCase,
  drawSlug,
  type CreateLinkInput,
  type CreateLinkOutput,
  type CreateLinkDeps,
} from './create-link.use-case.js';

// Redirect use-case (WU2)
export {
  RedirectUseCase,
  type RedirectInput,
  type RedirectOutput,
  type RedirectDeps,
} from './redirect.use-case.js';

// List-links use-case (WU3)
export {
  ListLinksUseCase,
  type ListLinksInput,
  type ListLinksOutput,
  type ListLinksRow,
  type ListLinksDeps,
} from './list-links.use-case.js';

// Delete-link use-case (WU4)
export {
  DeleteLinkUseCase,
  type DeleteLinkInput,
  type DeleteLinkDeps,
} from './delete-link.use-case.js';

// Get-analytics-summary use-case (WU5 — slice 5b)
export {
  GetAnalyticsSummaryUseCase,
  type GetAnalyticsSummaryInput,
  type GetAnalyticsSummaryOutput,
  type GetAnalyticsSummaryDeps,
} from './get-analytics-summary.use-case.js';

// List-analytics use-case (WU6 — slice 5b)
export {
  ListAnalyticsUseCase,
  DELETED_LINK_LABEL,
  type ListAnalyticsInput,
  type ListAnalyticsOutput,
  type AnalyticsEventWithLabel,
  type ListAnalyticsDeps,
} from './list-analytics.use-case.js';

// Get-timeseries use-case (WU7 — slice 5b)
export {
  GetTimeseriesUseCase,
  DEFAULT_TIMESERIES_WINDOW_DAYS,
  type GetTimeseriesInput,
  type GetTimeseriesOutput,
  type TimeseriesGranularity,
  type GetTimeseriesDeps,
} from './get-timeseries.use-case.js';
