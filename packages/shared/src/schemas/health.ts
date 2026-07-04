/**
 * Zod schema for `GET /health`.
 *
 * Returns `{ status: 'ok' | 'degraded', db: 'connected' | 'disconnected' }`.
 * HTTP status is 200 when both are healthy, 503 when either is not.
 *
 * Spec: `openspec/specs/health/spec.md` + design §5 endpoint #8.
 */
import { z } from 'zod';

export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  db: z.enum(['connected', 'disconnected']),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;
