import type { AnalyticsSummary } from '@shortpulse/shared';

import { Button } from '../../components/ui/button.js';
import { Spinner } from '../../components/ui/spinner.js';
import { useAnalyticsSummary } from '../../hooks/use-analytics.js';

interface KpiSpec {
  label: string;
  key: keyof AnalyticsSummary;
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

export function formatKpiValue(n: number): string {
  if (!Number.isFinite(n) || n < 0) return String(n);
  return n.toLocaleString();
}

export function KpiCards(): React.JSX.Element {
  const query = useAnalyticsSummary();

  if (query.isPending) {
    return (
      <section
        aria-label="Cargando indicadores"
        className="flex items-center justify-center rounded-lg border border-sp-border bg-sp-surface py-12"
      >
        <Spinner label="Cargando indicadores" />
      </section>
    );
  }

  if (query.isError) {
    return (
      <section
        role="alert"
        aria-labelledby="kpi-error-title"
        className="rounded-lg border border-sp-error bg-sp-error-subtle p-4"
      >
        <h3 id="kpi-error-title" className="text-sm font-semibold text-sp-error">
          No se pudieron cargar los indicadores
        </h3>
        <p className="mt-1 text-sm text-sp-error">{query.error?.message ?? 'Error desconocido'}</p>
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
              className="flex flex-col gap-1 rounded-lg border border-sp-border bg-sp-surface px-4 py-3 shadow-sm"
            >
              <dt className="text-xs font-medium uppercase tracking-wide text-sp-fg-muted">
                {spec.label}
              </dt>
              <dd
                className="text-2xl font-semibold tabular-nums text-sp-fg"
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
