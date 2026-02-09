import { createBrowserClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createClient() {
	const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
	const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

	// Many server fetchers import this helper; avoid browser-only client initialization on the server.
	if (typeof window === "undefined") {
		return createSupabaseClient(url, anonKey, {
			auth: { persistSession: false, autoRefreshToken: false },
		});
	}

	return createBrowserClient(url, anonKey);
}
