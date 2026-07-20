import { createClient } from "@supabase/supabase-js";
import type { Env } from "@/env";

export function getDataClient(env: Env) {
	const url = (env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL)?.trim();
	const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
	if (!url || !serviceRoleKey) {
		throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
	}

	return createClient(url, serviceRoleKey, {
		auth: { persistSession: false, autoRefreshToken: false },
	});
}

export function getAuthenticatedDataClient(env: Env, request: Request) {
	const authorization = request.headers.get("authorization")?.trim();
	const token = authorization?.startsWith("Bearer ")
		? authorization.slice("Bearer ".length).trim()
		: "";
	const url = (env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL)?.trim();
	const anonKey = (env.SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY)?.trim();
	if (!url || !anonKey || !token) return null;

	return createClient(url, anonKey, {
		auth: { persistSession: false, autoRefreshToken: false },
		global: { headers: { Authorization: `Bearer ${token}` } },
	});
}
