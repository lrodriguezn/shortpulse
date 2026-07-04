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
        <span className="text-sm text-sp-fg-dim" title={raw}>
          {label}
        </span>
      );
    },
  }),
  columnHelper.accessor('link_label', {
    header: 'Link',
    cell: (info) => {
      const label = info.getValue();
      const isDeleted = label === DELETED_LINK_LABEL;
      return (
        <span
          className={
            isDeleted
              ? 'font-mono text-xs italic text-sp-fg-muted'
              : 'inline-block rounded bg-sp-accent-subtle px-1.5 py-0.5 font-mono text-xs text-sp-accent-hover'
          }
        >
          {label}
        </span>
      );
    },
  }),
  columnHelper.accessor('ip', {
    header: 'IP',
    cell: (info) => <span className="font-mono text-xs text-sp-fg-dim">{info.getValue()}</span>,
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

function NullableCell({ value }: { value: string | null }): React.JSX.Element {
  const display = value !== null && value !== '' ? value : '—';
  return (
    <span className={display === '—' ? 'text-sp-fg-muted' : 'text-sm text-sp-fg-dim'}>
      {display}
    </span>
  );
}

function localInputToIso(value: string): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

export function toIsoFromLocalInput(value: string): string | undefined {
  return localInputToIso(value);
}

export function EventsTable(): React.JSX.Element {
  const [page, setPage] = useState(1);
  const [linkIdInput, setLinkIdInput] = useState('');
  const [countryInput, setCountryInput] = useState('');
  const [dateFromInput, setDateFromInput] = useState('');
  const [dateToInput, setDateToInput] = useState('');

  const [debouncedLinkId, setDebouncedLinkId] = useState('');
  const [debouncedCountry, setDebouncedCountry] = useState('');

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedLinkId(linkIdInput.trim());
      setDebouncedCountry(countryInput.trim());
      setPage(1);
    }, FILTER_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [linkIdInput, countryInput]);

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

  if (query.isPending) {
    return (
      <div aria-label="Cargando eventos" className="flex items-center justify-center py-12">
        <Spinner label="Cargando eventos" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <section
        role="alert"
        aria-labelledby="events-error-title"
        className="rounded-lg border border-sp-error bg-sp-error-subtle p-4"
      >
        <h3 id="events-error-title" className="text-sm font-semibold text-sp-error">
          No se pudieron cargar los eventos
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
      <div className="overflow-x-auto rounded-lg border border-sp-border bg-sp-surface">
        <table className="min-w-full divide-y divide-sp-border text-sm">
          <thead className="bg-sp-bg-m1">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    scope="col"
                    className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-sp-fg-muted"
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-sp-border">
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="hover:bg-sp-bg-surface-hover">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-2 align-middle text-sp-fg">
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
      className="flex items-center justify-between text-sm text-sp-fg-muted"
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
