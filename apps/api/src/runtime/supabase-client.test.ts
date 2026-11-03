import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { createClient } from "./supabase-client";

type Seen = { url: string; method: string; body: string | null; headers: Record<string, string> };

// Headers that must match supabase-js; X-Client-Info and fetch-implementation details may differ.
const COMPARED = ["apikey", "authorization", "content-type", "accept", "prefer", "accept-profile", "content-profile"];

function recordingFetch(seen: Seen[]): typeof fetch {
	return (async (input: RequestInfo | URL, init?: RequestInit) => {
		const headers = new Headers(init?.headers);
		seen.push({
			url: String(input instanceof Request ? input.url : input),
			method: init?.method ?? "GET",
			body: typeof init?.body === "string" ? init.body : null,
			headers: Object.fromEntries(COMPARED.filter((h) => headers.has(h)).map((h) => [h, headers.get(h)!])),
		});
		const json = String(input).includes("/auth/v1/admin/users/") ? { id: "00000000-0000-4000-8000-000000000001", email: "a@b.c" } : [{ id: 1 }];
		return new Response(JSON.stringify(json), { status: 200, headers: { "content-type": "application/json" } });
	}) as typeof fetch;
}

async function exercise(client: any) {
	await client.from("workspaces").select("id,name").eq("id", "w1").maybeSingle();
	await client.from("wallets").update({ balance_nanos: 5 }).eq("workspace_id", "w1");
	await client.rpc("gateway_spend_limit_seed", { p_workspace_id: "w1" });
	await client.schema("private").from("t").select("*").limit(1);
	await client.auth.admin.getUserById("00000000-0000-4000-8000-000000000001");
}

describe("gateway Supabase client", () => {
	it("sends the same requests as supabase-js's createClient", async () => {
		const options = (fetch: typeof globalThis.fetch) => ({ auth: { autoRefreshToken: false, persistSession: false }, global: { fetch } });
		const ours: Seen[] = [];
		const theirs: Seen[] = [];
		await exercise(createClient("https://proj.supabase.co", "service-key", options(recordingFetch(ours))));
		await exercise(createSupabaseJsClient("https://proj.supabase.co", "service-key", options(recordingFetch(theirs))));
		expect(ours).toHaveLength(5);
		expect(ours).toEqual(theirs);
		for (const request of ours) {
			expect(request.headers.apikey).toBe("service-key");
			expect(request.headers.authorization).toBe("Bearer service-key");
		}
	});

	it("returns data the same way", async () => {
		const client = createClient("https://proj.supabase.co", "k", { global: { fetch: recordingFetch([]) } });
		await expect(client.rpc("f")).resolves.toMatchObject({ data: [{ id: 1 }], error: null, status: 200 });
		await expect(client.auth.admin.getUserById("00000000-0000-4000-8000-000000000001")).resolves.toMatchObject({ data: { user: { id: "00000000-0000-4000-8000-000000000001" } }, error: null });
	});

	it("validates its inputs like supabase-js", () => {
		expect(() => createClient("", "k")).toThrow("supabaseUrl is required.");
		expect(() => createClient("proj.supabase.co", "k")).toThrow("Invalid supabaseUrl");
		expect(() => createClient("https://proj.supabase.co", "")).toThrow("supabaseKey is required.");
	});
});
