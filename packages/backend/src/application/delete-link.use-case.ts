/**
 * `DeleteLinkUseCase` (Phase 4 application layer).
 *
 * Soft-deletes a link by id. The use-case is **idempotent on
 * already-deleted links** (per spec links #3) — the controller returns
 * 204 in both the "deleted now" and "already deleted" cases, so the
 * use-case does NOT throw on the latter. A missing id IS a 404
 * (spec links #3: "Deleting a non-existent id MUST return 404").
 *
 * The repo's `softDelete` is itself idempotent at the contract level
 * (per `LinkRepository` docstring), but the use-case short-circuits
 * on the `isDeleted()` check before calling it — both for clarity
 * (the controller should not see a `deleted_at` write for a
 * second-time delete) and for observability (the softDelete call log
 * reflects the user's intent).
 *
 * Spec references:
 *  - `openspec/specs/links/spec.md` requirement #3
 *  - `openspec/changes/add-shortpulse-app/design.md` §5
 */
import { LinkNotFoundError } from '../domain/errors.js';
import type { LinkRepository } from '../domain/repositories/link-repository.js';

/** Use-case input. */
export interface DeleteLinkInput {
  id: string;
}

/** Dependency bag — injected by `container.ts` (Phase 6). */
export interface DeleteLinkDeps {
  linkRepository: LinkRepository;
}

export class DeleteLinkUseCase {
  constructor(private readonly deps: DeleteLinkDeps) {}

  async execute(input: DeleteLinkInput): Promise<void> {
    // 1. Find the link. Missing id is a 404.
    const link = await this.deps.linkRepository.findById(input.id);
    if (link === null) {
      throw new LinkNotFoundError(input.id);
    }

    // 2. Idempotency: if already soft-deleted, return without
    //    calling `softDelete` again. The controller still returns 204.
    if (link.isDeleted()) {
      return;
    }

    // 3. Soft-delete. The repo's contract is idempotent, but we
    //    skip the call when the flag is already set (see above).
    await this.deps.linkRepository.softDelete(input.id);
  }
}
