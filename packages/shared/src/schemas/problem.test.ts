import { describe, it, expect } from 'vitest';
import { problemDetailsSchema } from './problem.js';

describe('problemDetailsSchema (RFC 7807)', () => {
  it('parses a minimal problem document (no detail, no instance)', () => {
    const result = problemDetailsSchema.safeParse({
      type: 'about:blank',
      title: 'Bad Request',
      status: 400,
    });
    expect(result.success).toBe(true);
  });

  it('parses a full problem document with detail and instance', () => {
    const result = problemDetailsSchema.safeParse({
      type: 'about:blank',
      title: 'Slug conflict',
      status: 409,
      detail: 'Ese slug ya existe, prueba otro',
      instance: '/api/links',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a non-integer status', () => {
    const result = problemDetailsSchema.safeParse({
      type: 'about:blank',
      title: 'Bad',
      status: '400',
    });
    expect(result.success).toBe(false);
  });

  it('rejects when required fields are missing', () => {
    const result = problemDetailsSchema.safeParse({ type: 'about:blank' });
    expect(result.success).toBe(false);
  });
});
