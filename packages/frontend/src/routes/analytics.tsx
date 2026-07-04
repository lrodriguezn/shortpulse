/**
 * Analytics page \u2014 `routes/analytics.tsx`.
 *
 * Phase 7 placeholder: a heading that confirms the route resolved.
 * The full Analytics feature (KPI cards, events table, Recharts
 * timeseries with granularity switcher) lands in Phase 9.
 * The route MUST exist now so the nav link resolves.
 */
export function AnalyticsPage(): React.JSX.Element {
  return (
    <section aria-labelledby="analytics-title">
      <h1 id="analytics-title" className="text-2xl font-semibold text-neutral-900">
        Analytics
      </h1>
      <p className="mt-2 text-neutral-600">
        Métricas agregadas, eventos y serie temporal. Las tarjetas, la tabla y la gráfica llegan en
        la siguiente fase.
      </p>
    </section>
  );
}
