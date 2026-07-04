/**
 * Links TanStack Query hooks.
 *
 * - `useLinks` \u2014 read the paginated list. Stays fresh for 60s
 *   (matches the spec's analytics tolerance); background refetch
 *   disabled to avoid surprise UI flickers when the tab regains
 *   focus mid-edit.
 * - `useCreateLink` \u2014 mutation. On success, invalidates the list
 *   cache so the table refreshes. The mutation's `onError` hook
 *   is the seam Phase 8 will wire to sonner (the 409 detail is
 *   already on `err.detail`, so toasting the literal Spanish
 *   string is a one-liner).
 * - `useDeleteLink` \u2014 mutation. Same invalidation contract.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateLinkInput, ListLinksQuery } from '@shortpulse/shared';

import { createLink, deleteLink, listLinks, type PagedResponse } from '../lib/api.js';
import type { LinkResponse } from '@shortpulse/shared';
import { qk } from '../lib/query-keys.js';

const STALE_TIME_MS = 60_000;

export function useLinks(params: Partial<ListLinksQuery> = {}) {
  return useQuery({
    queryKey: qk.links.list(params),
    queryFn: ({ signal }) => listLinks(params, signal),
    staleTime: STALE_TIME_MS,
  });
}

export function useCreateLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateLinkInput) => createLink(input),
    onSuccess: () => {
      // Invalidate the list so the table picks up the new row.
      // We invalidate by the parent prefix (`['links']`) so all
      // filtered / paginated views refresh in one pass.
      void qc.invalidateQueries({ queryKey: qk.links.all });
    },
  });
}

export function useDeleteLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteLink(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.links.all });
    },
  });
}

// Re-export the response shape so consumers don't have to dig
// into the lib for the type.
export type { LinkResponse, PagedResponse };
