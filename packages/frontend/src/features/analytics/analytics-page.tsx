/**
 * `AnalyticsPage` — the "/analytics" destination of the SPA.
 *
 * Spec contract: the page composes the three spec-locked
 * sections (`openspec/specs/analytics/spec.md` + design §7):
 *  - `KpiCards` at the top — the 4-KPI summary.
 *  - `TimeseriesChart` in the middle — the Recharts line chart
 *    with the day/week/month granularity switcher.
 *  - `EventsTable` at the bottom — the paginated, filterable
 *    event log.
 *
 * The page is a thin presentational wrapper — no state, no
 * side effects. Each child component owns its own data
 * fetching (TanStack Query) and any local state (RHF, the
 * granularity switcher, the events-table filters). The page
 * wires them together vertically in the spec-locked order
 * so a user can read the high-level KPIs, drill into the
 * trend, and inspect individual events without leaving the
 * page.
 *
 * The page is exported from `routes/analytics.tsx` so the
 * router tree (`router.ts`) can import it through the same
 * path every other route uses. Keeping the route file as a
 * one-liner re-export keeps the feature folder as the
 * single source of truth for the component.
 */
import { EventsTable } from './events-table.js';
import { KpiCards } from './kpi-cards.js';
import { TimeseriesChart } from './timeseries-chart.js';

export function AnalyticsPage(): React.JSX.Element {
  return (
    <section aria-labelledby="analytics-title" className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 id="analytics-title" className="text-[28px] font-bold tracking-tight text-sp-fg">
          Analíticas
        </h1>
        <p className="text-sm text-sp-fg-dim">Métricas y eventos de tus enlaces acortados</p>
      </div>
      <KpiCards />
      <TimeseriesChart />
      <EventsTable />
    </section>
  );
}
