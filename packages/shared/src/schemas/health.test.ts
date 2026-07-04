import { describe, it, expect } from 'vitest';
import { healthResponseSchema } from './health.js';

describe('healthResponseSchema', () => {
  it('parses a healthy response (status=ok, db=connected)', () => {
    const result = healthResponseSchema.safeParse({ status: 'ok', db: 'connected' });
    expect(result.success).toBe(true);
  });

  it('parses a degraded response (status=degraded, db=disconnected)', () => {
    const result = healthResponseSchema.safeParse({ status: 'degraded', db: 'disconnected' });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown status', () => {
    const result = healthResponseSchema.safeParse({ status: 'down', db: 'connected' });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown db value', () => {
    const result = healthResponseSchema.safeParse({ status: 'ok', db: 'sleeping' });
    expect(result.success).toBe(false);
  });
});
