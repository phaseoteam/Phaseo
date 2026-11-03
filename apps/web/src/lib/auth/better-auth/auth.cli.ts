/**
 * Entry point for Better Auth's schema CLI only (the runtime instance is server.ts, which imports "server-only"):
 *
 *   cd apps/web && PLANETSCALE_DATABASE_URL=postgres://… pnpm dlx auth@1.7.13 generate \
 *     --config src/lib/auth/better-auth/auth.cli.ts --output ../../database/planetscale/migrations/0001_auth.generated.sql
 *
 * (The CLI isn't a dependency; keep its version equal to better-auth's.) `generate` introspects the target: against
 * an empty Postgres with schema `auth` it emits the whole schema, to fold into 0001_auth.sql by hand; against a
 * database with 0001 applied it should print "Your schema is already up to date" (the drift check). See
 * MIGRATION-NOTES.md, "Regenerating 0001_auth.sql".
 */
import { betterAuth } from "better-auth";
import { Pool } from "pg";

import { authPoolConfig } from "./database";
import { createAuthOptions } from "./options";

export const auth = betterAuth(createAuthOptions({ pool: new Pool(authPoolConfig()) }, []));
