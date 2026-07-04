# Links Specification

## Purpose

Define link lifecycle behavior for the public URL shortener: creation, listing, soft-deletion, redirect, and slug rules.

## Requirements

1. **Create link.** The system MUST accept `POST /api/links` with `original_url` (required, valid HTTP/HTTPS URL) and optional `slug`. If `slug` is omitted, the system SHALL auto-generate a 7-character slug. If `slug` is provided, the system MUST validate it: normalized to lowercase, 3–20 characters, charset `[a-z0-9-]`, and not in the reserved route set. On custom-slug collision, the system MUST return HTTP 409 with body `"Ese slug ya existe, prueba otro"`. On success, the system MUST return HTTP 201 with `{id, original_url, slug, short_url, created_at}`, where `short_url = `${BASE_URL}/${slug}``.

2. **List links.** The system MUST support `GET /api/links` with pagination (`page` ≥ 1, `page_size` default 20, maximum 100), search (substring match on `original_url` or `slug`), and sorting (`created_at`, `original_url`, `slug`, `click_count`; `asc` or `desc`). The response MUST be `{data, total, page, page_size}`. The list MUST exclude soft-deleted links and MUST include `click_count` per link.

3. **Delete link.** The system MUST soft-delete on `DELETE /api/links/:id` by setting `deleted_at`. Deleting a non-existent id MUST return 404. Deleting an already-deleted link MUST be idempotent and return 204. After deletion, redirect for that slug MUST return 404.

4. **Redirect.** The system MUST handle `GET /:slug` case-insensitively. If the slug is found and not deleted, it MUST record an analytics event synchronously, then return HTTP 302 with `Location: original_url`. If the slug is not found or is deleted, it MUST return 404. Reserved routes MUST NOT trigger redirect logic.

5. **Slug generation.** Auto-generated slugs MUST use `crypto.randomBytes`, produce exactly 7 characters, and draw from a 54-character alphabet that excludes ambiguous characters (`0`, `O`, `1`, `l`). On unique-constraint collision, the system MUST retry up to 3 times; after 3 failures it MUST return HTTP 500.

6. **Slug validation rules.** Provided slugs MUST be normalized to lowercase, length 3–20, charset `[a-z0-9-]`, MUST match the regex `^(?!-)[a-z0-9-]{3,20}(?<!-)$` (i.e. MUST NOT start or end with a hyphen — cleaner UX and avoids address-bar ambiguity), and MUST NOT be in the reserved set `{analytics, api, health, admin, links, www, favicon, ""}` (empty string represents the root route).

## Scenarios

### Scenario: Create link with auto-generated slug

- GIVEN `original_url` is `https://example.com`
- WHEN `POST /api/links` is called without `slug`
- THEN response status is 201 and body contains `id`, `original_url`, a 7-character `slug`, `short_url`, and `created_at`

### Scenario: Create link with valid custom slug

- GIVEN `original_url` is `https://example.com` and `slug` is `my-link`
- WHEN `POST /api/links` is called
- THEN response status is 201, `slug` equals `my-link`, and `short_url` equals `${BASE_URL}/my-link`

### Scenario: Reject invalid URL

- GIVEN `original_url` is `not-a-url`
- WHEN `POST /api/links` is called
- THEN response status is 400

### Scenario: Reject custom slug collision

- GIVEN slug `taken` already exists
- WHEN `POST /api/links` is called with `slug=taken`
- THEN response status is 409 and body is `"Ese slug ya existe, prueba otro"`

### Scenario: Reject reserved slug

- GIVEN `slug` is `analytics`
- WHEN `POST /api/links` is called
- THEN response status is 409

### Scenario: Reject case-variant collision

- GIVEN slug `taken` exists
- WHEN `POST /api/links` is called with `slug=TAKEN`
- THEN response status is 409

### Scenario: Reject invalid slug length

- GIVEN `slug` is `ab`
- WHEN `POST /api/links` is called
- THEN response status is 400

### Scenario: List links with pagination

- GIVEN 25 non-deleted links exist
- WHEN `GET /api/links?page=2&page_size=10` is called
- THEN response contains 10 items, `total` is 25, `page` is 2, and `page_size` is 10

### Scenario: List excludes deleted links

- GIVEN a link is soft-deleted
- WHEN `GET /api/links` is called
- THEN the deleted link is absent from `data`

### Scenario: Soft-delete link

- GIVEN link with id `uuid` exists
- WHEN `DELETE /api/links/uuid` is called
- THEN response status is 204 and subsequent `GET /slug` returns 404

### Scenario: Delete already-deleted link

- GIVEN link with id `uuid` is already soft-deleted
- WHEN `DELETE /api/links/uuid` is called
- THEN response status is 204

### Scenario: Redirect records analytics and returns 302

- GIVEN link with slug `abc` points to `https://example.com`
- WHEN `GET /abc` is called
- THEN an analytics event is recorded and response status is 302 with `Location: https://example.com`

### Scenario: Redirect for deleted slug returns 404

- GIVEN link with slug `abc` is soft-deleted
- WHEN `GET /abc` is called
- THEN response status is 404

### Scenario: Reserved route does not redirect

- GIVEN `GET /analytics` is called
- THEN it is handled by the analytics app route, not the redirect handler
