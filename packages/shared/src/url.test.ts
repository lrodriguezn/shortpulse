import { describe, it, expect } from 'vitest';
import { isValidHttpsUrl } from './url.js';

describe('isValidHttpsUrl', () => {
  describe('accepts http and https URLs', () => {
    it('accepts a valid https URL', () => {
      expect(isValidHttpsUrl('https://example.com')).toBe(true);
    });

    it('accepts a valid http URL', () => {
      expect(isValidHttpsUrl('http://example.com')).toBe(true);
    });

    it('accepts an https URL with a path', () => {
      expect(isValidHttpsUrl('https://example.com/path/to/page')).toBe(true);
    });

    it('accepts an https URL with a query string', () => {
      expect(isValidHttpsUrl('https://example.com/?a=1&b=2')).toBe(true);
    });

    it('accepts an https URL with a port', () => {
      expect(isValidHttpsUrl('https://example.com:8443/api')).toBe(true);
    });

    it('accepts an https URL with a subdomain', () => {
      expect(isValidHttpsUrl('https://www.example.com')).toBe(true);
    });
  });

  describe('rejects non-http(s) protocols', () => {
    it('rejects ftp://', () => {
      expect(isValidHttpsUrl('ftp://example.com')).toBe(false);
    });

    it('rejects file://', () => {
      expect(isValidHttpsUrl('file:///etc/passwd')).toBe(false);
    });

    it('rejects data: URLs', () => {
      expect(isValidHttpsUrl('data:text/plain;base64,SGVsbG8=')).toBe(false);
    });

    it('rejects mailto: links', () => {
      expect(isValidHttpsUrl('mailto:[email protected]')).toBe(false);
    });

    it('rejects ws:// and wss:// (websockets)', () => {
      expect(isValidHttpsUrl('ws://example.com')).toBe(false);
      expect(isValidHttpsUrl('wss://example.com')).toBe(false);
    });
  });

  describe('rejects invalid input', () => {
    it('rejects an empty string', () => {
      expect(isValidHttpsUrl('')).toBe(false);
    });

    it('rejects a non-URL string', () => {
      expect(isValidHttpsUrl('not-a-url')).toBe(false);
    });

    it('rejects plain garbage', () => {
      expect(isValidHttpsUrl('!!!@@@###')).toBe(false);
    });

    it('rejects a URL missing the protocol', () => {
      expect(isValidHttpsUrl('example.com')).toBe(false);
    });

    it('rejects whitespace-only input', () => {
      expect(isValidHttpsUrl('   ')).toBe(false);
    });
  });

  describe('stays in sync with createLinkSchema', () => {
    // The refine in createLinkSchema.original_url uses the same rule
    // (`/^https?:\/\//.test(u)`) after zod's url() check. These are the
    // matching positive and negative cases — both should agree.
    it('matches createLinkSchema for the spec test set', async () => {
      const { createLinkSchema } = await import('./schemas/links.js');
      const cases = [
        'https://example.com',
        'http://example.com',
        'ftp://example.com',
        'file:///etc/passwd',
        'not-a-url',
        '',
      ];
      for (const u of cases) {
        const isValid = isValidHttpsUrl(u);
        const parsed = createLinkSchema.safeParse({ original_url: u });
        expect(parsed.success).toBe(isValid);
      }
    });
  });
});
