# Health Specification

## Purpose

Define the public healthcheck endpoint used by Docker HEALTHCHECK and Dokploy to verify application and database status.

## Requirements

1. **Healthcheck.** The system MUST expose `GET /health` without authentication. When the database is reachable, the system MUST return HTTP 200 with body `{status:"ok", db:"connected"}`. When the database is unreachable, the system MUST return HTTP 503 with body `{status:"degraded", db:"disconnected"}`.

## Scenarios

### Scenario: Healthcheck when database is connected

- GIVEN the database connection is healthy
- WHEN `GET /health` is called
- THEN response status is 200 and body is `{status:"ok", db:"connected"}`

### Scenario: Healthcheck when database is disconnected

- GIVEN the database connection is failing
- WHEN `GET /health` is called
- THEN response status is 503 and body is `{status:"degraded", db:"disconnected"}`
