import { afterEach, describe, expect, it, vi } from "vitest";
import app from "@/index";

const env = {
	ENV: "development" as const,
	SUPABASE_URL: "https://example.supabase.co",
	SUPABASE_ANON_KEY: "anon-key",
	SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
	PHASEO_MANAGEMENT_KEY: "management-key",
	PHASEO_CONTROL_KEY: "control-key",
	PHASEO_CONTROL_SECRET: "control-secret",
	GATEWAY_API_ORIGIN: "https://gateway.example.com",
};

afterEach(() => vi.unstubAllGlobals());

describe("account policy settings routes", () => {
	it.each(["owner", "admin", "member"])("reports routing edit access for a %s and enforces it on writes", async (role) => {
		let writes = 0;
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const request = input instanceof Request ? input : new Request(input, init);
			if (request.url.includes("/auth/v1/user")) return Response.json({ id: "user-1" });
			if (request.url.includes("workspace_members")) return Response.json([{ role }]);
			if (request.url.includes("/workspaces")) return Response.json([{ id: "workspace-1", name: "Fixture workspace", owner_user_id: role === "owner" ? "user-1" : "other-user" }]);
			if (request.url.includes("workspace_settings")) {
				if (request.method !== "GET") writes++;
				return Response.json([]);
			}
			return Response.json([]);
		}));
		const canManage = role !== "member";
		const response = await app.request("https://phaseo.app/api/account/settings/routing?workspaceId=workspace-1", { headers: { authorization: "Bearer fixture" } }, env);
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({ canManage, workspaceId: "workspace-1" });
		const privacy = await app.request("https://phaseo.app/api/account/settings/privacy?workspaceId=workspace-1", { headers: { authorization: "Bearer fixture" } }, env);
		expect(privacy.status).toBe(200);
		await expect(privacy.json()).resolves.toMatchObject({ canManage, workspaceId: "workspace-1" });
		const write = await app.request("https://phaseo.app/api/account/settings/routing", {
			method: "PUT", headers: { authorization: "Bearer fixture", "content-type": "application/json" },
			body: JSON.stringify({ workspaceId: "workspace-1", mode: "price" }),
		}, env);
		expect(write.status).toBe(canManage ? 200 : 403);
		expect(writes).toBe(canManage ? 1 : 0);
	});

	it("does not grant routing edit access without a selected workspace", async () => {
		const response = await app.request("https://phaseo.app/api/account/settings/routing", {}, env);
		await expect(response.json()).resolves.toMatchObject({ canManage: false, workspaceId: null });
	});
	it("returns the private effective Chat policy with the guardrails the Chat key inherits and its own", async () => {
		const rpcBodies: unknown[] = [];
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const request = input instanceof Request ? input : new Request(input, init);
			const url = request.url;
			if (url.includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "user-1", email: "user@example.com", created_at: "2025-01-01" }), { status: 200 });
			if (url.includes("/rpc/resolve_member_guardrails")) {
				rpcBodies.push(await request.json());
				// Workspace and department levels as well as the member, as the gateway applies them.
				return new Response(JSON.stringify([
					{ guardrail_id: "guardrail-1", source_type: "member", source_id: "user-1" },
					{ guardrail_id: "guardrail-2", source_type: "department", source_id: "dep-1" },
				]), { status: 200 });
			}
			if (url.includes("/keys?")) {
				expect(new URL(url).searchParams.get("name")).toBe("eq.__chat_route_managed_key__");
				return new Response(JSON.stringify([{ id: "chat-key" }]), { status: 200 });
			}
			if (url.includes("workspace_guardrail_assignments")) {
				expect(new URL(url).searchParams.get("target_type")).toBe("eq.key");
				expect(new URL(url).searchParams.get("target_id")).toBe("eq.chat-key");
				return new Response(JSON.stringify([{ guardrail_id: "guardrail-3" }]), { status: 200 });
			}
			if (url.includes("account_guardrail_settings")) return new Response(JSON.stringify([{ provider_restriction_mode: "none", provider_restriction_provider_ids: [], model_restriction_mode: "blocklist", model_restriction_model_ids: ["inclusionai/ling-3.0-flash-sante:free"] }]), { status: 200 });
			if (url.includes("workspace_members")) return new Response(JSON.stringify([{ role: "member" }]), { status: 200 });
			if (url.includes("/workspaces")) return new Response(JSON.stringify([{ owner_user_id: "owner-1" }]), { status: 200 });
			if (url.includes("workspace_settings")) return new Response(JSON.stringify([{ provider_restriction_mode: "blocklist", provider_restriction_provider_ids: ["novita"], model_restriction_mode: "none", model_restriction_model_ids: [] }]), { status: 200 });
			if (url.includes("workspace_guardrails")) {
				expect(new URL(url).searchParams.get("id")).toBe("in.(guardrail-1,guardrail-2,guardrail-3)");
				return new Response(JSON.stringify([
					{ id: "guardrail-1", name: "Team Safety", enabled: true, provider_restriction_mode: "blocklist", provider_restriction_provider_ids: ["openai"], model_restriction_mode: "none", allowed_api_model_ids: [] },
					{ id: "guardrail-2", name: "Engineering", enabled: true, provider_restriction_mode: "none", provider_restriction_provider_ids: [], model_restriction_mode: "blocklist", allowed_api_model_ids: ["model-x"] },
				]), { status: 200 });
			}
			return new Response(JSON.stringify([]), { status: 200 });
		}));

		const response = await app.request("https://phaseo.app/api/account/settings/chat/effective-policy?workspaceId=workspace-1", { headers: { authorization: "Bearer session-token" } }, env);
		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toBe("private, no-store");
		expect(rpcBodies).toEqual([{ p_workspace_id: "workspace-1", p_user_id: "user-1" }]);
		await expect(response.json()).resolves.toMatchObject({
			workspace: { provider: { mode: "blocklist", ids: ["novita"] } },
			guardrails: [
				{ id: "guardrail-1", name: "Team Safety", provider: { mode: "blocklist", ids: ["openai"] } },
				{ id: "guardrail-2", name: "Engineering", model: { mode: "blocklist", ids: ["model-x"] } },
			],
		});
	});

	it("fails rather than under-reporting when the inherited guardrails can't be read", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = input instanceof Request ? input.url : String(input);
			if (url.includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "user-1", email: "user@example.com", created_at: "2025-01-01" }), { status: 200 });
			if (url.includes("workspace_members")) return new Response(JSON.stringify([{ role: "member" }]), { status: 200 });
			if (url.includes("/workspaces")) return new Response(JSON.stringify([{ owner_user_id: "owner-1" }]), { status: 200 });
			if (url.includes("/rpc/resolve_member_guardrails")) return new Response(JSON.stringify({ code: "57014", message: "timeout" }), { status: 500 });
			return new Response(JSON.stringify([]), { status: 200 });
		}));
		const response = await app.request("https://phaseo.app/api/account/settings/chat/effective-policy?workspaceId=workspace-1", { headers: { authorization: "Bearer session-token" } }, env);
		expect(response.status).toBe(503);
	});
	it("invalidates every active key after response-healing policy changes", async () => {
		const invalidated: string[] = [];
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const request = input instanceof Request ? input : new Request(input, init);
			const url = request.url;
			if (url.includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "user-1", email: "user@example.com", created_at: "2025-01-01" }), { status: 200 });
			if (url.includes("workspace_members")) return new Response(JSON.stringify([{ role: "admin" }]), { status: 200 });
			if (url.includes("/workspaces")) return new Response(JSON.stringify([{ owner_user_id: "user-1" }]), { status: 200 });
			if (url.includes("workspace_settings")) return new Response(JSON.stringify([]), { status: 200 });
			if (url.includes("/keys?")) return new Response(JSON.stringify([{ id: "key-1" }, { id: "key-2" }]), { status: 200 });
			if (url.includes("/v1/keys/") && url.endsWith("/invalidate")) {
				invalidated.push(url);
				expect(request.headers.get("authorization")).toBe("Bearer control-key");
				expect(request.headers.get("x-control-secret")).toBe("control-secret");
				return new Response(null, { status: 204 });
			}
			return new Response(JSON.stringify([]), { status: 200 });
		}));

		const response = await app.request("https://phaseo.app/api/account/settings/routing", {
			method: "PUT",
			headers: { authorization: "Bearer session-token", "content-type": "application/json" },
			body: JSON.stringify({
				workspaceId: "workspace-1",
				responseHealingEnabled: true,
				responseHealingLocked: true,
				responseHealingMode: "strict",
			}),
		}, env);

		expect(response.status).toBe(200);
		expect(invalidated).toEqual([
			"https://gateway.example.com/v1/keys/key-1/invalidate",
			"https://gateway.example.com/v1/keys/key-2/invalidate",
		]);
	});

	it("persists routing settings when gateway invalidation credentials are unavailable", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = input instanceof Request ? input.url : String(input);
			if (url.includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "user-1", email: "user@example.com", created_at: "2025-01-01" }), { status: 200 });
			if (url.includes("workspace_members")) return new Response(JSON.stringify([{ role: "admin" }]), { status: 200 });
			if (url.includes("/workspaces")) return new Response(JSON.stringify([{ owner_user_id: "user-1" }]), { status: 200 });
			if (url.includes("workspace_settings")) return new Response(JSON.stringify([]), { status: 200 });
			if (url.includes("/keys?")) return new Response(JSON.stringify([{ id: "key-1" }]), { status: 200 });
			return new Response(JSON.stringify([]), { status: 200 });
		}));

		const response = await app.request("https://phaseo.app/api/account/settings/routing", {
			method: "PUT",
			headers: { authorization: "Bearer session-token", "content-type": "application/json" },
			body: JSON.stringify({ workspaceId: "workspace-1", mode: "price" }),
		}, { ...env, PHASEO_CONTROL_KEY: undefined, PHASEO_CONTROL_SECRET: undefined });

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({ ok: true, gatewayCacheInvalidated: false });
	});

	it("returns the workspace Auto Routing configuration", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = input instanceof Request ? input.url : String(input);
			if (url.includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "user-1", email: "user@example.com", created_at: "2025-01-01" }), { status: 200 });
			if (url.includes("workspace_members")) return new Response(JSON.stringify([{ role: "admin" }]), { status: 200 });
			if (url.includes("/workspaces") && url.includes("owner_user_id")) return new Response(JSON.stringify([{ owner_user_id: "user-1" }]), { status: 200 });
			if (url.includes("/workspaces")) return new Response(JSON.stringify([{ id: "workspace-1", name: "Team One" }]), { status: 200 });
			if (url.includes("workspace_settings")) return new Response(JSON.stringify([{
				auto_routing_allowed_patterns: ["anthropic/*", "openai/gpt-*"],
				auto_routing_spend_profile: "premium",
				auto_routing_objective: "quality",
				auto_routing_fallbacks_enabled: false,
				auto_routing_revision: "revision-1",
				auto_routing_updated_at: "2026-08-30T12:00:00.000Z",
			}]), { status: 200 });
			return new Response(JSON.stringify([]), { status: 200 });
		}));

		const response = await app.request("https://phaseo.app/api/account/settings/routing/auto?workspaceId=workspace-1", {
			headers: { authorization: "Bearer session-token" },
		}, env);

		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toBe("private, no-store");
		await expect(response.json()).resolves.toMatchObject({
			autoRouting: {
				allowedPatterns: ["anthropic/*", "openai/gpt-*"],
				spendProfile: "premium",
				objective: "quality",
				allowFallbacks: false,
				revision: "revision-1",
			},
			canManage: true,
			teamName: "Team One",
		});
	});

	it("validates and saves managed Auto Routing constraints", async () => {
		let settingsPayload: Record<string, unknown> | null = null;
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const request = input instanceof Request ? input : new Request(input, init);
			const url = request.url;
			if (url.includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "user-1", email: "user@example.com", created_at: "2025-01-01" }), { status: 200 });
			if (url.includes("workspace_members")) return new Response(JSON.stringify([{ role: "admin" }]), { status: 200 });
			if (url.includes("/workspaces")) return new Response(JSON.stringify([{ owner_user_id: "user-1" }]), { status: 200 });
			if (url.includes("v2_model_provider_routes")) return new Response(JSON.stringify([
				{ provider_model_id: "pm-openai", model_slug: "openai/gpt-test" },
				{ provider_model_id: "pm-anthropic", model_slug: "anthropic/claude-test" },
			]), { status: 200 });
			if (url.includes("v2_effective_route_capabilities")) return new Response(JSON.stringify([
				{ provider_model_id: "pm-openai", capability_id: "responses" },
				{ provider_model_id: "pm-anthropic", capability_id: "messages" },
			]), { status: 200 });
			if (url.includes("workspace_settings") && request.method === "POST") {
				settingsPayload = await request.json<Record<string, unknown>>();
				return new Response(JSON.stringify([{ auto_routing_revision: "revision-2", auto_routing_updated_at: "2026-08-30T13:00:00.000Z" }]), { status: 200 });
			}
			if (url.includes("/keys?")) return new Response(JSON.stringify([]), { status: 200 });
			return new Response(JSON.stringify([]), { status: 200 });
		}));

		const response = await app.request("https://phaseo.app/api/account/settings/routing/auto", {
			method: "PUT",
			headers: { authorization: "Bearer session-token", "content-type": "application/json" },
			body: JSON.stringify({
				workspaceId: "workspace-1",
				allowedPatterns: ["anthropic/*", "openai/gpt-*"],
				spendProfile: "premium",
				maxInputPricePerMillion: null,
				maxOutputPricePerMillion: null,
				objective: "latency",
				allowFallbacks: true,
			}),
		}, env);

		expect(response.status).toBe(200);
		expect(settingsPayload).toMatchObject({
			auto_routing_allowed_patterns: ["anthropic/*", "openai/gpt-*"],
			auto_routing_spend_profile: "premium",
			auto_routing_objective: "latency",
			auto_routing_fallbacks_enabled: true,
		});
		await expect(response.json()).resolves.toMatchObject({
			autoRouting: { allowedPatterns: ["anthropic/*", "openai/gpt-*"], spendProfile: "premium", objective: "latency", revision: "revision-2" },
			gatewayCacheInvalidated: true,
			ok: true,
		});
	});

	it("rejects invalid Auto Routing model patterns", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = input instanceof Request ? input.url : String(input);
			if (url.includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "user-1", email: "user@example.com", created_at: "2025-01-01" }), { status: 200 });
			if (url.includes("workspace_members")) return new Response(JSON.stringify([{ role: "admin" }]), { status: 200 });
			if (url.includes("/workspaces")) return new Response(JSON.stringify([{ owner_user_id: "user-1" }]), { status: 200 });
			return new Response(JSON.stringify([]), { status: 200 });
		}));

		const response = await app.request("https://phaseo.app/api/account/settings/routing/auto", {
			method: "PUT",
			headers: { authorization: "Bearer session-token", "content-type": "application/json" },
			body: JSON.stringify({ workspaceId: "workspace-1", allowedPatterns: ["anthropic/[invalid]"], spendProfile: "standard" }),
		}, env);

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toEqual({ error: "invalid_model_patterns", patterns: ["anthropic/[invalid]"], maximum: 16 });
	});

	it("does not publish a duplicate preset version without draft changes", async () => {
		let publishRpcCalled = false;
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = input instanceof Request ? input.url : String(input);
			if (url.includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "user-1", email: "user@example.com", created_at: "2025-01-01" }), { status: 200 });
			if (url.includes("workspace_members")) return new Response(JSON.stringify([{ role: "member" }]), { status: 200 });
			if (url.includes("/presets?")) return new Response(JSON.stringify([{
				workspace_id: "workspace-1", created_by: "user-1", name: "Stable", slug: "stable", description: null,
				config: { models: ["openai/gpt-test"] }, visibility: "team", draft_name: "Stable", draft_slug: "stable",
				draft_description: null, draft_config: { models: ["openai/gpt-test"] }, draft_visibility: "team",
			}]), { status: 200 });
			if (url.includes("/rpc/publish_preset_version")) publishRpcCalled = true;
			return new Response(JSON.stringify([]), { status: 200 });
		}));

		const response = await app.request("https://phaseo.app/api/account/settings/presets/preset-1/versions", {
			method: "POST",
			headers: { authorization: "Bearer session-token", "content-type": "application/json" },
			body: JSON.stringify({ releaseNotes: "No changes" }),
		}, env);

		expect(response.status).toBe(409);
		await expect(response.json()).resolves.toEqual({ error: "no_draft_changes" });
		expect(publishRpcCalled).toBe(false);
	});

	it("forwards a semver label and reports one that is already taken", async () => {
		let rpcBody: any = null;
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const request = input instanceof Request ? input : new Request(input, init);
			const url = request.url;
			if (url.includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "user-1", email: "user@example.com", created_at: "2025-01-01" }), { status: 200 });
			if (url.includes("workspace_members")) return new Response(JSON.stringify([{ role: "member" }]), { status: 200 });
			if (url.includes("/presets?")) return new Response(JSON.stringify([{
				workspace_id: "workspace-1", created_by: "user-1", name: "Stable", slug: "stable", description: null,
				config: { models: ["openai/gpt-test"] }, visibility: "team", draft_name: "Stable", draft_slug: "stable",
				draft_description: null, draft_config: { models: ["openai/gpt-other"] }, draft_visibility: "team", versioning_method: "semver",
			}]), { status: 200 });
			if (url.includes("/rpc/publish_preset_version")) {
				rpcBody = JSON.parse(await request.text());
				return new Response(JSON.stringify({ code: "23505", message: "duplicate key value violates unique constraint \"preset_versions_preset_id_version_label_key\"" }), { status: 409 });
			}
			return new Response(JSON.stringify([]), { status: 200 });
		}));

		const response = await app.request("https://phaseo.app/api/account/settings/presets/preset-1/versions", {
			method: "POST",
			headers: { authorization: "Bearer session-token", "content-type": "application/json" },
			body: JSON.stringify({ versionLabel: "1.2.0" }),
		}, env);

		expect(rpcBody?.requested_label).toBe("1.2.0");
		expect(response.status).toBe(409);
		await expect(response.json()).resolves.toEqual({ error: "version_label_taken" });
	});

	describe("preset version labels", () => {
		const VERSION_ID = "7d0b6f0e-3c1a-4f0b-9a55-2f3c4d5e6f70";
		function stubLabels({ role = "admin", createdBy = "owner-2", visibility = "team", rpc }: { role?: string; createdBy?: string; visibility?: string; rpc?: (name: string, body: any) => Response }) {
			const calls: Array<{ name: string; body: any }> = [];
			vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const request = input instanceof Request ? input : new Request(input, init);
				const url = request.url;
				if (url.includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "user-1", email: "user@example.com", created_at: "2025-01-01" }), { status: 200 });
				if (url.includes("workspace_members")) return new Response(JSON.stringify([{ role }]), { status: 200 });
				if (url.includes("/presets?")) return new Response(JSON.stringify([{ id: "preset-1", workspace_id: "workspace-1", created_by: createdBy, visibility, draft_visibility: visibility, active_version_id: "version-3" }]), { status: 200 });
				// The target version check before moving a label: a shared version.
				if (url.includes("/preset_versions?") && new URL(url).searchParams.has("id")) return new Response(JSON.stringify([{ id: VERSION_ID }]), { status: 200 });
				if (url.includes("/preset_versions?")) return new Response(JSON.stringify([
					{ id: "version-3", version_number: 3, version_label: "v3", config: { models: ["openai/gpt-test"], prompt: { messages: [{ role: "user", content: "Hi {{name}}" }] }, parameters: { temperature: 0.2 } } },
					{ id: "version-2", version_number: 2, version_label: "v2", config: null },
				]), { status: 200 });
				if (url.includes("/preset_version_labels?")) return new Response(JSON.stringify([{ label: "production", version_id: "version-2", updated_at: "2026-10-27T00:00:00Z" }, { label: "staging", version_id: "version-3", updated_at: "2026-10-27T00:00:00Z" }]), { status: 200 });
				const rpcMatch = url.match(/\/rpc\/([a-z_]+)/);
				if (rpcMatch) {
					const body = JSON.parse(await request.text());
					calls.push({ name: rpcMatch[1], body });
					return rpc?.(rpcMatch[1], body) ?? new Response(JSON.stringify(rpcMatch[1] === "remove_preset_version_label" ? true : { label: body.p_label, version_id: body.p_version_id }), { status: 200 });
				}
				return new Response(JSON.stringify([]), { status: 200 });
			}));
			return calls;
		}
		const purged: string[][] = [];
		const executionCtx = { waitUntil() {}, passThroughOnException() {}, props: {}, cache: { purge: async ({ tags }: { tags: string[] }) => { purged.push(tags); return { success: true }; } } };
		const request = (path: string, init: RequestInit = {}) => app.request(`https://phaseo.app/api/account/settings/presets/preset-1${path}`, { ...init, headers: { authorization: "Bearer session-token", "content-type": "application/json" } }, env, executionCtx as never);

		it("lists versions with their labels and whether the caller can move them", async () => {
			stubLabels({});
			const response = await request("/versions");
			expect(response.status).toBe(200);
			await expect(response.json()).resolves.toMatchObject({
				versions: [{ id: "version-3", version_label: "v3", labels: ["staging"] }, { id: "version-2", version_label: "v2", labels: ["production"] }],
				labels: [{ label: "production", version_id: "version-2" }, { label: "staging", version_id: "version-3" }],
				activeVersionId: "version-3",
				canManageLabels: true,
			});
		});

		it("returns each version's models and template, and no other config, so the editor can show and compare them", async () => {
			stubLabels({ role: "member" });
			const body = await (await request("/versions")).json() as { versions: Array<{ config: unknown }> };
			expect(body.versions.map((version) => version.config)).toEqual([
				{ models: ["openai/gpt-test"], prompt: { messages: [{ role: "user", content: "Hi {{name}}" }] } },
				{ models: [], prompt: null },
			]);
		});

		it("does not show a private preset's versions to other members", async () => {
			stubLabels({ role: "member", visibility: "private" });
			expect((await request("/versions")).status).toBe(404);
		});

		it("keeps a version published while the preset was private from other members after a shared version follows it", async () => {
			const urls: URL[] = [];
			const stub = (userId: string) => vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
				const url = new URL(input instanceof Request ? input.url : String(input));
				urls.push(url);
				if (url.pathname === "/auth/v1/user") return Response.json({ id: userId, email: "user@example.com", created_at: "2025-01-01" });
				if (url.pathname.endsWith("workspace_members")) return Response.json([{ role: "admin" }]);
				if (url.pathname.endsWith("/presets")) return Response.json([{ id: "preset-1", workspace_id: "workspace-1", created_by: "owner-2", visibility: "team", draft_visibility: "team", active_version_id: "version-2" }]);
				if (url.pathname.endsWith("/preset_versions")) {
					const versions = [
						{ id: "version-2", version_number: 2, version_label: "v2", visibility: "team", config: { models: ["openai/shared"] } },
						{ id: "version-1", version_number: 1, version_label: "v1", visibility: "private", config: { models: ["openai/private"], prompt: { messages: [{ role: "system", content: "Private prompt" }] } } },
					];
					return Response.json(url.searchParams.get("visibility") === "neq.private" ? versions.filter((version) => version.visibility !== "private") : versions);
				}
				if (url.pathname.endsWith("/preset_version_labels")) return Response.json([{ label: "production", version_id: "version-1", updated_at: "x" }, { label: "staging", version_id: "version-2", updated_at: "x" }]);
				return Response.json([]);
			}));
			stub("user-1");
			const response = await request("/versions");
			expect(response.status).toBe(200);
			const text = await response.text();
			expect(text).not.toMatch(/version-1|Private prompt|openai\/private|production/);
			expect(JSON.parse(text)).toMatchObject({ versions: [{ id: "version-2", labels: ["staging"] }], labels: [{ label: "staging", version_id: "version-2" }] });
			expect(urls.find((url) => url.pathname.endsWith("/preset_versions"))!.searchParams.get("visibility")).toBe("neq.private");

			stub("owner-2");
			const own = await (await request("/versions")).json() as { versions: Array<{ id: string }>; labels: unknown[] };
			expect(own.versions.map((version) => version.id)).toEqual(["version-2", "version-1"]);
			expect(own.labels).toHaveLength(2);
		});

		it("doesn't let another admin point a label at a private version", async () => {
			const rpcs: string[] = [];
			const versionLookups: URL[] = [];
			const stub = (userId: string) => vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const req = input instanceof Request ? input : new Request(String(input), init);
				const url = new URL(req.url);
				if (url.pathname === "/auth/v1/user") return Response.json({ id: userId, email: "user@example.com", created_at: "2025-01-01" });
				if (url.pathname.endsWith("workspace_members")) return Response.json([{ role: "admin" }]);
				if (url.pathname.endsWith("/presets")) return Response.json([{ id: "preset-1", workspace_id: "workspace-1", created_by: "owner-2", visibility: "team", draft_visibility: "team" }]);
				if (url.pathname.endsWith("/preset_versions")) {
					versionLookups.push(url);
					// VERSION_ID is v1, published while the preset was private.
					return Response.json(url.searchParams.get("visibility") === "neq.private" ? [] : [{ id: VERSION_ID }]);
				}
				if (url.pathname.includes("/rpc/")) { rpcs.push(url.pathname); return Response.json({ label: "probe", version_id: VERSION_ID }); }
				return Response.json([]);
			}));
			stub("user-1");
			const response = await request("/labels/probe", { method: "PUT", body: JSON.stringify({ versionId: VERSION_ID }) });
			expect(response.status).toBe(404);
			await expect(response.json()).resolves.toEqual({ error: "preset_version_not_found" });
			expect(rpcs).toEqual([]);
			expect(versionLookups[0].searchParams.get("id")).toBe(`eq.${VERSION_ID}`);
			stub("owner-2");
			expect((await request("/labels/probe", { method: "PUT", body: JSON.stringify({ versionId: VERSION_ID }) })).status).toBe(200);
			expect(rpcs).toHaveLength(1);
		});

		it("refuses to archive a preset made private since the read, unless you created it", async () => {
			const archives: URL[] = [];
			const stub = (userId: string, archived: unknown[]) => vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const request = input instanceof Request ? input : new Request(String(input), init);
				const url = new URL(request.url);
				if (url.pathname === "/auth/v1/user") return Response.json({ id: userId, email: "user@example.com", created_at: "2025-01-01" });
				if (url.pathname.endsWith("workspace_members")) return Response.json([{ role: "admin" }]);
				if (url.pathname.endsWith("/presets") && request.method === "PATCH") { archives.push(url); return Response.json(archived); }
				// Read as shared; the creator makes it private before the archive lands.
				if (url.pathname.endsWith("/presets")) return Response.json([{ name: "@shared", workspace_id: "workspace-1", created_by: "owner-2", visibility: "team" }]);
				return Response.json([]);
			}));
			stub("user-1", []);
			expect((await request("", { method: "DELETE" })).status).toBe(409);
			expect(archives[0].searchParams.get("visibility")).toBe("neq.private");
			stub("user-1", [{ id: "preset-1" }]);
			expect((await request("", { method: "DELETE" })).status).toBe(200);
			archives.length = 0;
			stub("owner-2", [{ id: "preset-1" }]);
			expect((await request("", { method: "DELETE" })).status).toBe(200);
			expect(archives[0].searchParams.has("visibility")).toBe(false);
		});

		it("does not show a teammate's private preset by id, but shows it to its creator and shows team presets", async () => {
			stubLabels({ role: "admin", visibility: "private", createdBy: "owner-2" });
			expect((await request("")).status).toBe(404);
			stubLabels({ role: "member", visibility: "private", createdBy: "user-1" });
			expect((await request("")).status).toBe(200);
			stubLabels({ role: "member", visibility: "team" });
			const inner = globalThis.fetch; const urls: string[] = [];
			vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => { urls.push(input instanceof Request ? input.url : String(input)); return inner(input, init); }));
			const response = await request("");
			expect(response.status).toBe(200);
			await expect(response.json()).resolves.toMatchObject({ preset: { id: "preset-1", visibility: "team" } });
			const presetUrl = new URL(urls.find((url) => url.includes("/presets?"))!);
			expect(presetUrl.searchParams.get("archived_at")).toBe("is.null");
			expect(presetUrl.searchParams.get("select")).not.toContain("*");
		});

		it("tells members who did not create the preset that they cannot move labels", async () => {
			stubLabels({ role: "member" });
			await expect((await request("/versions")).json()).resolves.toMatchObject({ canManageLabels: false });
		});

		it("moves a label to another version through the guarded RPC", async () => {
			const calls = stubLabels({});
			const response = await request("/labels/Production", { method: "PUT", body: JSON.stringify({ versionId: VERSION_ID }) });
			expect(response.status).toBe(200);
			expect(calls).toEqual([{ name: "set_preset_version_label", body: { p_preset_id: "preset-1", p_label: "production", p_version_id: VERSION_ID, actor_user_id: "user-1" } }]);
			expect(purged.at(-1)).toContain("web-api-marketplace-preset-preset-1");
		});

		it("refuses members on someone else's preset before calling the database", async () => {
			const calls = stubLabels({ role: "member" });
			const response = await request("/labels/production", { method: "PUT", body: JSON.stringify({ versionId: VERSION_ID }) });
			expect(response.status).toBe(403);
			expect(calls).toEqual([]);
		});

		it("rejects labels that look like versions", async () => {
			const calls = stubLabels({});
			const response = await request("/labels/v2", { method: "PUT", body: JSON.stringify({ versionId: VERSION_ID }) });
			expect(response.status).toBe(400);
			await expect(response.json()).resolves.toEqual({ error: "invalid_preset_label" });
			expect(calls).toEqual([]);
		});

		it("maps a version from another preset to 404", async () => {
			stubLabels({ rpc: () => new Response(JSON.stringify({ code: "P0001", message: "preset_version_not_found" }), { status: 400 }) });
			const response = await request("/labels/production", { method: "PUT", body: JSON.stringify({ versionId: VERSION_ID }) });
			expect(response.status).toBe(404);
			await expect(response.json()).resolves.toEqual({ error: "preset_version_not_found" });
		});

		it("removes a label, and reports a label that was not there", async () => {
			const calls = stubLabels({});
			expect((await request("/labels/staging", { method: "DELETE" })).status).toBe(200);
			expect(calls[0]).toEqual({ name: "remove_preset_version_label", body: { p_preset_id: "preset-1", p_label: "staging", actor_user_id: "user-1" } });
			stubLabels({ rpc: () => new Response("false", { status: 200 }) });
			expect((await request("/labels/staging", { method: "DELETE" })).status).toBe(404);
		});
	});

	it("does not expose upstream versions when the source preset is no longer public", async () => {
		const requestedUrls: string[] = [];
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = input instanceof Request ? input.url : String(input);
			requestedUrls.push(url);
			if (url.includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "user-1", email: "user@example.com", created_at: "2025-01-01" }), { status: 200 });
			if (url.includes("workspace_members")) return new Response(JSON.stringify([{ role: "member" }]), { status: 200 });
			if (url.includes("/presets") && url.includes("workspace_id=eq.workspace-1")) {
				return new Response(JSON.stringify([{ id: "fork-1", workspace_id: "workspace-1", created_by: "user-1", source_preset_id: "source-1", upstream_version_id: "version-1", name: "Fork", visibility: "private" }]), { status: 200 });
			}
			if (url.includes("/presets") && url.includes("id=in.%28source-1%29")) return new Response(JSON.stringify([]), { status: 200 });
			return new Response(JSON.stringify([]), { status: 200 });
		}));

		const response = await app.request("https://phaseo.app/api/account/settings/presets/list?workspaceId=workspace-1", {
			headers: { authorization: "Bearer session-token" },
		}, env);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			presets: [{ id: "fork-1", latestUpstreamVersion: null, hasUpstreamUpdate: false }],
		});
		expect(requestedUrls.some((url) => url.includes("visibility=eq.public") && url.includes("archived_at=is.null"))).toBe(true);
		expect(requestedUrls.some((url) => url.includes("/preset_versions"))).toBe(false);
	});

	describe("a teammate's private draft of a team preset", () => {
		const row = {
			id: "preset-1", workspace_id: "workspace-1", created_by: "owner-2", source_preset_id: "source-1",
			name: "Published", slug: "published", description: "Published description", config: { models: ["openai/published"] }, visibility: "team",
			draft_name: "Secret draft", draft_slug: "secret-draft", draft_description: "Secret description", draft_config: { models: ["openai/secret"] }, draft_visibility: "private",
		};
		function stubList({ userId = "user-1", lifecycleFails = false } = {}) {
			vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
				const url = input instanceof Request ? input.url : String(input);
				if (url.includes("/auth/v1/user")) return Response.json({ id: userId, email: "user@example.com", created_at: "2025-01-01" });
				if (url.includes("workspace_members") && url.includes("teams")) return Response.json([{ workspace_id: "workspace-1", teams: { id: "workspace-1", name: "Team" } }]);
				if (url.includes("workspace_members")) return Response.json([{ role: "admin" }]);
				if (url.includes("/presets") && url.includes("workspace_id=eq.workspace-1")) return Response.json([row]);
				// The upstream lookup: failing it exercises the fallback serialisation.
				if (url.includes("/presets") && url.includes("id=in.")) return lifecycleFails ? Response.json({ message: "boom" }, { status: 500 }) : Response.json([]);
				return Response.json([]);
			}));
		}
		const list = () => app.request("https://phaseo.app/api/account/settings/presets/list?workspaceId=workspace-1", { headers: { authorization: "Bearer session-token" } }, env);
		const page = () => app.request("https://phaseo.app/api/account/settings/presets?workspaceId=workspace-1", { headers: { authorization: "Bearer session-token" } }, env);

		it.each([false, true])("shows other members only the published preset in both lists (lifecycle lookup fails: %s)", async (lifecycleFails) => {
			for (const read of [list, page]) {
				stubList({ lifecycleFails });
				const response = await read();
				expect(response.status).toBe(200);
				const text = await response.text();
				expect(text).not.toMatch(/secret/i);
				const body = JSON.parse(text);
				const preset = body.presets?.[0] ?? body.teamsWithPresets?.[0]?.presets?.[0];
				expect(preset).toMatchObject({ id: "preset-1", name: "Published", config: { models: ["openai/published"] }, visibility: "team", hasDraftChanges: false });
			}
		});

		it("doesn't let another admin change or re-share the private draft, and checks again in the write", async () => {
			const patches: URL[] = [];
			const stubWrite = (draftVisibility: string, written: unknown[]) => vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const request = input instanceof Request ? input : new Request(String(input), init);
				const url = new URL(request.url);
				if (url.pathname === "/auth/v1/user") return Response.json({ id: "user-1", email: "user@example.com", created_at: "2025-01-01" });
				if (url.pathname.endsWith("workspace_members")) return Response.json([{ role: "admin" }]);
				if (url.pathname.endsWith("/presets") && request.method === "PATCH") { patches.push(url); return Response.json(written); }
				if (url.pathname.endsWith("/presets")) return Response.json(url.searchParams.has("slug") ? [] : [{ ...row, draft_visibility: draftVisibility }]);
				return Response.json([]);
			}));
			const put = (body: Record<string, unknown>) => app.request("https://phaseo.app/api/account/settings/presets/preset-1", { method: "PUT", headers: { authorization: "Bearer session-token", "content-type": "application/json" }, body: JSON.stringify(body) }, env, { waitUntil() {}, passThroughOnException() {}, props: {} } as never);

			stubWrite("private", []);
			expect((await put({ visibility: "team" })).status).toBe(403);
			expect(patches).toHaveLength(0);

			// Read as shared, but made private before the write lands: the conditional write matches nothing.
			stubWrite("team", []);
			const raced = await put({ description: "Edited" });
			expect(raced.status).toBe(409);
			expect(patches[0].searchParams.get("visibility")).toBe("neq.private");
			expect(patches[0].searchParams.get("or")).toBe("(draft_visibility.is.null,draft_visibility.neq.private)");

			stubWrite("team", [{ id: "preset-1" }]);
			expect((await put({ description: "Edited" })).status).toBe(200);
		});

		it("still shows the creator their draft", async () => {
			stubList({ userId: "owner-2" });
			await expect((await list()).json()).resolves.toMatchObject({ presets: [{ id: "preset-1", name: "Secret draft", config: { models: ["openai/secret"] }, visibility: "private", hasDraftChanges: true }] });
		});
	});

	it("continues to advertise public versions from a public source preset", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = input instanceof Request ? input.url : String(input);
			if (url.includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "user-1", email: "user@example.com", created_at: "2025-01-01" }), { status: 200 });
			if (url.includes("workspace_members")) return new Response(JSON.stringify([{ role: "member" }]), { status: 200 });
			if (url.includes("/presets") && url.includes("workspace_id=eq.workspace-1")) {
				return new Response(JSON.stringify([{ id: "fork-1", workspace_id: "workspace-1", created_by: "user-1", source_preset_id: "source-1", upstream_version_id: "version-1", name: "Fork", visibility: "private" }]), { status: 200 });
			}
			if (url.includes("/presets") && url.includes("id=in.%28source-1%29")) return new Response(JSON.stringify([{ id: "source-1" }]), { status: 200 });
			if (url.includes("/preset_versions")) return new Response(JSON.stringify([{ id: "version-2", preset_id: "source-1", version_number: 2 }]), { status: 200 });
			return new Response(JSON.stringify([]), { status: 200 });
		}));

		const response = await app.request("https://phaseo.app/api/account/settings/presets/list?workspaceId=workspace-1", {
			headers: { authorization: "Bearer session-token" },
		}, env);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			presets: [{ id: "fork-1", latestUpstreamVersion: { id: "version-2", version_number: 2 }, hasUpstreamUpdate: true }],
		});
	});

	it("rejects a non-public source version when creating a fork", async () => {
		const requestedUrls: string[] = [];
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = input instanceof Request ? input.url : String(input);
			requestedUrls.push(url);
			if (url.includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "user-1", email: "user@example.com", created_at: "2025-01-01" }), { status: 200 });
			if (url.includes("workspace_members")) return new Response(JSON.stringify([{ role: "member" }]), { status: 200 });
			if (url.includes("/presets") && url.includes("id=eq.source-1")) return new Response(JSON.stringify([{ id: "source-1", name: "Source", slug: "source", description: null, config: { safe: true }, visibility: "public", active_version_id: "version-1" }]), { status: 200 });
			if (url.includes("/preset_versions")) return new Response(JSON.stringify([]), { status: 200 });
			return new Response(JSON.stringify([]), { status: 200 });
		}));

		const response = await app.request("https://phaseo.app/api/account/settings/presets/source-1/fork", {
			method: "POST",
			headers: { authorization: "Bearer session-token", "content-type": "application/json" },
			body: JSON.stringify({ workspaceId: "workspace-1", sourceVersionId: "private-version" }),
		}, env, { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as any);

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toEqual({ error: "invalid_source_version" });
		expect(requestedUrls.some((url) => url.includes("/preset_versions") && url.includes("visibility=eq.public"))).toBe(true);
	});

	it("rejects a preset whose prompt template does not parse, before touching the database", async () => {
		const requestedUrls: string[] = [];
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = input instanceof Request ? input.url : String(input);
			requestedUrls.push(url);
			if (url.includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "user-1", email: "user@example.com", created_at: "2025-01-01" }), { status: 200 });
			return new Response(JSON.stringify([]), { status: 200 });
		}));

		const response = await app.request("https://phaseo.app/api/account/settings/presets", {
			method: "POST",
			headers: { authorization: "Bearer session-token", "content-type": "application/json" },
			body: JSON.stringify({ workspaceId: "workspace-1", name: "@triage", config: { prompt: { messages: [{ role: "user", content: "Hi {{name" }] } } }),
		}, env, { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as any);

		expect(response.status).toBe(400);
		const body = await response.json() as Record<string, any>;
		expect(body.error).toBe("invalid_prompt_template");
		expect(body.issues[0]).toMatchObject({ keyword: "template_syntax", path: ["prompt", "messages", 0, "content"] });
		expect(requestedUrls.some((url) => url.includes("/presets"))).toBe(false);
	});

	it("returns private routing, preset, and guardrail payloads", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = input instanceof Request ? input.url : String(input);
			if (url.includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "user-1", email: "user@example.com", created_at: "2025-01-01" }), { status: 200 });
			if (url.includes("workspace_members") && url.includes("teams%3Aworkspaces")) return new Response(JSON.stringify([{ workspace_id: "workspace-1", teams: { id: "workspace-1", name: "Team One" } }]), { status: 200 });
			if (url.includes("workspace_members")) return new Response(JSON.stringify([{ role: "admin" }]), { status: 200 });
			if (url.includes("/workspaces") && url.includes("owner_user_id")) return new Response(JSON.stringify([{ owner_user_id: "user-1" }]), { status: 200 });
			if (url.includes("/workspaces")) return new Response(JSON.stringify([{ id: "workspace-1", name: "Team One" }]), { status: 200 });
			if (url.includes("workspace_settings")) return new Response(JSON.stringify([{ routing_mode: "latency", response_healing_enabled: true, response_healing_locked: false, response_healing_mode: "strict", alpha_channel_enabled: true, beta_channel_enabled: false }]), { status: 200 });
			if (url.includes("gateway_dynamic_routes")) return new Response(JSON.stringify([{ id: "route-1", workspace_id: "workspace-1", name: "Production", status: "active", version: 2, config: { cacheAwareRouting: true } }]), { status: 200 });
			if (url.includes("gateway_dynamic_route_keys")) return new Response(JSON.stringify([{ route_id: "route-1", key_id: "key-1" }]), { status: 200 });
			if (url.includes("v2_model_provider_routes")) return new Response(JSON.stringify([
				{ provider_id: "openai", provider_model_id: "pm-native", api_model_id: "openai/native" },
				{ provider_id: "anthropic" },
				{ provider_id: "anthropic-aws" },
				{ provider_id: "anthropic-us" },
			]), { status: 200 });
			if (url.includes("/presets")) return new Response(JSON.stringify([{ id: "preset-1", workspace_id: "workspace-1", name: "@fast", slug: "fast", config: { models: ["openai/gpt-test"] }, visibility: "team", draft_name: "@fast", draft_slug: "fast", draft_config: { models: ["openai/gpt-test"], parameters: { temperature: 0.2 } }, draft_visibility: "team" }]), { status: 200 });
			if (url.includes("/keys")) return new Response(JSON.stringify([{ id: "key-1", name: "Production", prefix: "ph_", status: "active" }]), { status: 200 });
			if (url.includes("v2_providers")) {
				const providers = url.includes("provider_family_id")
					? [
						{ api_provider_id: "openai", api_provider_name: "OpenAI", provider_family_id: "openai", offer_label: null, offer_scope: "global", status: "active", routable: true, routing_enabled: true },
						{ api_provider_id: "anthropic", api_provider_name: "Anthropic", provider_family_id: "anthropic", offer_label: null, offer_scope: "global", status: "active", routable: true, routing_enabled: true },
						{ api_provider_id: "anthropic-aws", api_provider_name: "Anthropic", provider_family_id: "anthropic", offer_label: "AWS", offer_scope: "specialized", status: "active", routable: true, routing_enabled: true },
						{ api_provider_id: "anthropic-us", api_provider_name: "Anthropic", provider_family_id: "anthropic", offer_label: "US", offer_scope: "regional", status: "active", routable: true, routing_enabled: true },
					]
					: [{ api_provider_id: "openai", api_provider_name: "OpenAI", status: "active", routing_enabled: true }];
				return new Response(JSON.stringify(providers), { status: 200 });
			}
			if (url.includes("data_api_provider_models")) return new Response(JSON.stringify([{ provider_id: "openai", api_model_id: "gpt-test", internal_model_id: "openai/gpt-test", is_active_gateway: true }]), { status: 200 });
			if (url.includes("v2_effective_route_capabilities")) {
                expect(new URL(url).searchParams.get("or")).toContain("metadata->data_policy.not.is.null");
                expect(new URL(url).searchParams.get("provider_model_id")).toBe("in.(pm-native)");
                expect(new URL(url).searchParams.get("limit")).toBe("500");
                return new Response(JSON.stringify([{ provider_model_id: "pm-native", capability_id: "text.generate", metadata: { data_policy: { tier: "private", confidence: "confirmed", zeroDataRetention: true, zdrEligibility: "eligible" } } }]), { status: 200 });
            }
			if (url.includes("workspace_guardrails")) return new Response(JSON.stringify([{ id: "guardrail-1", workspace_id: "workspace-1", name: "Default", enabled: true }]), { status: 200 });
			if (url.includes("workspace_guardrail_assignments")) return new Response(JSON.stringify([
				{ guardrail_id: "guardrail-1", target_type: "key", target_id: "key-1" },
				{ guardrail_id: "guardrail-1", target_type: "department", target_id: "department-1" },
				{ guardrail_id: "guardrail-1", target_type: "workspace", target_id: null },
			]), { status: 200 });
			return new Response(JSON.stringify([]), { status: 200 });
		}));
		const init = { headers: { authorization: "Bearer session-token" } };
		const [routing, presets, guardrails, editor, dynamicRoutes] = await Promise.all([
			app.request("https://phaseo.app/api/account/settings/routing?workspaceId=workspace-1", init, env),
			app.request("https://phaseo.app/api/account/settings/presets?workspaceId=workspace-1", init, env),
			app.request("https://phaseo.app/api/account/settings/guardrails?workspaceId=workspace-1", init, env),
			app.request("https://phaseo.app/api/account/settings/guardrails/editor?workspaceId=workspace-1&mode=edit&guardrailId=guardrail-1", init, env),
			app.request("https://phaseo.app/api/account/settings/dynamic-routes?workspaceId=workspace-1", init, env),
		]);
		for (const response of [routing, presets, guardrails, editor, dynamicRoutes]) {
			expect(response.status).toBe(200);
			expect(response.headers.get("cache-control")).toBe("private, no-store");
			expect(response.headers.get("cloudflare-cdn-cache-control")).toBeNull();
		}
		await expect(routing.json()).resolves.toMatchObject({ routingMode: "latency", responseHealingEnabled: true, responseHealingMode: "strict", teamName: "Team One" });
		await expect(presets.json()).resolves.toMatchObject({ currentUserId: "user-1", teamsWithPresets: [{ id: "workspace-1", presets: [{ id: "preset-1", hasDraftChanges: true }] }] });
		await expect(guardrails.json()).resolves.toMatchObject({
			guardrails: [{ id: "guardrail-1" }],
			guardrailKeyIdsByGuardrailId: { "guardrail-1": ["key-1"] },
			guardrailMemberIdsByGuardrailId: {},
			guardrailDepartmentIdsByGuardrailId: { "guardrail-1": ["department-1"] },
			workspaceGuardrailIds: ["guardrail-1"],
			keys: [{ id: "key-1" }],
		});
		const editorBody = await editor.json();
        expect(editorBody.activeProviderModels).toEqual(expect.arrayContaining([
            expect.objectContaining({ providerId: "openai", capabilities: [{ id: "text.generate", dataPolicy: { tier: "private", confidence: "confirmed", zeroDataRetention: true, zdrEligibility: "eligible" } }] }),
        ]));
		expect(editorBody).toMatchObject({
			mode: "edit",
			guardrail: { id: "guardrail-1" },
			initialKeyIds: ["key-1"],
			initialMemberIds: [],
			initialDepartmentIds: ["department-1"],
			initialWorkspaceAssigned: true,
			teamName: "Team One",
			providers: [
				{ id: "openai", name: "OpenAI", familyId: "openai", offerLabel: null, offerScope: "global" },
				{ id: "anthropic", name: "Anthropic", familyId: "anthropic", offerLabel: null, offerScope: "global" },
				{ id: "anthropic-aws", name: "Anthropic", familyId: "anthropic", offerLabel: "AWS", offerScope: "specialized" },
				{ id: "anthropic-us", name: "Anthropic", familyId: "anthropic", offerLabel: "US", offerScope: "regional" },
			],
		});
		await expect(dynamicRoutes.json()).resolves.toMatchObject({
			routes: [{ id: "route-1", keyIds: ["key-1"] }],
			providers: [{ id: "openai", name: "OpenAI", status: "active", routingStatus: "active" }],
		});
	});

	it("reads every page of keys and assignments for the guardrails view", async () => {
		const pageRequests: string[] = [];
		// Serves a full first page, then a short one, the way PostgREST caps a response.
		const page = <T,>(url: string, make: (index: number) => T) => {
			const params = new URL(url).searchParams;
			pageRequests.push(`${new URL(url).pathname.split("/").pop()}:${params.get("offset") ?? "0"}:${params.get("order")}`);
			const offset = Number(params.get("offset") ?? 0);
			return new Response(JSON.stringify(Array.from({ length: offset === 0 ? 500 : 1 }, (_, index) => make(offset + index))), { status: 200 });
		};
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = input instanceof Request ? input.url : String(input);
			if (url.includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "user-1", email: "user@example.com", created_at: "2025-01-01" }), { status: 200 });
			if (url.includes("workspace_members") && url.includes("teams%3Aworkspaces")) return new Response(JSON.stringify([{ workspace_id: "workspace-1", teams: { id: "workspace-1", name: "Team One" } }]), { status: 200 });
			if (url.includes("workspace_members")) return new Response(JSON.stringify([{ role: "admin" }]), { status: 200 });
			if (url.includes("/workspaces")) return new Response(JSON.stringify([{ id: "workspace-1", name: "Team One", owner_user_id: "user-1" }]), { status: 200 });
			if (url.includes("workspace_guardrails")) return new Response(JSON.stringify([{ id: "guardrail-1", workspace_id: "workspace-1", name: "Default", enabled: true }]), { status: 200 });
			if (url.includes("workspace_guardrail_assignments")) return page(url, (index) => ({ guardrail_id: "guardrail-1", target_type: "key", target_id: `key-${index}` }));
			if (url.includes("/keys?")) return page(url, (index) => ({ id: `key-${index}`, name: "Key", prefix: "ph_", status: "active" }));
			return new Response(JSON.stringify([]), { status: 200 });
		}));

		const response = await app.request("https://phaseo.app/api/account/settings/guardrails?workspaceId=workspace-1", { headers: { authorization: "Bearer session-token" } }, env);

		expect(response.status).toBe(200);
		const body = await response.json() as { keys: unknown[]; guardrailKeyIdsByGuardrailId: Record<string, string[]> };
		expect(body.keys).toHaveLength(501);
		expect(body.guardrailKeyIdsByGuardrailId["guardrail-1"]).toHaveLength(501);
		expect(pageRequests).toEqual(expect.arrayContaining([
			"keys:0:created_at.desc,id.asc", "keys:500:created_at.desc,id.asc",
			"workspace_guardrail_assignments:0:guardrail_id.asc,target_type.asc,target_id.asc",
			"workspace_guardrail_assignments:500:guardrail_id.asc,target_type.asc,target_id.asc",
		]));
	});

	describe("departments in the guardrails view", () => {
		function stub(scopes: () => Response) {
			vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
				const url = input instanceof Request ? input.url : String(input);
				if (url.includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "user-1", email: "user@example.com", created_at: "2025-01-01" }), { status: 200 });
				if (url.includes("/rpc/guardrail_department_scopes")) return scopes();
				if (url.includes("workspace_departments")) return new Response(JSON.stringify([{ id: "department-1", name: "Engineering" }, { id: "department-2", name: " " }]), { status: 200 });
				if (url.includes("workspace_members") && url.includes("teams%3Aworkspaces")) return new Response(JSON.stringify([{ workspace_id: "workspace-1", teams: { id: "workspace-1", name: "Team One" } }]), { status: 200 });
				if (url.includes("workspace_members")) return new Response(JSON.stringify([{ role: "admin" }]), { status: 200 });
				if (url.includes("/workspaces")) return new Response(JSON.stringify([{ id: "workspace-1", name: "Team One", owner_user_id: "user-1" }]), { status: 200 });
				return new Response(JSON.stringify([]), { status: 200 });
			}));
		}
		const request = () => app.request("https://phaseo.app/api/account/settings/guardrails?workspaceId=workspace-1", { headers: { authorization: "Bearer session-token" } }, env);

		it("returns the departments and the ones that reach each key and member", async () => {
			stub(() => new Response(JSON.stringify([
				{ target_type: "key", target_id: "key-1", department_id: "department-1" },
				{ target_type: "key", target_id: "key-1", department_id: "department-2" },
				{ target_type: "member", target_id: "user-1", department_id: "department-1" },
			]), { status: 200 }));
			const response = await request();
			expect(response.status).toBe(200);
			await expect(response.json()).resolves.toMatchObject({
				departments: [{ id: "department-1", name: "Engineering" }, { id: "department-2", name: "department-2" }],
				keyDepartmentIds: { "key-1": ["department-1", "department-2"] },
				memberDepartmentIds: { "user-1": ["department-1"] },
			});
		});

		it("still loads before guardrail_department_scopes is deployed", async () => {
			stub(() => new Response(JSON.stringify({ code: "PGRST202", message: "Could not find the function public.guardrail_department_scopes(p_workspace_id) in the schema cache" }), { status: 404 }));
			const response = await request();
			expect(response.status).toBe(200);
			await expect(response.json()).resolves.toMatchObject({ keyDepartmentIds: {}, memberDepartmentIds: {}, departments: [{ id: "department-1" }, { id: "department-2" }] });
		});

		it("fails rather than showing keys without their departments when the scopes cannot be read", async () => {
			stub(() => new Response(JSON.stringify({ code: "57014", message: "timeout" }), { status: 500 }));
			expect((await request()).status).toBe(503);
		});
	});

	it("replaces dynamic route key assignments through the atomic RPC", async () => {
		let rpcBody: Record<string, unknown> | null = null;
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const request = input instanceof Request ? input : new Request(input, init);
			const url = request.url;
			if (url.includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "user-1", email: "user@example.com", created_at: "2025-01-01" }), { status: 200 });
			if (url.includes("/rpc/replace_gateway_dynamic_route_keys")) {
				rpcBody = await request.json<Record<string, unknown>>();
				return new Response("null", { status: 200 });
			}
			if (url.includes("workspace_members")) return new Response(JSON.stringify([{ role: "admin" }]), { status: 200 });
			if (url.includes("/workspaces")) return new Response(JSON.stringify([{ owner_user_id: "user-1" }]), { status: 200 });
			if (url.includes("gateway_dynamic_routes")) return new Response(JSON.stringify([{ id: "route-1", workspace_id: "workspace-1", version: 1 }]), { status: 200 });
			if (url.includes("gateway_dynamic_route_keys")) return new Response(JSON.stringify([{ key_id: "key-old" }]), { status: 200 });
			if (url.includes("/keys?")) return new Response(JSON.stringify([{ id: "key-1" }]), { status: 200 });
			return new Response(JSON.stringify([]), { status: 200 });
		}));

		const response = await app.request("https://phaseo.app/api/account/settings/dynamic-routes/route-1/keys", {
			method: "PUT",
			headers: { authorization: "Bearer session-token", "content-type": "application/json" },
			body: JSON.stringify({ keyIds: ["key-1"] }),
		}, env, { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as any);

		expect(response.status).toBe(200);
		expect(rpcBody).toEqual({
			p_route_id: "route-1",
			p_key_ids: ["key-1"],
			p_attached_by: "user-1",
		});
	});
});

