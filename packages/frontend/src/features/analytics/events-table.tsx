/**
 * `EventsTable` — the events log at the bottom of the Analytics
 * dashboard.
 *
 * Spec contract (see `openspec/specs/analytics/spec.md` requirement
 * #3 and design §7):
 *  - TanStack Table rendering the spec-locked columns:
 *    timestamp, link (`link_label` — slug or `"(deleted link)"`),
 *    ip, country, city, browser, referer.
 *  - Filters: `link_id` (text input — UUID), `date_from` /
 *    `date_to` (datetime-local), `country` (text input). Filter
 *    changes are forwarded to the `useAnalytics` query (the BE
 *    does the SQL-side filtering), and a new filter starts
 *    the page at 1.
 *  - Pagination: Previous / Next buttons. The server is the
 *    source of truth for the displayed page (same pattern as
 *    `LinksTable`).
 *  - Empty / loading / error states render their spec-locked
 *    affordances (`EmptyState` / `Spinner` / alert block).
 *  - The `"(deleted link)"` literal is rendered verbatim when
 *    the BE reports the soft-deleted-link presentation label.
 *
 * The component owns local filter / pagination state. No global
 * state, no router-state coupling — the page is a self-contained
 * filter+table view. The KPI cards and the timeseries chart
 * sit on top of this table in the Analytics page, but they
 * query their own data (independent fetches) so a filter
 * change here does NOT trigger a refetch of the other panels.
 */
import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { DELETED_LINK_LABEL, type AnalyticsEvent } from '@shortpulse/shared';

import { Button } from '../../components/ui/button.js';
import { EmptyState } from '../../components/ui/empty-state.js';
import { Input } from '../../components/ui/input.js';
import { Spinner } from '../../components/ui/spinner.js';
import { useAnalytics } from '../../hooks/use-analytics.js';

const DEFAULT_PAGE_SIZE = 20;
const FILTER_DEBOUNCE_MS = 300;

const columnHelper = createColumnHelper<AnalyticsEvent>();

const columns = [
  columnHelper.accessor('timestamp', {
    header: 'Fecha',
    cell: (info) => {
      const raw = info.getValue();
      const date = new Date(raw);
      // Defensive: surface the raw ISO if the BE ever sends an
      // unparseable string (mirrors LinksTable's pattern).
      const label = Number.isNaN(date.getTime())
        ? raw
        : date.toLocaleString('es-ES', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          });
      return (
        <span className="text-sm text-neutral-700" title={raw}>
          {label}
        </span>
      );
    },
  }),
  columnHelper.accessor('link_label', {
    header: 'Link',
    cell: (info) => {
      const label = info.getValue();
      // The spec-locked literal must be visually distinct from
      // a real slug (italic + dimmed) so the user can scan
      // the table and tell at a glance which events belong to
      // soft-deleted links.
      const isDeleted = label === DELETED_LINK_LABEL;
      return (
        <span
          className={
            isDeleted
              ? 'font-mono text-xs italic text-neutral-500'
              : 'font-mono text-xs text-neutral-800'
          }
        >
          {label}
        </span>
      );
    },
  }),
  columnHelper.accessor('ip', {
    header: 'IP',
    cell: (info) => <span className="font-mono text-xs text-neutral-700">{info.getValue()}</span>,
  }),
  columnHelper.accessor('country', {
    header: 'País',
    cell: (info) => <NullableCell value={info.getValue()} />,
  }),
  columnHelper.accessor('city', {
    header: 'Ciudad',
    cell: (info) => <NullableCell value={info.getValue()} />,
  }),
  columnHelper.accessor('browser', {
    header: 'Navegador',
    cell: (info) => <NullableCell value={info.getValue()} />,
  }),
  columnHelper.accessor('referer', {
    header: 'Referer',
    cell: (info) => <NullableCell value={info.getValue()} />,
  }),
];

/** Format a nullable / empty-string cell as `—` (em dash) so
 *  the table stays a clean grid even when geo / referer is
 *  unknown. */
function NullableCell({ value }: { value: string | null }): React.JSX.Element {
  const display = value !== null && value !== '' ? value : '—';
  return (
    <span className={display === '—' ? 'text-neutral-400' : 'text-sm text-neutral-700'}>
      {display}
    </span>
  );
}

/** Convert a `datetime-local` input value to the ISO8601 string
 *  the BE expects (`z.string().datetime()`). Returns `undefined`
 *  for empty inputs so the FE doesn't send `date_from=` (which
 *  the Zod schema would reject as not-a-datetime). */
