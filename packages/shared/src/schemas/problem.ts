/**
 * Zod schema for RFC 7807 problem-details error responses.
 *
 * `type` defaults to `about:blank` per RFC 7807 §4.2. We use the standard
 * `application/problem+json` content type at the presentation layer
 * (Fastify error-mapper).
 *
 * Spec: design §5 (`problemDetailsSchema`).
 * RFC:   https://datatracker.ietf.org/doc/html/rfc7807
 */
import { z } from 'zod';

export const problemDetailsSchema = z.object({
  type: z.string().default('about:blank'),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  instance: z.string().optional(),
});
export type ProblemDetails = z.infer<typeof problemDetailsSchema>;
