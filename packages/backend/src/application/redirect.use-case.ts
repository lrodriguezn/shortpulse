/**
 * `RedirectUseCase` (Phase 4 application layer).
 *
 * Resolves a slug to its `originalUrl` and records a synchronous
 * analytics event (per design ADR-002 — sync write keeps the code
 * path simple at the cost of 5-15ms per redirect).
 *
 * Flow (per design §6 + spec links #4):
 *   1. Normalise the slug to lowercase (the storage layer stores
 *      lowercased slugs; the DB unique index is case-insensitive).
 *   2. `LinkRepository.findBySlug` → 404 on miss or soft-deleted.
 *   3. `Geolocator.lookup(ip)` → `{country, city}` (may be null/null
 *      on MaxMind miss — degraded mode, see design §9).
 *   4. `UaParser.parse(userAgent)` → `{browser}` (may be null on
 *      unrecognised UA).
 *   5. Build the `AnalyticsEvent` and `AnalyticsRepository.save` it.
 *   6. Return `{originalUrl}` — the controller issues the 302.
 *
 * The use-case is intentionally synchronous inside `execute` (no
 * `Promise.all` for the two ports) because the cost is negligible
 * and the code is easier to reason about linearly. If redirect
 * latency becomes a problem, the analytics write can be moved to a
 * fire-and-forget queue (see proposal risk row).
 *
 * Spec references:
 *  - `openspec/specs/links/spec.md` requirements #4, #5
 *  - `openspec/changes/add-shortpulse-app/design.md` §6 + §9 + ADR-002
 */
import { randomUUID } from 'node:crypto';

import { createAnalyticsEvent } from '../domain/entities/analytics-event.js';
import { LinkNotFoundError } from '../domain/errors.js';
import type { LinkRepository } from '../domain/repositories/link-repository.js';
import type { AnalyticsRepository } from '../domain/repositories/analytics-repository.js';
import type { Geolocator } from '../domain/ports/geolocator.js';
import type { UaParser } from '../domain/ports/ua-parser.js';

/** Use-case input (untrusted — from the controller / Fastify handler). */
export interface RedirectInput {
  /** Slug from the request path. Will be lowercased. */
  slug: string;
  /** Client IP — typically from Fastify `request.ip` (honours the
   *  trusted-proxy chain). */
  ip: string;
  /** Raw `User-Agent` header. `null` when the client did not send one. */
  userAgent: string | null;
  /** Raw `Referer` header. `null` when the client did not send one. */
  referer: string | null;
}

/** Use-case output — the controller uses `originalUrl` as the
 *  `Location` header on a 302 response. */
export interface RedirectOutput {
  originalUrl: string;
}

/** Dependency bag — injected by `container.ts` (Phase 6). */
export interface RedirectDeps {
  linkRepository: LinkRepository;
  analyticsRepository: AnalyticsRepository;
  geolocator: Geolocator;
  uaParser: UaParser;
}

export class RedirectUseCase {
  constructor(private readonly deps: RedirectDeps) {}

  async execute(input: RedirectInput): Promise<RedirectOutput> {
    // 1. Normalise the slug. The storage layer lowercases on insert
    //    (design §4) so we lowercase here to match the indexed column.
    const slug = input.slug.toLowerCase();

    // 2. Lookup the link — missing OR soft-deleted are both 404
    //    (spec links #3, #4). The contract mock excludes soft-deleted
    //    from `findBySlug` (see `domain/repositories/link-repository.ts`).
    const link = await this.deps.linkRepository.findBySlug(slug);
    if (link === null) {
      throw new LinkNotFoundError(slug);
    }

    // 3. Resolve geo + browser. Both ports are required to never
    //    throw (per their contracts) — they return nulls on miss.
    const geo = this.deps.geolocator.lookup(input.ip);
    const ua =
      input.userAgent === null
        ? { browser: null as string | null }
        : this.deps.uaParser.parse(input.userAgent);

    // 4. Build + persist the analytics event (synchronous, per ADR-002).
    const event = createAnalyticsEvent({
      id: randomUUID(),
      linkId: link.id,
      timestamp: new Date(),
      ip: input.ip,
      userAgent: input.userAgent,
      referer: input.referer,
      country: geo.country,
      city: geo.city,
      browser: ua.browser,
    });
    await this.deps.analyticsRepository.save(event);

    // 5. Return the originalUrl — the controller issues 302.
    return { originalUrl: link.originalUrl };
  }
}
