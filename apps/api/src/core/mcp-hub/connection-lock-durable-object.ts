// Purpose: Refresh one connected MCP server's OAuth tokens at a time.
// Why: Some authorization servers (Notion among them) revoke the whole grant
//      when a refresh token is used twice, which two isolates refreshing at once
//      would do.
// How: One object per connection id. Concurrent refresh requests share the one
//      in flight; the refresh re-reads the row first, so a request that arrives
//      just after a refresh finds fresh tokens and does nothing.

import { DurableObject } from "cloudflare:workers";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { GatewayBindings } from "@/runtime/env.types";
import { connectionKeyringFromEnv } from "@core/mcp-connections-shared";
import { safeFetch } from "@core/ssrf";
import { refreshConnectionTokens, type RefreshOutcome } from "./hub";
import { HUB_UPSTREAM_FETCH_OPTIONS } from "./deps";

export class McpConnectionLockDurableObject extends DurableObject<GatewayBindings> {
	private inflight: Promise<RefreshOutcome> | null = null;
	private supabase: SupabaseClient | null = null;

	async fetch(request: Request): Promise<Response> {
		const body = await request.json().catch(() => null) as { connectionId?: unknown; refusedAccessToken?: unknown } | null;
		const connectionId = typeof body?.connectionId === "string" ? body.connectionId : "";
		if (!connectionId) return Response.json({ outcome: "failed" }, { status: 400 });
		const refused = typeof body?.refusedAccessToken === "string" ? body.refusedAccessToken : undefined;
		// A request that arrives during a refresh shares its result instead of starting another.
		this.inflight ??= this.refresh(connectionId, refused).finally(() => { this.inflight = null; });
		return Response.json({ outcome: await this.inflight });
	}

	private refresh(connectionId: string, refusedAccessToken?: string): Promise<RefreshOutcome> {
		this.supabase ??= createClient(this.env.SUPABASE_URL, this.env.SUPABASE_SERVICE_ROLE_KEY, {
			auth: { persistSession: false, autoRefreshToken: false },
		});
		return refreshConnectionTokens({
			client: this.supabase,
			keyring: connectionKeyringFromEnv(this.env as unknown as Record<string, unknown>),
			fetch: (input, init) => safeFetch(input, init, HUB_UPSTREAM_FETCH_OPTIONS),
		}, connectionId, refusedAccessToken).catch(() => "failed" as const);
	}
}