describe("successor routing settings", () => {
	const overviewRow = {
		model: "lab/old", name: "Old", status: "retired", deprecated_at: null, retired_at: "2026-09-01T00:00:00+00:00",
		unserved_since: "2026-10-20T00:00:00+00:00", last_used_at: "2026-10-28T00:00:00+00:00", requests: 12,
		suggested_replacement: "lab/new", approved: true, workspace_override: false, replacement: "lab/new", replacement_name: "New",
		target: "lab/new", reason: "eligible", price_ratio: "1.25", price_comparable: true, price_skipped_meters: ["native_web_search_requests"],
		served_by: [{ model: "lab/new", requests: 3, last_at: "2026-10-28T00:00:00+00:00" }],
	};
	function stub(role: string, writes: Array<{ url: string; method: string; body: unknown }>, models: string[] = ["lab/old", "lab/new"], overview: Response | null = null) {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const request = input instanceof Request ? input : new Request(input, init);
			const url = request.url;
			if (url.includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "user-1", email: "user@example.com", created_at: "2025-01-01" }), { status: 200 });
			if (url.includes("workspace_members")) return new Response(JSON.stringify([{ role }]), { status: 200 });
			if (url.includes("/workspaces")) return new Response(JSON.stringify([{ owner_user_id: "owner-1" }]), { status: 200 });
			if (request.method !== "GET" && request.method !== "HEAD") {
				const text = await request.text();
				if (url.includes("/rpc/get_workspace_model_successor_overview")) return overview ?? new Response(JSON.stringify([overviewRow]), { status: 200 });
				writes.push({ url, method: request.method, body: text ? JSON.parse(text) : null });
				return new Response(null, { status: 201 });
			}
			if (url.includes("v2_models")) return new Response(JSON.stringify(models.map((model_slug) => ({ model_slug, status: model_slug.endsWith("draft") ? "draft" : "active" }))), { status: 200 });
			if (url.includes("workspace_model_successor_overrides")) {
				return new Response(JSON.stringify([{ model_slug: "lab/old", successor_model_slug: null, updated_at: "2026-10-12T00:00:00Z" }]), { status: 200, headers: { "content-range": "0-0/1" } });
			}
			if (url.includes("workspace_settings")) {
				return new Response(JSON.stringify([{ model_successor_redirect_enabled: true, model_successor_price_policy: "limit", model_successor_max_price_increase_percent: 20 }]), { status: 200 });
			}
			return new Response(JSON.stringify([]), { status: 200 });
		}));
	}
	const send = (path: string, method: string, body: unknown) => app.request(`https://phaseo.app/api/account/settings${path}`, {
		method,
		headers: { authorization: "Bearer session-token", "content-type": "application/json" },
		body: JSON.stringify(body),
	}, env);

	it("returns the settings, replacements and whether the caller can change them", async () => {
		stub("member", []);
		const response = await app.request("https://phaseo.app/api/account/settings/routing/successor?workspaceId=workspace-1", { headers: { authorization: "Bearer session-token" } }, env);
		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toBe("private, no-store");
		await expect(response.json()).resolves.toEqual({
			canManage: false,
			enabled: true,
			pricePolicy: "limit",
			maxPriceIncreasePercent: 20,
			replacements: [{ model: "lab/old", successor: null, updatedAt: "2026-10-12T00:00:00Z" }],
			models: [{
				model: "lab/old", name: "Old", status: "retired", retiredAt: "2026-09-01T00:00:00+00:00", unservedSince: "2026-10-20T00:00:00+00:00",
				lastUsedAt: "2026-10-28T00:00:00+00:00", requests: 12, suggestedReplacement: "lab/new", replacement: "lab/new", replacementName: "New",
				workspaceOverride: false, reason: "eligible", priceRatio: 1.25, priceComparable: true, priceSkippedMeters: ["native_web_search_requests"],
				servedBy: [{ model: "lab/new", requests: 3, lastAt: "2026-10-28T00:00:00+00:00" }],
			}],
			modelsAvailable: true,
			workspaceId: "workspace-1",
		});
	});

	it("still returns the settings when the affected models cannot be loaded", async () => {
		stub("admin", [], undefined, new Response(JSON.stringify({ message: "timeout" }), { status: 500 }));
		const response = await app.request("https://phaseo.app/api/account/settings/routing/successor?workspaceId=workspace-1", { headers: { authorization: "Bearer session-token" } }, env);
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({ canManage: true, enabled: true, models: [], modelsAvailable: false });
	});

	it("lets admins save the setting and validates it", async () => {
		const writes: Array<{ url: string; method: string; body: unknown }> = [];
		stub("admin", writes);
		expect((await send("/routing/successor", "PUT", { workspaceId: "workspace-1", enabled: true, pricePolicy: "limit", maxPriceIncreasePercent: 25 })).status).toBe(200);
		expect(writes[0]?.body).toMatchObject({ workspace_id: "workspace-1", model_successor_redirect_enabled: true, model_successor_price_policy: "limit", model_successor_max_price_increase_percent: 25 });
		expect((await send("/routing/successor", "PUT", { workspaceId: "workspace-1", enabled: true, pricePolicy: "never", maxPriceIncreasePercent: 25 })).status).toBe(200);
		expect(writes[1]?.body).toMatchObject({ model_successor_price_policy: "never", model_successor_max_price_increase_percent: 0 });
		for (const body of [
			{ workspaceId: "workspace-1", enabled: "yes", pricePolicy: "never" },
			{ workspaceId: "workspace-1", enabled: true, pricePolicy: "sometimes" },
			{ workspaceId: "workspace-1", enabled: true, pricePolicy: "limit", maxPriceIncreasePercent: 1001 },
			{ workspaceId: "workspace-1", enabled: true, pricePolicy: "limit", maxPriceIncreasePercent: 2.5 },
		]) {
			expect((await send("/routing/successor", "PUT", body)).status).toBe(400);
		}
		expect(writes).toHaveLength(2);
	});

	it("rejects changes from members", async () => {
		const writes: Array<{ url: string; method: string; body: unknown }> = [];
		stub("member", writes);
		expect((await send("/routing/successor", "PUT", { workspaceId: "workspace-1", enabled: true, pricePolicy: "never" })).status).toBe(403);
		expect((await send("/routing/successor/replacements", "PUT", { workspaceId: "workspace-1", model: "lab/old", successor: "lab/new" })).status).toBe(403);
		expect((await send("/routing/successor/replacements", "DELETE", { workspaceId: "workspace-1", model: "lab/old" })).status).toBe(403);
		expect(writes).toHaveLength(0);
	});

	it("saves, blocks and removes a workspace replacement", async () => {
		const writes: Array<{ url: string; method: string; body: unknown }> = [];
		stub("admin", writes);
		expect((await send("/routing/successor/replacements", "PUT", { workspaceId: "workspace-1", model: "Lab/Old", successor: "lab/new" })).status).toBe(200);
		expect(writes[0]?.body).toMatchObject({ workspace_id: "workspace-1", model_slug: "lab/old", successor_model_slug: "lab/new", created_by: "user-1" });
		expect((await send("/routing/successor/replacements", "PUT", { workspaceId: "workspace-1", model: "lab/old", successor: null })).status).toBe(200);
		expect(writes[1]?.body).toMatchObject({ model_slug: "lab/old", successor_model_slug: null });
		expect((await send("/routing/successor/replacements", "DELETE", { workspaceId: "workspace-1", model: "lab/old" })).status).toBe(200);
		expect(writes[2]).toMatchObject({ method: "DELETE" });
		expect(writes[2]?.url).toContain("model_slug=eq.lab%2Fold");
	});

	it("rejects unknown or self-referencing replacements", async () => {
		const writes: Array<{ url: string; method: string; body: unknown }> = [];
		stub("admin", writes, ["lab/old", "lab/draft"]);
		const cases: Array<[unknown, string]> = [
			[{ model: "lab/old", successor: "lab/old" }, "successor_is_model"],
			[{ model: "lab/old", successor: "lab/missing" }, "unknown_successor"],
			[{ model: "lab/old", successor: "lab/draft" }, "inactive_successor"],
			[{ model: "lab/missing", successor: null }, "unknown_model"],
			[{ model: "not a slug", successor: null }, "invalid_model"],
			[{ model: "lab/old" }, "invalid_successor"],
		];
		for (const [body, error] of cases) {
			const response = await send("/routing/successor/replacements", "PUT", { workspaceId: "workspace-1", ...(body as object) });
			expect(response.status).toBe(400);
			await expect(response.json()).resolves.toMatchObject({ error });
		}
		expect(writes).toHaveLength(0);
	});
});
