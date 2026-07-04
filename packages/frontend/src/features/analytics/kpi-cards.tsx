import type { AnalyticsSummary } from '@shortpulse/shared';
import type React from 'react';

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

const KPI_ICONS: Record<string, React.JSX.Element> = {
  total_links: (
    <>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </>
  ),
  total_clicks: (
    <>
      <path d="M18 20V10" />
      <path d="M12 20V4" />
      <path d="M6 20v-6" />
    </>
  ),
  clicks_today: <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />,
  clicks_last_7_days: (
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </>
  ),
};

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
              className="flex flex-col gap-1 rounded-xl border border-sp-border bg-sp-surface px-4 py-3 shadow-sm"
            >
              <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-sp-accent-subtle">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="text-sp-accent"
                  aria-hidden="true"
                >
                  {KPI_ICONS[spec.key] ?? KPI_ICONS.total_links}
                </svg>
              </div>
              <dt className="text-sm font-medium text-sp-fg-dim">{spec.label}</dt>
              <dd className="text-kpi tabular-nums text-sp-fg" title={spec.description}>
                {formatKpiValue(value)}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
