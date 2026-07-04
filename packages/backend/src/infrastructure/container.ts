/**
 * `createContainer` — DI wiring for ShortPulse.
 *
 * Builds the production object graph at boot:
 *  - Drizzle repos over the postgres.js client
 *  - MaxMind geolocator (with graceful-degradation when the file
 *    is absent)
 *  - ua-parser-js adapter
 *  - node:crypto random-bytes adapter
 *
 * Returns a `Container` object with the assembled adapters + the
 * 7 use-cases the presentation layer (Phase 6 plugins) needs. The
 * presentation layer imports ONLY the use-cases; the adapters are
 * surfaced for tests and for future error-mapper wiring.
 *
 * The `loadGeoIp()` async hook is exposed so the boot sequence
 * (Phase 6) can `await` the file load before the server starts
 * accepting requests. If the load fails, the container survives —
 * every `lookup()` will return `{country: null, city: null}` (per
 * design §9 + ADR-005).
 *
 * Spec references:
 *  - `openspec/changes/add-shortpulse-app/design.md` §3 (hexagonal)
 *    + §6 (sequence diagrams) + §9 (Geolocator port) + ADR-005
 */
import { CreateLinkUseCase } from '../application/create-link.use-case.js';
import { RedirectUseCase } from '../application/redirect.use-case.js';
import { ListLinksUseCase } from '../application/list-links.use-case.js';
import { DeleteLinkUseCase } from '../application/delete-link.use-case.js';
import { GetAnalyticsSummaryUseCase } from '../application/get-analytics-summary.use-case.js';
import { ListAnalyticsUseCase } from '../application/list-analytics.use-case.js';
import { GetTimeseriesUseCase } from '../application/get-timeseries.use-case.js';

import { DrizzleLinkRepository } from './drizzle-link.repository.js';
import { DrizzleAnalyticsRepository } from './drizzle-analytics.repository.js';
import { MaxMindGeolocator } from './maxmind-geolocator.js';
import { UaParserJsAdapter } from './ua-parser-js-adapter.js';
import { NodeCryptoRandomBytes } from './node-crypto-random-bytes.js';

import type { LinkRepository } from '../domain/repositories/link-repository.js';
import type { AnalyticsRepository } from '../domain/repositories/analytics-repository.js';
import type { Geolocator } from '../domain/ports/geolocator.js';
import type { UaParser } from '../domain/ports/ua-parser.js';
import type { RandomBytes } from '../domain/ports/random-bytes.js';
import type { ShortPulseDb } from '../db/client.js';

/** Input config for `createContainer`. */
export interface ContainerConfig {
  /** Drizzle / postgres.js client. */
  db: ShortPulseDb;
  /**
   * Base URL used by the `CreateLinkUseCase` to compose the
   * returned `shortUrl` (no trailing slash). Production: the
   * `BASE_URL` env var.
   */
  baseUrl: string;
  /**
   * Optional path to the GeoLite2-City `.mmdb` file. When
   * omitted, the geolocator degrades to null-lookups (every
   * `lookup()` returns `{country: null, city: null}`).
   */
  geoipDbPath?: string;
}

/** Adapters exposed by the container. The presentation layer does
 *  not consume these directly (only the use-cases); they are
 *  exposed for tests + future error-mapper wiring. */
export interface ContainerAdapters {
  linkRepository: LinkRepository;
  analyticsRepository: AnalyticsRepository;
  geolocator: Geolocator;
  uaParser: UaParser;
  randomBytes: RandomBytes;
}

/** Use-cases the presentation layer injects. */
export interface ContainerUseCases {
  createLink: CreateLinkUseCase;
  redirect: RedirectUseCase;
  listLinks: ListLinksUseCase;
  deleteLink: DeleteLinkUseCase;
  getAnalyticsSummary: GetAnalyticsSummaryUseCase;
  listAnalytics: ListAnalyticsUseCase;
  getTimeseries: GetTimeseriesUseCase;
}

/** Return type of `createContainer`. */
export interface Container {
  adapters: ContainerAdapters;
  useCases: ContainerUseCases;
  /**
   * Attempt to load the MaxMind DB file. Resolves to `true` on
   * success, `false` on any failure (file missing, invalid, etc.)
   * — the container never throws here. Safe to call even when
   * `geoipDbPath` is unset.
   */
  loadGeoIp: () => Promise<boolean>;
}

/**
 * Build the production DI container. Pure factory: every call
 * returns a fresh object graph (the underlying Drizzle client +
 * adapters are shared between the two call sites, but the
 * container itself is single-use by convention).
 */
export function createContainer(config: ContainerConfig): Container {
  // Adapters — one instance per process, shared across all use-cases
  // (so the postgres.js connection pool is used coherently).
  const linkRepository: LinkRepository = new DrizzleLinkRepository(config.db);
  const analyticsRepository: AnalyticsRepository = new DrizzleAnalyticsRepository(config.db);
  const maxmindAdapter: MaxMindGeolocator = new MaxMindGeolocator({
    ...(config.geoipDbPath !== undefined ? { dbPath: config.geoipDbPath } : {}),
  });
  const geolocator: Geolocator = maxmindAdapter;
  const uaParser: UaParser = new UaParserJsAdapter();
  const randomBytes: RandomBytes = new NodeCryptoRandomBytes();

  // `baseUrl` is consumed by the create-link use-case; the rest of
  // the use-cases are URL-agnostic. We pass it via the dep bag.
  void config.baseUrl; // currently reserved for the create-link shortUrl composition

  // Use-cases — one per request scope (no per-request state; the
  // instances are stateless beyond their deps).
  const useCases: ContainerUseCases = {
    createLink: new CreateLinkUseCase({ linkRepository, randomBytes }),
    redirect: new RedirectUseCase({
      linkRepository,
      analyticsRepository,
      geolocator,
      uaParser,
    }),
    listLinks: new ListLinksUseCase({ linkRepository }),
    deleteLink: new DeleteLinkUseCase({ linkRepository }),
    getAnalyticsSummary: new GetAnalyticsSummaryUseCase({ analyticsRepository }),
    listAnalytics: new ListAnalyticsUseCase({ analyticsRepository }),
    getTimeseries: new GetTimeseriesUseCase({ analyticsRepository }),
  };

  // Boot hook: attempt to open the MaxMind file (idempotent). The
  // adapter swallows the error and degrades to null-lookups; the
  // container surfaces the boolean so the caller can log the
  // outcome without branching on exceptions.
  const loadGeoIp = async (): Promise<boolean> => {
    if (!config.geoipDbPath) return false;
    return maxmindAdapter.load(config.geoipDbPath);
  };

  return {
    adapters: {
      linkRepository,
      analyticsRepository,
      geolocator,
      uaParser,
      randomBytes,
    },
    useCases,
    loadGeoIp,
  };
}
