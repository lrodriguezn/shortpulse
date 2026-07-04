/**
 * `KpiCards` — the top-of-page summary on the Analytics dashboard.
 *
 * Spec contract (see `openspec/specs/analytics/spec.md` requirement #2
 * and design §7):
 *  - Four cards with the spec-locked labels in Spanish:
 *    "Enlaces totales", "Clicks totales", "Clicks hoy", and
 *    "Clicks últimos 7 días".
 *  - Values come from `GET /api/analytics/summary` (the
 *    `useAnalyticsSummary` hook) which returns
 *    `{total_links, total_clicks, clicks_today, clicks_last_7_days}`.
 *  - Loading state: a single `Spinner` (role="status") while the
 *    query is pending. The four cards are NOT rendered during
 *    the loading phase (no flashing numbers).
 *  - Error state: an alert block with the error message and a
 *    "Reintentar" button that calls the query's `refetch`.
 *  - Large numbers are formatted with the runtime locale's
 *    thousands separator (`toLocaleString`).
 *
 * The component is presentational: it owns NO local state, NO
 * side effects. All data comes from the single `useAnalyticsSummary`
 * hook. This keeps the KPI section a thin shell that the
 * `AnalyticsPage` can drop into the top of the page.
 */
import type { AnalyticsSummary } from '@shortpulse/shared';

import { Button } from '../../components/ui/button.js';
import { Spinner } from '../../components/ui/spinner.js';
import { useAnalyticsSummary } from '../../hooks/use-analytics.js';

interface KpiSpec {
  /** Spec-locked Spanish label. */
  label: string;
  /** Stable key so React can reconcile the four cards across re-renders. */
  key: keyof AnalyticsSummary;
  /** Accessible description (visually hidden) explaining the metric. */
  description: string;
}

const KPI_SPECS: readonly KpiSpec[] = [
  {
    label: 'Enlaces totales',
    key: 'total_links',
    description: 'Número de enlaces activos (no eliminados) en el sistema.',
  },
  {
    label: 'Clicks totales',
    key: 'total_clicks',
    description: 'Número total de clicks registrados, incluyendo enlaces eliminados.',
  },
  {
    label: 'Clicks hoy',
    key: 'clicks_today',
    description: 'Clicks registrados desde las 00:00 UTC del día actual.',
  },
  {
    label: 'Clicks últimos 7 días',
    key: 'clicks_last_7_days',
    description: 'Clicks en las últimas 168 horas.',
  },
] as const;

/**
 * Format a non-negative integer with the runtime locale's
 * thousands separator (e.g. `1234567` → `"1,234,567"` in en-US
 * or `"1.234.567"` in es-ES).
 *
 * Exported for the test to assert the formatting behaviour
 * without having to reimplement the Intl call.
 */
export function formatKpiValue(n: number): string {
  if (!Number.isFinite(n) || n < 0) return String(n);
  return n.toLocaleString();
}

export function KpiCards(): React.JSX.Element {
  const query = useAnalyticsSummary();

  // --- Render: loading -------------------------------------------------------
  if (query.isPending) {
    return (
      <section
        aria-label="Cargando indicadores"
        className="flex items-center justify-center rounded-lg border border-neutral-200 bg-white py-12"
      >
        <Spinner label="Cargando indicadores" />
      </section>
    );
  }

  // --- Render: error ---------------------------------------------------------
  if (query.isError) {
    return (
      <section
        role="alert"
        aria-labelledby="kpi-error-title"
        className="rounded-lg border border-red-200 bg-red-50 p-4"
      >
        <h3 id="kpi-error-title" className="text-sm font-semibold text-red-800">
          No se pudieron cargar los indicadores
        </h3>
        <p className="mt-1 text-sm text-red-700">{query.error?.message ?? 'Error desconocido'}</p>
        <Button
          variant="secondary"
          size="sm"
          className="mt-3"
          onClick={() => {
            void query.refetch();
          }}
        >
          Reintentar
        </Button>
      </section>
    );
  }

  // --- Render: populated grid -----------------------------------------------
  // At this point `query.data` is defined (TanStack Query guarantees
  // a defined `data` when neither `isPending` nor `isError` is set
  // for a successful query). The non-null assertion is safe here.
  const summary = query.data as AnalyticsSummary;

  return (
    <section aria-label="Indicadores clave" className="flex flex-col gap-3">
      <h2 className="sr-only">Indicadores clave</h2>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {KPI_SPECS.map((spec) => {
          const value = summary[spec.key];
          return (
            <div
              key={spec.key}
              className="flex flex-col gap-1 rounded-lg border border-neutral-200 bg-white px-4 py-3 shadow-sm"
            >
              <dt className="text-xs font-medium uppercase tracking-wide text-neutral-600">
                {spec.label}
              </dt>
              <dd
                className="text-2xl font-semibold tabular-nums text-neutral-900"
                title={spec.description}
              >
                {formatKpiValue(value)}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
