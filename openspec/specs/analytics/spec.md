# Analytics Specification

## Purpose

Define analytics event recording, querying, and aggregation for link redirects.

## Requirements

1. **Event recording.** On every successful redirect, the system MUST synchronously record one analytics event before returning HTTP 302. Each event MUST contain `link_id`, `timestamp` (UTC), `ip`, `user_agent`, `referer`, `country`, `city`, and `browser`. `timestamp` MUST be stored as `TIMESTAMPTZ` in UTC. `ip` MUST be stored as `TEXT`. `country`, `city`, `user_agent`, `referer`, and `browser` MUST be stored as `TEXT` and MAY be null or empty when unknown. `country` and `city` MUST be resolved via MaxMind GeoLite2. `browser` MUST be parsed from `user_agent` via `ua-parser-js`.

2. **Summary KPIs.** `GET /api/analytics/summary` MUST return `{total_links, total_clicks, clicks_today, clicks_last_7_days}`. `total_links` counts non-deleted links. `total_clicks` counts all analytics events, including events for soft-deleted links. `clicks_today` counts events since 00:00 UTC of the current day. `clicks_last_7_days` counts events in the rolling 168 hours before the request timestamp.

3. **Events query.** `GET /api/analytics` MUST support pagination (`page` ≥ 1, `page_size` default 20, maximum 100) and filters `link_id`, `date_from`, `date_to` (UTC ISO8601), and `country`. The response MUST be `{data, total, page, page_size}` sorted by `timestamp` descending by default. Each row MUST display the link slug or `"(deleted link)"` when the link is soft-deleted.

4. **Timeseries.** `GET /api/analytics/timeseries` MUST accept `granularity=day|week|month` and optional `date_from`/`date_to` (UTC ISO8601). When omitted, the range MUST default to the last 30 days. Buckets MUST use UTC boundaries: day starts at 00:00 UTC, week starts Monday 00:00 UTC, month starts 1st 00:00 UTC. Response MUST be `{data: [{bucket_start, count}]}`.

5. **Retention after soft-delete.** Analytics events for soft-deleted links MUST remain included in totals, events query results, and timeseries. The link identifier MUST render as `"(deleted link)"` when the associated link is soft-deleted.

## Scenarios

### Scenario: Record event on redirect

- GIVEN link `abc` exists and points to `https://example.com`
- WHEN `GET /abc` is called with IP `1.2.3.4`, User-Agent `Mozilla/5.0`, and Referer `https://google.com`
- THEN an analytics row is inserted with `link_id`, UTC `timestamp`, `ip=1.2.3.4`, `user_agent`, `referer`, `country`, `city`, and `browser`

### Scenario: Geo fields may be unknown

- GIVEN MaxMind cannot resolve the client IP
- WHEN `GET /abc` is called
- THEN the analytics event is still recorded with `country` and `city` as null

### Scenario: Summary includes deleted-link clicks

- GIVEN link `abc` had 5 clicks then was soft-deleted
- WHEN `GET /api/analytics/summary` is called
- THEN `total_clicks` is 5 and `total_links` excludes the deleted link

### Scenario: Query events with filters

- GIVEN analytics events exist for multiple links and countries
- WHEN `GET /api/analytics?link_id=<id>&country=US&page=1` is called
- THEN response contains only matching rows, sorted by timestamp descending

### Scenario: Deleted link renders as deleted link

- GIVEN link `abc` is soft-deleted and has analytics events
- WHEN `GET /api/analytics` is called
- THEN event rows show `"(deleted link)"` instead of slug `abc`

### Scenario: Timeseries daily buckets

- GIVEN clicks occurred on 2026-07-01 and 2026-07-02 UTC
- WHEN `GET /api/analytics/timeseries?granularity=day` is called
- THEN response contains separate buckets for each day with correct counts

### Scenario: Timeseries default range

- GIVEN no `date_from` or `date_to` is provided
- WHEN `GET /api/analytics/timeseries?granularity=day` is called
- THEN buckets cover the last 30 days
