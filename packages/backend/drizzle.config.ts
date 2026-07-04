/**
 * Drizzle Kit configuration.
 *
 * Used by `pnpm --filter backend db:generate` (and `db:migrate` / `db:studio`).
 * The schema source is `src/db/schema.ts`; the migration output is `drizzle/`
 * at the package root. The folder is committed to git so every checkout
 * can apply the same SQL.
 *
 * `dotenv` is loaded eagerly so drizzle-kit can read DATABASE_URL when
 * invoked from the CLI (e.g. during local dev or CI). The `pg`-driver
 * field is not used; we use `postgres-js` so `driver: 'pg'` is omitted.
 */

import { defineConfig } from 'drizzle-kit';
import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';

// Load the repo-root .env if it exists. `override: false` means
// process.env wins over the file (CI can still inject DATABASE_URL).
loadDotenv({ path: resolve(__dirname, '..', '..', '.env') });

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  // Driver is inferred from `dialect: 'postgresql'` + the runtime pg/postgres
  // client you use. drizzle-kit only needs the schema + out path; the
  // generated migration is driver-agnostic SQL.
  dbCredentials: {
    url:
      process.env['DATABASE_URL'] ?? 'postgres://shortpulse:shortpulse@localhost:5432/shortpulse',
  },
  verbose: true,
  strict: true,
});
