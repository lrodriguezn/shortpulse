/**
 * `LinksTable` \u2014 the dashboard of the Links feature.
 *
 * Spec contract (see `openspec/specs/links/spec.md` requirement #2
 * and design \u00a77):
 *  - Renders the paginated list (`useLinks`) with the spec-locked
 *    columns: `original_url`, `short_url`, `slug`, `created_at`,
 *    `click_count`, and an actions cell with copy / open / delete.
 *  - Search box: substring match on `original_url` or `slug`.
 *    Implemented SERVER-SIDE via the `useLinks` query
 *    (`search` param passed to the BE) with a 300ms debounce so
 *    we don't spam the API while the user is typing.
 *  - Sort: client-side via TanStack Table (the loaded data is
 *    sorted in place). Instant feedback; no loading state.
 *  - Pagination: server-side. The "Previous" / "Next" buttons
 *    change the `page` state, which is passed to `useLinks`
 *    and triggers a re-query.
 *  - Copy button: copies the row's `short_url` to the clipboard
 *    and toasts "URL copiada".
 *  - Open button: a real anchor (`<a target="_blank"
 *    rel="noopener noreferrer">`) so right-click / cmd-click
 *    work and screen readers announce the destination.
 *  - Delete button: window.confirm \u2192 `useDeleteLink` \u2192 toast.
 *  - Empty state: the spec-locked `EmptyState` primitive when
 *    the data array is empty (handles the "no links yet" case
 *    and the "search returned nothing" case uniformly).
 *  - Loading: a `Spinner` while the query is pending.
 *  - Error: a recoverable error block with a "Reintentar" button
 *    that calls the query's `refetch`.
 *
 * Why server-side search but client-side sort: the BE already
 * implements substring search in SQL, so we reuse the index.
 * Sort, on the other hand, operates on the loaded page (at most
 * 20 rows by default) so client-side is instant and avoids a
 * round-trip on every header click.
 */
import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table';
import type { LinkResponse } from '@shortpulse/shared';

import { Button } from '../../components/ui/button.js';
import { EmptyState } from '../../components/ui/empty-state.js';
import { Input } from '../../components/ui/input.js';
import { Spinner } from '../../components/ui/spinner.js';
import { ApiError } from '../../lib/api.js';
import { useDeleteLink, useLinks } from '../../hooks/use-links.js';
import { useCopyToClipboard } from '../../hooks/use-copy-to-clipboard.js';
import { toast } from 'sonner';

const SEARCH_DEBOUNCE_MS = 300;
const DEFAULT_PAGE_SIZE = 20;

const columnHelper = createColumnHelper<LinkResponse>();

const columns = [
  columnHelper.accessor('original_url', {
    header: 'URL original',
    cell: (info) => (
      <span className="block max-w-xs truncate" title={info.getValue()}>
        {info.getValue()}
      </span>
    ),
  }),
  columnHelper.accessor('short_url', {
    header: 'Short URL',
    cell: (info) => (
      <span className="font-mono text-xs text-neutral-700" title={info.getValue()}>
        {info.getValue()}
      </span>
    ),
  }),
  columnHelper.accessor('slug', {
    header: 'Slug',
    cell: (info) => <span className="font-mono text-xs">{info.getValue()}</span>,
  }),
  columnHelper.accessor('created_at', {
    header: 'Creado',
    cell: (info) => {
      const raw = info.getValue();
      const date = new Date(raw);
      // Defensive: if the BE ever ships an unparseable string we
      // surface the raw text instead of "Invalid Date".
      const label = Number.isNaN(date.getTime())
        ? raw
        : date.toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: 'numeric' });
      return <span className="text-sm text-neutral-600">{label}</span>;
    },
  }),
  columnHelper.accessor('click_count', {
    header: 'Clicks',
    cell: (info) => <span className="tabular-nums">{info.getValue()}</span>,
    // Numeric columns read best low-to-high by default; override
    // TanStack Table's "descending first" convention.
    sortDescFirst: false,
  }),
];

/**
 * Format a date for the `Creado` column.
 *
 * Exported only for tests; production code calls the
 * `columnHelper` cell renderer above.
 */
