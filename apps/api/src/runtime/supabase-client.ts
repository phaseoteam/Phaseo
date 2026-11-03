// Service-role Supabase client built from only the pieces the gateway uses.
// Why: supabase-js's createClient also constructs realtime, storage and functions clients (and bundles
// phoenix), ~300 KiB the Worker parses on every cold start for features the gateway never calls.
// How: the same PostgrestClient and auth-js AuthClient supabase-js composes, with the same URLs, headers
// (apikey + Bearer service key) and session settings. Types stay supabase-js's, so call sites are unchanged.
import { AuthClient } from "@supabase/auth-js";
import { PostgrestClient } from "@supabase/postgrest-js";
import type { SupabaseClient } from "@supabase/supabase-js";

/** The parts of SupabaseClient the gateway uses. Anything else (storage, channel, functions) is a type error. */
export type GatewaySupabaseClient = Pick<SupabaseClient, "from" | "rpc" | "schema" | "auth">;

export type GatewaySupabaseClientOptions = {
	auth?: { autoRefreshToken?: boolean; persistSession?: boolean };
	global?: { fetch?: typeof fetch };
};

const CLIENT_INFO = { "X-Client-Info": "phaseo-gateway (postgrest-js, auth-js)" };

export function createClient(supabaseUrl: string, serviceKey: string, options: GatewaySupabaseClientOptions = {}): GatewaySupabaseClient {
	const trimmed = supabaseUrl?.trim();
	if (!trimmed) throw new Error("supabaseUrl is required.");
	if (!/^https?:\/\//i.test(trimmed)) throw new Error("Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL.");
	if (!serviceKey) throw new Error("supabaseKey is required.");
	const baseUrl = new URL(trimmed.endsWith("/") ? trimmed : `${trimmed}/`);
	const baseFetch = options.global?.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));

	// supabase-js's fetchWithAuth: without a user session the access token is the key itself.
	const restFetch: typeof fetch = (input, init) => {
		const headers = new Headers(init?.headers);
		if (!headers.has("apikey")) headers.set("apikey", serviceKey);
		if (!headers.has("Authorization")) headers.set("Authorization", `Bearer ${serviceKey}`);
		return baseFetch(input, { ...init, headers });
	};

	const rest = new PostgrestClient(new URL("rest/v1", baseUrl).href, {
		headers: { ...CLIENT_INFO },
		schema: "public",
		fetch: restFetch,
	});
	const auth = new AuthClient({
		url: new URL("auth/v1", baseUrl).href,
		headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, ...CLIENT_INFO },
		storageKey: `sb-${baseUrl.hostname.split(".")[0]}-auth-token`,
		autoRefreshToken: options.auth?.autoRefreshToken ?? false,
		persistSession: options.auth?.persistSession ?? false,
		detectSessionInUrl: false,
		flowType: "implicit",
		fetch: baseFetch,
	});

	const client = {
		from: (relation: string) => rest.from(relation),
		schema: (schema: string) => rest.schema(schema),
		rpc: (fn: string, args?: Record<string, unknown>, opts?: Parameters<PostgrestClient["rpc"]>[2]) => rest.rpc(fn, args, opts),
		auth,
	};
	// PostgrestClient<any> and AuthClient are the same classes SupabaseClient wraps; only the generic
	// database typing differs, which the gateway does not use.
	return client as unknown as GatewaySupabaseClient;
}
