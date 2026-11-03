import "server-only";

import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";

import { getAuthPool } from "./database";
import { createAuthOptions } from "./options";

/**
 * Phaseo's Better Auth instance for the Next app (route handler, server components, server actions).
 *
 * Built on first use, not at import: `next build` imports route modules while collecting page data, when
 * PLANETSCALE_DATABASE_URL and BETTER_AUTH_SECRET aren't necessarily set. `nextCookies()` must stay the last plugin
 * so server actions that call `auth.api.*` can set cookies.
 */
function createPhaseoAuth() {
	return betterAuth(createAuthOptions({ pool: getAuthPool() }, [nextCookies()]));
}

export type PhaseoAuth = ReturnType<typeof createPhaseoAuth>;
export type PhaseoSession = PhaseoAuth["$Infer"]["Session"];

let instance: PhaseoAuth | undefined;

export function getAuth(): PhaseoAuth {
	instance ??= createPhaseoAuth();
	return instance;
}
