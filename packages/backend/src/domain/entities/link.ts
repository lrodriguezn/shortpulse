/**
 * `Link` domain entity.
 *
 * The aggregate root for a shortened URL. Encapsulates the invariants the
 * spec requires (valid http(s) URL, valid custom-slug format) and exposes
 * the only behaviour that doesn't belong in a repository: soft-delete
 * (immutable) and short-URL composition.
 *
 * PURE: no I/O, no clock access, no random. The factory validates the
 * shape of the input; the application layer (Phase 4) is responsible for
 * producing the `id` and `createdAt` (typically from the DB).
 *
 * Spec references:
 *  - `openspec/specs/links/spec.md` requirements #1, #3
 *  - `openspec/changes/add-shortpulse-app/design.md` §3 (domain)
 *  - `openspec/changes/add-shortpulse-app/design.md` ADR-004 (soft-delete)
 */
import { isValidHttpsUrl, validateCustomSlug } from '@shortpulse/shared';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Internal `Link` record. The factory and `softDelete` build this
 * object; the public `Link` type is `LinkRecord` + behaviour methods.
 *
 * Splitting record vs behaviour lets `softDelete` skip re-running
 * validation (the entity already passed `createLink` once).
 */
interface LinkRecord {
  readonly id: string;
  readonly originalUrl: string;
  readonly slug: string;
  readonly createdAt: Date;
  readonly deletedAt: Date | null;
}

/** Public `Link` entity — record + behaviour. */
export type Link = LinkRecord & {
  readonly isDeleted: () => boolean;
  readonly softDelete: (at?: Date) => Link;
  readonly shortUrl: (baseUrl: string) => string;
};

/** Input shape for `createLink`. All fields required. */
export interface CreateLinkInput {
  id: string;
  originalUrl: string;
  slug: string;
  createdAt: Date;
}

/** Wrap a `LinkRecord` in the public `Link` behaviour. Pure. */
function buildLink(record: LinkRecord): Link {
  return {
    ...record,
    isDeleted: () => record.deletedAt !== null,
    softDelete: (at?: Date) => {
      const deletedAt = at ?? new Date();
      if (!(deletedAt instanceof Date) || Number.isNaN(deletedAt.getTime())) {
        throw new Error(`softDelete(at) requires a valid Date (got: ${String(at)})`);
      }
      return buildLink({ ...record, deletedAt });
    },
    shortUrl: (baseUrl: string) => {
      if (typeof baseUrl !== 'string' || baseUrl.length === 0) {
        throw new Error(`shortUrl(baseUrl) requires a non-empty string`);
      }
      const trimmed = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
      return `${trimmed}/${record.slug}`;
    },
  };
}

/**
 * Factory + invariant guard. Throws on any invalid input — the application
 * layer translates thrown errors into the right HTTP status (see
 * `error-mapper.ts` in Phase 6).
 */
export function createLink(input: CreateLinkInput): Link {
  if (typeof input.id !== 'string' || !UUID_RE.test(input.id)) {
    throw new Error(`Link.id must be a UUID (got: ${String(input.id)})`);
  }
  if (typeof input.originalUrl !== 'string' || !isValidHttpsUrl(input.originalUrl)) {
    throw new Error(
      `Link.originalUrl must be a valid http(s) URL (got: ${String(input.originalUrl)})`,
    );
  }
  // Slug validation: the shared validator normalises first, so we
  // explicitly normalise here too so the stored slug is canonical.
  const normalizedSlug = input.slug.toLowerCase().trim();
  const result = validateCustomSlug(normalizedSlug);
  if (!result.valid) {
    throw new Error(`Link.slug is invalid (${result.reason}): ${JSON.stringify(input.slug)}`);
  }
  if (!(input.createdAt instanceof Date) || Number.isNaN(input.createdAt.getTime())) {
    throw new Error(`Link.createdAt must be a valid Date (got: ${String(input.createdAt)})`);
  }

  return buildLink({
    id: input.id,
    originalUrl: input.originalUrl,
    slug: normalizedSlug,
    createdAt: input.createdAt,
    deletedAt: null,
  });
}
