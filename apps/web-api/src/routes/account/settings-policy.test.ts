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
	it("returns the private effective Chat policy with assigned member guardrails", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = input instanceof Request ? input.url : String(input);
			if (url.includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "user-1", email: "user@example.com", created_at: "2025-01-01" }), { status: 200 });
			if (url.includes("workspace_member_guardrails")) return new Response(JSON.stringify([{ guardrail_id: "guardrail-1" }]), { status: 200 });
			if (url.includes("account_guardrail_settings")) return new Response(JSON.stringify([{ provider_restriction_mode: "none", provider_restriction_provider_ids: [], model_restriction_mode: "blocklist", model_restriction_model_ids: ["inclusionai/ling-3.0-flash-sante:free"] }]), { status: 200 });
			if (url.includes("workspace_members")) return new Response(JSON.stringify([{ role: "member" }]), { status: 200 });
			if (url.includes("/workspaces")) return new Response(JSON.stringify([{ owner_user_id: "owner-1" }]), { status: 200 });
			if (url.includes("workspace_settings")) return new Response(JSON.stringify([{ provider_restriction_mode: "blocklist", provider_restriction_provider_ids: ["novita"], model_restriction_mode: "none", model_restriction_model_ids: [] }]), { status: 200 });
			if (url.includes("workspace_guardrails")) return new Response(JSON.stringify([{ id: "guardrail-1", name: "Team Safety", enabled: true, provider_restriction_mode: "blocklist", provider_restriction_provider_ids: ["openai"], model_restriction_mode: "none", allowed_api_model_ids: [] }]), { status: 200 });
			return new Response(JSON.stringify([]), { status: 200 });
		}));

		const response = await app.request("https://phaseo.app/api/account/settings/chat/effective-policy?workspaceId=workspace-1", { headers: { authorization: "Bearer session-token" } }, env);
		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toBe("private, no-store");
		await expect(response.json()).resolves.toMatchObject({
			workspace: { provider: { mode: "blocklist", ids: ["novita"] } },
			guardrails: [{ id: "guardrail-1", name: "Team Safety", provider: { mode: "blocklist", ids: ["openai"] } }],
		});
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
			if (url.includes("v2_route_capabilities")) return new Response(JSON.stringify([
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
				{ provider_id: "openai" },
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
			if (url.includes("workspace_guardrails")) return new Response(JSON.stringify([{ id: "guardrail-1", workspace_id: "workspace-1", name: "Default", enabled: true }]), { status: 200 });
			if (url.includes("key_guardrails")) return new Response(JSON.stringify([{ guardrail_id: "guardrail-1", key_id: "key-1" }]), { status: 200 });
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
		await expect(guardrails.json()).resolves.toMatchObject({ guardrails: [{ id: "guardrail-1" }], guardrailKeyIdsByGuardrailId: { "guardrail-1": ["key-1"] }, keys: [{ id: "key-1" }] });
		const editorBody = await editor.json();
		expect(editorBody).toMatchObject({
			mode: "edit",
			guardrail: { id: "guardrail-1" },
			initialKeyIds: ["key-1"],
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
