/**
 * `CreateLinkUseCase` (Phase 4 application layer).
 *
 * The create-link use-case composes domain value objects, the `Link`
 * entity, and the `LinkRepository` port. It also injects a
 * `RandomBytes` port so the auto-slug retry loop is testable
 * deterministically (per design §8 + the `RandomBytes` port contract).
 *
 * Flow (per design §6 + spec links #1, #5, #6):
 *   1. Validate `originalUrl` via `createOriginalUrl` → 400 on fail.
 *   2. If `slug` is provided:
 *      - validate via `createSlug` (length / format / reserved);
 *      - on success, pre-check collision via `repo.findBySlug`
 *        → `SlugCollisionError` (409) on hit;
 *      - map the discriminated `SlugError` to the right `DomainError`
 *        subtype so the error-mapper can pick the right status.
 *   3. If `slug` is omitted, auto-generate with the `RandomBytes` port
 *      and retry on `findBySlug` collision up to
 *      `MAX_SLUG_GENERATE_RETRIES` times; throw `SlugGenerationError`
 *      (500) on exhaustion.
 *   4. Persist via `repo.save` (the repo may add a DB-generated id /
 *      timestamp; we generate them here so the use-case is self
 *      contained).
 *   5. Return the API-shaped response.
 *
 * Spec references:
 *  - `openspec/specs/links/spec.md` requirements #1, #5, #6
 *  - `openspec/changes/add-shortpulse-app/design.md` §5 + §6 + §8
 */
import { randomUUID } from 'node:crypto';

import { createLink } from '../domain/entities/link.js';
import { createOriginalUrl } from '../domain/value-objects/url.js';
import { createSlug, type Slug } from '../domain/value-objects/slug.js';
import type { LinkRepository } from '../domain/repositories/link-repository.js';
import type { RandomBytes } from '../domain/ports/random-bytes.js';
import {
  InvalidUrlError,
  InvalidSlugFormatError,
  ReservedSlugError,
  SlugCollisionError,
  SlugGenerationError,
} from '../domain/errors.js';
import {
  AUTO_SLUG_ALPHABET,
  AUTO_SLUG_LENGTH,
  MAX_SLUG_GENERATE_RETRIES,
} from '@shortpulse/shared';

/** Use-case input (untrusted — from the controller / API boundary). */
export interface CreateLinkInput {
  originalUrl: string;
  /** Optional custom slug. When omitted, the use-case auto-generates one. */
  slug?: string;
  /** Base URL used to compose the returned `shortUrl` (no trailing slash). */
  baseUrl: string;
}

/** Use-case output — the API-shaped `linkResponseSchema` payload. */
export interface CreateLinkOutput {
  id: string;
  originalUrl: string;
  slug: string;
  shortUrl: string;
  createdAt: Date;
  clickCount: number;
}

/** Dependency bag — injected by `container.ts` (Phase 6). */
export interface CreateLinkDeps {
  linkRepository: LinkRepository;
  randomBytes: RandomBytes;
}

/**
 * Largest multiple of `AUTO_SLUG_ALPHABET.length` (54) that fits in a byte.
 * Bytes ≥ 216 are rejected to keep the modulo uniform — same rule the
 * shared `generateRandomSlug` uses (mirrored here so the use-case owns
 * its determinism seam via the `RandomBytes` port).
 */
const REJECT_THRESHOLD = 256 - (256 % AUTO_SLUG_ALPHABET.length); // 216

export class CreateLinkUseCase {
  constructor(private readonly deps: CreateLinkDeps) {}

