import type { GatewayBindings } from "@/runtime/env.types";
import { getSupabaseAdmin } from "@/runtime/env";
import { connectionKeyringFromEnv, type ConnectionKeyring } from "@core/mcp-connections-shared";
import { safeFetch, type SafeFetchOptions } from "@core/ssrf";
import { refreshConnectionTokens, type HubDeps, type RefreshOutcome } from "./hub";

/** Limits for every request to a connected server: 30 s, 1 MiB. */
export const HUB_UPSTREAM_FETCH_OPTIONS: SafeFetchOptions = { timeoutMs: 30_000, maxBytes: 1024 * 1024 };

export function hubEnabled(env: GatewayBindings): boolean {
	return env.MCP_HUB_ENABLED === "true";
}

export function hubKeyring(env: GatewayBindings): ConnectionKeyring | null {
	const ring = connectionKeyringFromEnv(env as unknown as Record<string, unknown>);
	return ring.keys[ring.activeVersion] ? ring : null;
}

/** Production dependencies. Call after configureRuntime. */
export function hubDeps(env: GatewayBindings, keyring: ConnectionKeyring): HubDeps {
	const client = getSupabaseAdmin();
	const fetch: HubDeps["fetch"] = (input, init) => safeFetch(input, init, HUB_UPSTREAM_FETCH_OPTIONS);
	const locks = env.MCP_CONNECTION_LOCKS;
	return {
		client,
		keyring,
		fetch,
		cache: env.GATEWAY_CACHE ?? null,
		refresh: async (connectionId, refusedAccessToken) => {
			// Without the binding (local tests) refresh directly; production always has it.
			if (!locks) return refreshConnectionTokens({ client, keyring, fetch }, connectionId, refusedAccessToken);
			const stub = locks.get(locks.idFromName(connectionId));
			const response = await stub.fetch("https://mcp-connection-lock/refresh", { method: "POST", body: JSON.stringify({ connectionId, refusedAccessToken }) });
			const body = await response.json().catch(() => null) as { outcome?: RefreshOutcome } | null;
			return body?.outcome ?? "failed";
		},
	};
}
