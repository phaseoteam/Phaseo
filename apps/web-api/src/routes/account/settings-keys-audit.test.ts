import { afterEach, describe, expect, it, vi } from "vitest";
import app from "@/index";

const env = {
	ENV: "development" as const,
	SUPABASE_URL: "https://example.supabase.co",
	SUPABASE_ANON_KEY: "anon-key",
	SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
	KEY_PEPPER_ACTIVE: "test-pepper",
};

afterEach(() => vi.unstubAllGlobals());

describe("key lifecycle audit events", () => {
	it("records a sanitized event after creating an API key", async () => {
		let auditPayload: Record<string, unknown> | null = null;
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const request = input instanceof Request ? input : new Request(String(input), init);
			const url = request.url;
			if (url.includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "user-1", email: "admin@example.com", app_metadata: {}, user_metadata: {} }), { status: 200 });
			if (url.includes("workspace_members")) return new Response(JSON.stringify([{ role: "admin" }]), { status: 200 });
			if (url.includes("workspaces") && url.includes("owner_user_id")) return new Response(JSON.stringify([{ owner_user_id: "owner-1" }]), { status: 200 });
			if (url.includes("workspaces") && url.includes("tier")) return new Response(JSON.stringify([{ tier: "basic" }]), { status: 200 });
			if (request.method === "HEAD" && (url.includes("/keys") || url.includes("management_keys"))) return new Response(null, { status: 200, headers: { "content-range": "*/0" } });
			if (url.includes("workspace_audit_events") && request.method === "POST") {
				auditPayload = await request.clone().json() as Record<string, unknown>;
				return new Response(JSON.stringify([]), { status: 201 });
			}
			if (url.includes("/rest/v1/keys") && request.method === "POST") return new Response(JSON.stringify([{ id: "key-1" }]), { status: 201 });
			return new Response(JSON.stringify([]), { status: 200 });
		}));

		const response = await app.request("https://phaseo.app/api/account/settings/keys", {
			method: "POST",
			headers: { authorization: "Bearer session-token", "content-type": "application/json", "x-request-id": "request-1" },
			body: JSON.stringify({ workspaceId: "workspace-1", name: "Production", scopes: "[\"gateway:write\"]", limits: { monthlyRequests: 1000 } }),
		}, env);

		expect(response.status).toBe(200);
		expect(auditPayload).toMatchObject({
			workspace_id: "workspace-1",
			actor_user_id: "user-1",
			action: "api_key.created",
			target_type: "api_key",
			target_id: "key-1",
			target_name: "Production",
			request_id: "request-1",
		});
		const serialized = JSON.stringify(auditPayload);
		expect(serialized).not.toContain("phaseo_v1_sk");
		expect(serialized).not.toContain("gateway:write");
		expect(serialized).not.toContain("hash");
	});

	it("records a pause or resume only when the key's status changes", async () => {
		const actions: string[] = [];
		const pauseRequest = async (currentStatus: string, paused: boolean) => {
			vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const request = input instanceof Request ? input : new Request(String(input), init);
				const url = request.url;
				if (url.includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "user-1", email: "admin@example.com", app_metadata: {}, user_metadata: {} }), { status: 200 });
				if (url.includes("workspace_members")) return new Response(JSON.stringify([{ role: "admin" }]), { status: 200 });
				if (url.includes("workspaces") && url.includes("owner_user_id")) return new Response(JSON.stringify([{ owner_user_id: "owner-1" }]), { status: 200 });
				if (url.includes("workspaces") && url.includes("tier")) return new Response(JSON.stringify([{ tier: "basic" }]), { status: 200 });
				if (request.method === "HEAD" && (url.includes("/keys") || url.includes("management_keys"))) return new Response(null, { status: 200, headers: { "content-range": "*/0" } });
				if (url.includes("workspace_audit_events") && request.method === "POST") {
					actions.push(String((await request.clone().json() as Record<string, unknown>).action));
					return new Response(JSON.stringify([]), { status: 201 });
				}
				if (url.includes("/rest/v1/keys") && request.method === "GET") {
					return new Response(JSON.stringify([{ id: "key-1", workspace_id: "workspace-1", name: "Production", status: currentStatus, soft_blocked: false, expires_at: null }]), { status: 200 });
				}
				return new Response(JSON.stringify([]), { status: 200 });
			}));
			const response = await app.request("https://phaseo.app/api/account/settings/keys/key-1", {
				method: "PUT",
				headers: { authorization: "Bearer session-token", "content-type": "application/json" },
				body: JSON.stringify({ paused }),
			}, env, { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as any);
			expect(response.status).toBe(200);
		};

		await pauseRequest("active", true);
		await pauseRequest("paused", true);
		await pauseRequest("paused", false);
		await pauseRequest("active", false);

		expect(actions).toEqual(["api_key.paused", "api_key.updated", "api_key.resumed", "api_key.updated"]);
	});
});