export function formatCreatedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function LinksTable(): React.JSX.Element {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);

  // Debounce the search input so the BE isn't spammed while the
  // user is typing. 300ms is the sweet spot for "feels instant"
  // + "doesn't ping on every keystroke".
  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      // A new search starts at page 1.
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const query = useLinks({
    page,
    page_size: DEFAULT_PAGE_SIZE,
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
  });

  const { copy } = useCopyToClipboard();
  const deleteMutation = useDeleteLink();

  // Memo the rows reference so the table identity is stable
  // across re-renders (TanStack Table doesn't require this but
  // it keeps the deps array in the test assertions predictable).
  const rows = useMemo<LinkResponse[]>(() => query.data?.data ?? [], [query.data]);

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const totalPages = query.data
    ? Math.max(1, Math.ceil(query.data.total / query.data.page_size))
    : 1;
  // The server is the source of truth for the currently displayed
  // page. The local `page` state is the "intended" page; while a
  // refetch is in flight, `data.page` is the page the user is
  // actually looking at. The buttons enable / disable off the
  // server-confirmed page so the UX never gets ahead of the data.
  const displayedPage = query.data?.page ?? page;
  const canPrev = displayedPage > 1;
  const canNext = query.data ? displayedPage < totalPages : false;

  const handleSearchChange = (e: ChangeEvent<HTMLInputElement>) => {
    setSearchInput(e.target.value);
  };

  const handleCopy = async (shortUrl: string) => {
    const ok = await copy(shortUrl);
    if (ok) toast.success('URL copiada');
    else toast.error('No se pudo copiar');
  };

  const handleDelete = async (id: string, originalUrl: string) => {
    const accepted = typeof window === 'undefined' || window.confirm(`Eliminar ${originalUrl}?`);
    if (!accepted) return;
    try {
      await deleteMutation.mutateAsync(id);
      toast.success('Enlace eliminado');
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.detail ?? err.message);
      } else {
        toast.error('No se pudo eliminar el enlace');
      }
    }
  };

  // --- Render: loading -------------------------------------------------------
  if (query.isPending) {
    return (
      <div aria-label="Cargando enlaces" className="flex items-center justify-center py-12">
        <Spinner label="Cargando enlaces" />
      </div>
    );
  }

  // --- Render: error ---------------------------------------------------------
  if (query.isError) {
    return (
      <section
        role="alert"
        aria-labelledby="links-error-title"
        className="rounded-lg border border-red-200 bg-red-50 p-4"
      >
        <h3 id="links-error-title" className="text-sm font-semibold text-red-800">
          No se pudieron cargar los enlaces
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
        <SearchBox value={searchInput} onChange={handleSearchChange} />
        <EmptyState
          title={'No hay enlaces a\u00fan'}
          description={
            debouncedSearch
              ? `No se encontraron enlaces que coincidan con "${debouncedSearch}".`
              : 'Crea tu primer enlace usando el formulario de arriba.'
          }
        />
      </div>
    );
  }

  // --- Render: populated table ---------------------------------------------
  return (
    <div className="flex flex-col gap-4">
      <SearchBox value={searchInput} onChange={handleSearchChange} />
      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="min-w-full divide-y divide-neutral-200 text-sm">
          <thead className="bg-neutral-50">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sortDir = header.column.getIsSorted();
                  const ariaSort: 'ascending' | 'descending' | 'none' | undefined = canSort
                    ? sortDir === 'asc'
                      ? 'ascending'
                      : sortDir === 'desc'
                        ? 'descending'
                        : 'none'
                    : undefined;
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={ariaSort}
                      className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-neutral-700"
                    >
                      {canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="inline-flex items-center gap-1 rounded text-left hover:text-neutral-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-300"
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sortDir === 'asc' ? <span aria-hidden="true">\u25b2</span> : null}
                          {sortDir === 'desc' ? <span aria-hidden="true">\u25bc</span> : null}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  );
                })}
                <th
                  scope="col"
                  className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-neutral-700"
                >
                  Acciones
                </th>
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {table.getRowModel().rows.map((row) => {
              const link = row.original;
              return (
                <tr key={row.id} className="hover:bg-neutral-50">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-2 align-middle text-neutral-800">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                  <td className="px-3 py-2 align-middle">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          void handleCopy(link.short_url);
                        }}
                        aria-label={`Copiar ${link.short_url}`}
                      >
                        Copiar
                      </Button>
                      <a
                        href={link.original_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-8 items-center justify-center rounded-md border border-neutral-300 bg-white px-3 text-sm font-medium text-neutral-900 transition-colors hover:bg-neutral-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-300"
                        aria-label={`Abrir ${link.original_url} en una nueva pesta\u00f1a`}
                      >
                        Abrir
                      </a>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => {
                          void handleDelete(link.id, link.original_url);
                        }}
                        aria-label={`Eliminar ${link.slug}`}
                      >
                        Eliminar
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
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

function SearchBox({
  value,
  onChange,
}: {
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
}): React.JSX.Element {
  return (
    <div className="max-w-sm">
      <Input
        type="search"
        label="Buscar"
        placeholder="Buscar por URL o slug"
        value={value}
        onChange={onChange}
        autoComplete="off"
      />
    </div>
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
      aria-label="Paginaci\u00f3n de enlaces"
      className="flex items-center justify-between text-sm text-neutral-600"
    >
      <span>
        P\u00e1gina {page} de {totalPages}
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
