import { useState, type ChangeEvent } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TimeseriesGranularity } from '@shortpulse/shared';

import { Spinner } from '../../components/ui/spinner.js';
import { Button } from '../../components/ui/button.js';
import { useTimeseries } from '../../hooks/use-analytics.js';

const CHART_HEIGHT = 280;

const GRANULARITY_OPTIONS: ReadonlyArray<{ value: TimeseriesGranularity; label: string }> = [
  { value: 'day', label: 'Día' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mes' },
];

export function formatBucket(iso: string, granularity: TimeseriesGranularity): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  if (granularity === 'day') {
    return d.toLocaleDateString('es-ES', { month: 'short', day: 'numeric' });
  }
  if (granularity === 'week') {
    return d.toLocaleDateString('es-ES', { month: 'short', day: 'numeric' });
  }
  return d.toLocaleDateString('es-ES', { year: 'numeric', month: 'short' });
}

export function TimeseriesChart(): React.JSX.Element {
  const [granularity, setGranularity] = useState<TimeseriesGranularity>('day');
  const query = useTimeseries({ granularity });

  if (query.isPending) {
    return (
      <div
        aria-label="Cargando serie temporal"
        className="flex items-center justify-center rounded-lg border border-sp-border bg-sp-surface py-16"
      >
        <Spinner label="Cargando serie temporal" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <section
        role="alert"
        aria-labelledby="timeseries-error-title"
        className="rounded-lg border border-sp-error bg-sp-error-subtle p-4"
      >
        <h3 id="timeseries-error-title" className="text-sm font-semibold text-sp-error">
          No se pudo cargar la serie temporal
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

  const data = query.data?.data ?? [];

  return (
    <section
      aria-labelledby="timeseries-title"
      className="flex flex-col gap-4 rounded-lg border border-sp-border bg-sp-surface p-4 shadow-sm"
    >
      <header className="flex items-center justify-between gap-3">
        <h2 id="timeseries-title" className="text-base font-semibold text-sp-fg">
          Clicks por {granularity === 'day' ? 'día' : granularity === 'week' ? 'semana' : 'mes'}
        </h2>
        <label className="flex items-center gap-2 text-sm text-sp-fg-dim">
          <span>Granularidad</span>
          <select
            aria-label="Granularidad"
            value={granularity}
            onChange={(e: ChangeEvent<HTMLSelectElement>) =>
              setGranularity(e.target.value as TimeseriesGranularity)
            }
            className="h-9 rounded-md border border-sp-border bg-sp-bg px-2 text-sm text-sp-fg shadow-sm focus:border-sp-accent focus:outline-none focus:ring-2 focus:ring-sp-accent-subtle"
          >
            {GRANULARITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </header>
      <div style={{ width: '100%', height: CHART_HEIGHT }}>
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--sp-border)" />
            <XAxis
              dataKey="bucket_start"
              tickFormatter={(v: string) => formatBucket(v, granularity)}
              stroke="var(--sp-fg-muted)"
              fontSize={12}
            />
            <YAxis allowDecimals={false} stroke="var(--sp-fg-muted)" fontSize={12} />
            <Tooltip
              labelFormatter={(v: string) => formatBucket(v, granularity)}
              formatter={(value: number) => [value, 'Clicks']}
              contentStyle={{
                backgroundColor: 'var(--sp-bg-surface)',
                border: '1px solid var(--sp-border)',
                borderRadius: '8px',
                color: 'var(--sp-fg)',
              }}
            />
            <Line
              type="monotone"
              dataKey="count"
              stroke="var(--sp-accent)"
              strokeWidth={2}
              dot={{ r: 3, fill: 'var(--sp-accent)' }}
              activeDot={{ r: 5, fill: 'var(--sp-accent-hover)' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
