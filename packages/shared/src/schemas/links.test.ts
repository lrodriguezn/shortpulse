import { describe, it, expect } from 'vitest';
import { createLinkSchema, listLinksQuerySchema, linkResponseSchema } from './links.js';

describe('createLinkSchema', () => {
  it('parses a minimal valid payload (only original_url)', () => {
    const result = createLinkSchema.safeParse({ original_url: 'https://example.com' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.original_url).toBe('https://example.com');
      expect(result.data.slug).toBeUndefined();
    }
  });

  it('parses a valid payload with a custom slug', () => {
    const result = createLinkSchema.safeParse({
      original_url: 'https://example.com',
      slug: 'my-link',
    });
    expect(result.success).toBe(true);
  });

  it('accepts http URLs (not just https)', () => {
    const result = createLinkSchema.safeParse({ original_url: 'http://example.com' });
    expect(result.success).toBe(true);
  });

  it('rejects ftp:// URLs even when zod.url() would accept them', () => {
    const result = createLinkSchema.safeParse({ original_url: 'ftp://example.com' });
    expect(result.success).toBe(false);
  });

  it('rejects file:// URLs', () => {
    const result = createLinkSchema.safeParse({ original_url: 'file:///etc/passwd' });
    expect(result.success).toBe(false);
  });

  it('rejects data: URLs', () => {
    const result = createLinkSchema.safeParse({
      original_url: 'data:text/plain;base64,SGVsbG8=',
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-URL strings', () => {
    const result = createLinkSchema.safeParse({ original_url: 'not-a-url' });
    expect(result.success).toBe(false);
  });

  it('rejects missing original_url', () => {
    const result = createLinkSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects an invalid slug (uppercase)', () => {
    const result = createLinkSchema.safeParse({
      original_url: 'https://example.com',
      slug: 'MyLink',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a slug with a leading hyphen', () => {
    const result = createLinkSchema.safeParse({
      original_url: 'https://example.com',
      slug: '-bad',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a slug shorter than 3 chars', () => {
    const result = createLinkSchema.safeParse({
      original_url: 'https://example.com',
      slug: 'ab',
    });
    expect(result.success).toBe(false);
  });
});

describe('listLinksQuerySchema', () => {
  it('applies defaults when no params are passed', () => {
    const result = listLinksQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.page_size).toBe(20);
      expect(result.data.sortBy).toBe('created_at');
      expect(result.data.sortDir).toBe('desc');
      expect(result.data.search).toBeUndefined();
    }
  });

  it('coerces page and page_size from query strings (numbers)', () => {
    const result = listLinksQuerySchema.safeParse({ page: '3', page_size: '50' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(3);
      expect(result.data.page_size).toBe(50);
    }
  });

  it('rejects page = 0', () => {
    const result = listLinksQuerySchema.safeParse({ page: '0' });
    expect(result.success).toBe(false);
  });

  it('rejects negative page', () => {
    const result = listLinksQuerySchema.safeParse({ page: '-1' });
    expect(result.success).toBe(false);
  });

  it('rejects page_size > 100', () => {
    const result = listLinksQuerySchema.safeParse({ page_size: '101' });
    expect(result.success).toBe(false);
  });

  it('rejects page_size = 0', () => {
    const result = listLinksQuerySchema.safeParse({ page_size: '0' });
    expect(result.success).toBe(false);
  });

  it('accepts page_size = 100 (the upper bound)', () => {
    const result = listLinksQuerySchema.safeParse({ page_size: '100' });
    expect(result.success).toBe(true);
  });

  it('accepts all sortBy enum values', () => {
    for (const sortBy of ['created_at', 'original_url', 'slug', 'click_count']) {
      const result = listLinksQuerySchema.safeParse({ sortBy });
      expect(result.success).toBe(true);
    }
  });

  it('rejects an unknown sortBy value', () => {
    const result = listLinksQuerySchema.safeParse({ sortBy: 'id' });
    expect(result.success).toBe(false);
  });

  it('accepts asc and desc for sortDir', () => {
    expect(listLinksQuerySchema.safeParse({ sortDir: 'asc' }).success).toBe(true);
    expect(listLinksQuerySchema.safeParse({ sortDir: 'desc' }).success).toBe(true);
  });

  it('rejects an unknown sortDir value', () => {
    const result = listLinksQuerySchema.safeParse({ sortDir: 'random' });
    expect(result.success).toBe(false);
  });
});

describe('linkResponseSchema', () => {
  const validResponse = {
    id: '11111111-2222-4333-8444-555555555555',
    original_url: 'https://example.com',
    slug: 'my-link',
    short_url: 'http://localhost:3000/my-link',
    created_at: '2026-07-04T12:00:00.000Z',
    click_count: 0,
    deleted_at: null,
  };

  it('parses a valid response (deleted_at = null)', () => {
    const result = linkResponseSchema.safeParse(validResponse);
    expect(result.success).toBe(true);
  });

  it('parses a valid response with deleted_at set', () => {
    const result = linkResponseSchema.safeParse({
      ...validResponse,
      deleted_at: '2026-07-05T12:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a non-UUID id', () => {
    const result = linkResponseSchema.safeParse({ ...validResponse, id: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('rejects a non-ISO created_at', () => {
    const result = linkResponseSchema.safeParse({ ...validResponse, created_at: 'yesterday' });
    expect(result.success).toBe(false);
  });

  it('rejects a non-numeric click_count', () => {
    const result = linkResponseSchema.safeParse({ ...validResponse, click_count: '0' });
    expect(result.success).toBe(false);
  });
});
