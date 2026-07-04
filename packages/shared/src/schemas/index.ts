/**
 * Barrel re-export for all shared Zod schemas.
 *
 * Consumers (`@shortpulse/backend` Fastify routes, `@shortpulse/frontend`
 * React Hook Form resolvers) import from this single entry point to keep
 * the FE/BE contract drift-free.
 */
export * from './links.js';
export * from './analytics.js';
export * from './health.js';
export * from './problem.js';