  async execute(input: CreateLinkInput): Promise<CreateLinkOutput> {
    // 1. Validate URL (400 on fail)
    const urlResult = createOriginalUrl(input.originalUrl);
    if (!urlResult.success) {
      throw new InvalidUrlError(input.originalUrl);
    }

    // 2. Resolve slug (custom path or auto-generate path)
    const slug: Slug =
      input.slug !== undefined
        ? await this.resolveCustomSlug(input.slug)
        : await this.generateAutoSlugWithRetry();

    // 3. Persist. We generate `id` + `createdAt` here so the use-case is
    //    self-contained; the repository's `save` is the persistence
    //    contract (Phase 5 Drizzle impl fills these in when the DB
    //    provides defaults — the use-case supplies them as a fallback).
    const id = randomUUID();
    const createdAt = new Date();
    const link = createLink({
      id,
      originalUrl: urlResult.url,
      slug,
      createdAt,
    });
    const saved = await this.deps.linkRepository.save(link);

    return {
      id: saved.id,
      originalUrl: saved.originalUrl,
      slug: saved.slug,
      shortUrl: saved.shortUrl(input.baseUrl),
      createdAt: saved.createdAt,
      clickCount: 0,
    };
  }

  /** Validate a custom slug + pre-check collision. */
  private async resolveCustomSlug(rawSlug: string): Promise<Slug> {
    const result = createSlug(rawSlug);
    if (!result.success) {
      // Map the discriminated `SlugError` to the right domain error so
      // the error-mapper can branch on `instanceof` (Phase 6).
      if (result.reason === 'reserved') {
        throw new ReservedSlugError(rawSlug);
      }
      // 'format' and 'length' are both `InvalidSlugFormatError` (400);
      // the entity records the reason for the problem-details detail.
      throw new InvalidSlugFormatError(rawSlug, result.reason === 'length' ? 'length' : 'format');
    }
    // Pre-check collision (409 on hit). The spec-locked detail string
    // "Ese slug ya existe, prueba otro" is rendered by the error-mapper
    // from the `SlugCollisionError.code`.
    const existing = await this.deps.linkRepository.findBySlug(result.slug);
    if (existing !== null) {
      throw new SlugCollisionError(result.slug);
    }
    return result.slug;
  }

  /**
   * Generate a random slug using the injected `RandomBytes` port.
   * Retry on `findBySlug` collision up to `MAX_SLUG_GENERATE_RETRIES`
   * times; throw `SlugGenerationError` (500) on exhaustion.
   *
   * The algorithm mirrors the shared `generateRandomSlug` (54-char
   * alphabet, rejection sampling at byte ≥ 216) so that:
   *  - the entropy is the same (54^7, spec #5);
   *  - the use-case can inject a deterministic `RandomBytes` for
   *    tests of the retry loop.
   */
  private async generateAutoSlugWithRetry(): Promise<Slug> {
    for (let attempt = 0; attempt < MAX_SLUG_GENERATE_RETRIES; attempt += 1) {
      const candidate = drawSlug(this.deps.randomBytes);
      const existing = await this.deps.linkRepository.findBySlug(candidate);
      if (existing === null) {
        return candidate as Slug;
      }
    }
    throw new SlugGenerationError();
  }
}

/**
 * Draw one 7-char slug from the 54-char alphabet using the injected
 * `RandomBytes` port. Rejection sampling keeps the distribution
 * uniform (256 - (256 mod 54) = 216 accepted bytes).
 *
 * Exported (not just private) so the test file can pre-compute the
 * exact slug the deterministic RNG will produce when seeding collision
 * fixtures. This is the only consumer of the helper outside the
 * use-case; if more callers appear, promote it to a domain value
 * object.
 */
export function drawSlug(rng: RandomBytes): string {
  const out: string[] = [];
  while (out.length < AUTO_SLUG_LENGTH) {
    const buf = rng.randomBytes(AUTO_SLUG_LENGTH * 2);
    for (let i = 0; i < buf.length && out.length < AUTO_SLUG_LENGTH; i += 1) {
      const byte = buf[i]!;
      if (byte < REJECT_THRESHOLD) {
        out.push(AUTO_SLUG_ALPHABET[byte % AUTO_SLUG_ALPHABET.length]!);
      }
    }
  }
  return out.join('');
}
