import { createBrowserClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase Auth in the browser (and in shared fetchers on the server). Every caller uses only `.auth`
 * (getSession for the Bearer token sent to apps/web-api, onAuthStateChange, passkeys, MFA, password reset);
 * none reads data through it. Keep it that way: a browser cannot reach PlanetScale, so under
 * DATABASE_PROVIDER=planetscale data must come from server routes (apps/web-api or Next route handlers),
 * and this client is not switched. Under AUTH_PROVIDER=better-auth the callers move to
 * src/lib/auth/better-auth/client.ts (MIGRATION-NOTES.md there).
 */
export function createClient() {
	const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
	const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

	// Many server fetchers import this helper; avoid browser-only client initialization on the server.
	if (typeof window === "undefined") {
		return createSupabaseClient(url, anonKey, {
			auth: {
				persistSession: false,
				autoRefreshToken: false,
				experimental: { passkey: true },
			},
		});
	}

	return createBrowserClient(url, anonKey, {
		auth: { experimental: { passkey: true } },
	});
}
