/**
 * `TimeseriesChart` — the middle panel of the Analytics dashboard.
 *
 * Spec contract (see `openspec/specs/analytics/spec.md` requirement
 * #4 and design §7):
 *  - A Recharts `LineChart` rendering clicks over time. The
 *    spec says "line or bar" — we use `Line` because it reads
 *    best for the "clicks per day/week/month" density the
 *    dashboard targets.
 *  - A granularity selector (day / week / month) that drives
 *    the `useTimeseries` query. The selector is a native
 *    `<select>` (the simplest accessible primitive for a
 *    3-option switch) wired to local `granularity` state.
 *  - Loading / error states render the spec-locked affordances
 *    (`Spinner` / alert block).
 *  - When the BE returns no buckets, the chart is rendered
 *    with empty data so the user still sees the time axis and
 *    knows the page is alive. We do NOT swap in a blocking
 *    empty state — that would hide the granularity selector
 *    behind the user's next action.
 *
 * The Recharts surface (`LineChart`, `Line`, `XAxis`, `YAxis`,
 * `Tooltip`, `CartesianGrid`, `ResponsiveContainer`) is
 * imported from the `recharts` package. The test suite mocks
 * the package to avoid the SVG pipeline in jsdom; the
 * production build uses the real library.
 */
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

import { Button } from '../../components/ui/button.js';
import { Spinner } from '../../components/ui/spinner.js';
import { useTimeseries } from '../../hooks/use-analytics.js';

const CHART_HEIGHT = 280;

/** Human-readable Spanish labels for the granularity options. */
const GRANULARITY_OPTIONS: ReadonlyArray<{ value: TimeseriesGranularity; label: string }> = [
  { value: 'day', label: 'Día' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mes' },
];

/**
 * Format a UTC ISO bucket as a short, locale-aware date string
 * suitable for the x-axis tick label. The exact format depends
 * on the runtime ICU build, but the contract is "short,
 * locale-aware, contains the year for year-boundary ticks".
 *
 * Exported for the test to assert the format without re-running
 * the chart.
 */
export function formatBucket(iso: string, granularity: TimeseriesGranularity): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  if (granularity === 'day') {
    return d.toLocaleDateString('es-ES', { month: 'short', day: 'numeric' });
  }
  if (granularity === 'week') {
    return d.toLocaleDateString('es-ES', { month: 'short', day: 'numeric' });
  }
  // month
  return d.toLocaleDateString('es-ES', { year: 'numeric', month: 'short' });
}

export function TimeseriesChart(): React.JSX.Element {
  const [granularity, setGranularity] = useState<TimeseriesGranularity>('day');
  const query = useTimeseries({ granularity });

  // --- Render: loading -------------------------------------------------------
  if (query.isPending) {
    return (
      <div
        aria-label="Cargando serie temporal"
        className="flex items-center justify-center rounded-lg border border-neutral-200 bg-white py-16"
      >
        <Spinner label="Cargando serie temporal" />
      </div>
    );
  }

  // --- Render: error ---------------------------------------------------------
  if (query.isError) {
    return (
      <section
        role="alert"
        aria-labelledby="timeseries-error-title"
        className="rounded-lg border border-red-200 bg-red-50 p-4"
      >
        <h3 id="timeseries-error-title" className="text-sm font-semibold text-red-800">
          No se pudo cargar la serie temporal
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

  // --- Render: chart --------------------------------------------------------
  // The data array is the BE's response — empty arrays are valid
  // (the user has the chart + selector rendered, just no points).
  const data = query.data?.data ?? [];

  return (
    <section
      aria-labelledby="timeseries-title"
      className="flex flex-col gap-4 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm"
    >
      <header className="flex items-center justify-between gap-3">
        <h2 id="timeseries-title" className="text-base font-semibold text-neutral-900">
          Clicks por {granularity === 'day' ? 'día' : granularity === 'week' ? 'semana' : 'mes'}
        </h2>
        <label className="flex items-center gap-2 text-sm text-neutral-700">
          <span>Granularidad</span>
          <select
            aria-label="Granularidad"
            value={granularity}
            onChange={(e: ChangeEvent<HTMLSelectElement>) =>
              setGranularity(e.target.value as TimeseriesGranularity)
            }
            className="h-9 rounded-md border border-neutral-300 bg-white px-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-200"
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
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
            <XAxis
              dataKey="bucket_start"
              tickFormatter={(v: string) => formatBucket(v, granularity)}
              stroke="#737373"
              fontSize={12}
            />
            <YAxis allowDecimals={false} stroke="#737373" fontSize={12} />
            <Tooltip
              labelFormatter={(v: string) => formatBucket(v, granularity)}
              formatter={(value: number) => [value, 'Clicks']}
            />
            <Line
              type="monotone"
              dataKey="count"
              stroke="#171717"
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