function localInputToIso(value: string): string | undefined {
  if (!value) return undefined;
  // The browser hands us `YYYY-MM-DDTHH:mm` (no timezone). We
  // interpret it as UTC and emit the canonical `Z` form.
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

/** Exported for the test to assert the date-input → ISO mapping
 *  without re-running the full table. */
export function toIsoFromLocalInput(value: string): string | undefined {
  return localInputToIso(value);
}

export function EventsTable(): React.JSX.Element {
  const [page, setPage] = useState(1);
  const [linkIdInput, setLinkIdInput] = useState('');
  const [countryInput, setCountryInput] = useState('');
  const [dateFromInput, setDateFromInput] = useState('');
  const [dateToInput, setDateToInput] = useState('');

  // Debounced filter state — the values that actually drive the
  // query. Holding two states (input + debounced) keeps the
  // input responsive (no lag while typing) while avoiding a
  // fetch on every keystroke.
  const [debouncedLinkId, setDebouncedLinkId] = useState('');
  const [debouncedCountry, setDebouncedCountry] = useState('');

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedLinkId(linkIdInput.trim());
      setDebouncedCountry(countryInput.trim());
      // A new filter restarts the pagination at page 1.
      setPage(1);
    }, FILTER_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [linkIdInput, countryInput]);

  // Date inputs are committed on `change` (not debounced — the
  // user picks a date with the calendar widget, not by typing
  // character-by-character). A new date filter also resets
  // page to 1.
  const handleDateFromChange = (e: ChangeEvent<HTMLInputElement>) => {
    setDateFromInput(e.target.value);
    setPage(1);
  };
  const handleDateToChange = (e: ChangeEvent<HTMLInputElement>) => {
    setDateToInput(e.target.value);
    setPage(1);
  };

  const query = useAnalytics({
    page,
    page_size: DEFAULT_PAGE_SIZE,
    ...(debouncedLinkId ? { link_id: debouncedLinkId } : {}),
    ...(debouncedCountry ? { country: debouncedCountry } : {}),
    ...(localInputToIso(dateFromInput) ? { date_from: localInputToIso(dateFromInput)! } : {}),
    ...(localInputToIso(dateToInput) ? { date_to: localInputToIso(dateToInput)! } : {}),
  });

  const rows = useMemo<AnalyticsEvent[]>(() => query.data?.data ?? [], [query.data]);

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const totalPages = query.data
    ? Math.max(1, Math.ceil(query.data.total / query.data.page_size))
    : 1;
  const displayedPage = query.data?.page ?? page;
  const canPrev = displayedPage > 1;
  const canNext = query.data ? displayedPage < totalPages : false;

  // --- Render: loading -------------------------------------------------------
  if (query.isPending) {
    return (
      <div aria-label="Cargando eventos" className="flex items-center justify-center py-12">
        <Spinner label="Cargando eventos" />
      </div>
    );
  }

  // --- Render: error ---------------------------------------------------------
  if (query.isError) {
    return (
      <section
        role="alert"
        aria-labelledby="events-error-title"
        className="rounded-lg border border-red-200 bg-red-50 p-4"
      >
        <h3 id="events-error-title" className="text-sm font-semibold text-red-800">
          No se pudieron cargar los eventos
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

  // --- Render: empty ---------------------------------------------------------
  if (rows.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <Filters
          linkId={linkIdInput}
          onLinkIdChange={(e) => setLinkIdInput(e.target.value)}
          country={countryInput}
          onCountryChange={(e) => setCountryInput(e.target.value)}
          dateFrom={dateFromInput}
          onDateFromChange={handleDateFromChange}
          dateTo={dateToInput}
          onDateToChange={handleDateToChange}
        />
        <EmptyState
          title={'No hay eventos'}
          description={
            debouncedLinkId || countryInput || dateFromInput || dateToInput
              ? 'No hay eventos que coincidan con los filtros seleccionados.'
              : 'Todavía no se han registrado eventos.'
          }
        />
      </div>
    );
  }

  // --- Render: populated table ---------------------------------------------
  return (
    <div className="flex flex-col gap-4">
      <Filters
        linkId={linkIdInput}
        onLinkIdChange={(e) => setLinkIdInput(e.target.value)}
        country={countryInput}
        onCountryChange={(e) => setCountryInput(e.target.value)}
        dateFrom={dateFromInput}
        onDateFromChange={handleDateFromChange}
        dateTo={dateToInput}
        onDateToChange={handleDateToChange}
      />
      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="min-w-full divide-y divide-neutral-200 text-sm">
          <thead className="bg-neutral-50">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    scope="col"
                    className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-neutral-700"
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="hover:bg-neutral-50">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-2 align-middle text-neutral-800">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination
        page={displayedPage}
        totalPages={totalPages}
        canPrev={canPrev}
        canNext={canNext}
        onPrev={() => setPage((p) => Math.max(1, p - 1))}
        onNext={() => setPage((p) => p + 1)}
      />
    </div>
  );
}

function Filters({
  linkId,
  onLinkIdChange,
  country,
  onCountryChange,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
}: {
  linkId: string;
  onLinkIdChange: (e: ChangeEvent<HTMLInputElement>) => void;
  country: string;
  onCountryChange: (e: ChangeEvent<HTMLInputElement>) => void;
  dateFrom: string;
  onDateFromChange: (e: ChangeEvent<HTMLInputElement>) => void;
  dateTo: string;
  onDateToChange: (e: ChangeEvent<HTMLInputElement>) => void;
}): React.JSX.Element {
  return (
    <fieldset
      aria-label="Filtros de eventos"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
    >
      <Input
        label="Link ID"
        type="text"
        placeholder="00000000-0000-0000-0000-000000000000"
        value={linkId}
        onChange={onLinkIdChange}
        autoComplete="off"
      />
      <Input
        label="País"
        type="text"
        placeholder="US, ES, …"
        value={country}
        onChange={onCountryChange}
        autoComplete="off"
      />
      <Input
        label="Desde"
        type="datetime-local"
        value={dateFrom}
        onChange={onDateFromChange}
        autoComplete="off"
      />
      <Input
        label="Hasta"
        type="datetime-local"
        value={dateTo}
        onChange={onDateToChange}
        autoComplete="off"
      />
    </fieldset>
  );
}

function Pagination({
  page,
  totalPages,
  canPrev,
  canNext,
  onPrev,
  onNext,
}: {
  page: number;
  totalPages: number;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}): React.JSX.Element {
  return (
    <nav
      aria-label="Paginación de eventos"
      className="flex items-center justify-between text-sm text-neutral-600"
    >
      <span>
        Página {page} de {totalPages}
      </span>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" onClick={onPrev} disabled={!canPrev}>
          Anterior
        </Button>
        <Button size="sm" variant="secondary" onClick={onNext} disabled={!canNext}>
          Siguiente
        </Button>
      </div>
    </nav>
  );
}
