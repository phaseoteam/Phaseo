import { afterEach, describe, expect, it, vi } from "vitest";
import app from "@/index";

const env = { ENV: "development" as const, SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: "anon-key", SUPABASE_SERVICE_ROLE_KEY: "service-role-key" };

afterEach(() => vi.unstubAllGlobals());

describe("account usage settings routes", () => {
	it("returns workspace-private lifecycle warnings with usage and replacement context", async () => {
		const retirementDate = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = input instanceof Request ? input.url : String(input);
			if (url.includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "user-1", created_at: "2025-01-01" }), { status: 200 });
			if (url.includes("workspace_members")) return new Response(JSON.stringify([{ role: "admin" }]), { status: 200 });
			if (url.includes("/workspaces")) return new Response(JSON.stringify([{ owner_user_id: "user-1" }]), { status: 200 });
			if (url.includes("/rpc/get_workspace_model_last_used")) return new Response(JSON.stringify([{ model_id: "gpt-old-api", last_used_at: new Date().toISOString() }]), { status: 200 });
			if (url.includes("data_api_provider_models")) return new Response(JSON.stringify([{ api_model_id: "gpt-old-api", provider_api_model_id: "provider-model-1", internal_model_id: "openai/gpt-old" }]), { status: 200 });
			if (url.includes("data_models") && url.includes("previous_model_id=in")) return new Response(JSON.stringify([{ model_id: "openai/gpt-new", previous_model_id: "openai/gpt-old" }]), { status: 200 });
			if (url.includes("data_models")) return new Response(JSON.stringify([{ model_id: "openai/gpt-old", name: "GPT Old", organisation_id: "openai", deprecation_date: null, retirement_date: retirementDate, previous_model_id: null }]), { status: 200 });
			return new Response(JSON.stringify([]), { status: 200 });
		}));
		const response = await app.request(
			"https://phaseo.app/api/account/settings/usage/alerts?workspaceId=workspace-1",
			{ headers: { authorization: "Bearer session-token" } },
			env,
		);
		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toBe("private, no-store");
		expect(response.headers.get("cloudflare-cdn-cache-control")).toBeNull();
		await expect(response.json()).resolves.toMatchObject({
			signedIn: true,
			workspaceId: "workspace-1",
			warnings: [{ modelId: "openai/gpt-old", lastUsedAt: expect.any(String), retirementDaysUntil: 5, replacementModelId: "openai/gpt-new", countAsAlert: true, severity: "critical" }],
		});
	});

	it("returns private logs, jobs, and session views with metadata", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = input instanceof Request ? input.url : String(input);
			if (url.includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "user-1", created_at: "2025-01-01" }), { status: 200 });
			if (url.includes("workspace_members")) return new Response(JSON.stringify([{ role: "admin" }]), { status: 200 });
			if (url.includes("/workspaces")) return new Response(JSON.stringify([{ owner_user_id: "user-1" }]), { status: 200 });
			if (url.includes("gateway_async_operations")) return new Response(JSON.stringify([{ kind: "video", internal_id: "job-1", request_id: "request-1", app_id: "app-1", provider: "openai", model: "openai/gpt-test", status: "completed", created_at: "2026-07-17T00:00:00Z", updated_at: "2026-07-17T00:01:00Z", meta: { webhook: { status: "delivered" } } }]), { status: 200 });
			if (url.includes("gateway_usage_rollup_15m")) return new Response(JSON.stringify([{ canonical_model_id: "openai/gpt-test", provider: "openai" }]), { status: 200 });
			if (url.includes("gateway_requests")) {
				if (url.includes("select=session_id")) return new Response(JSON.stringify([{ session_id: "session-1", created_at: "2026-07-17T00:00:00Z", cost_nanos: 1000, app_id: "app-1", model_id: "openai/gpt-test", provider: "openai", end_user_id: "end-user-1" }]), { status: 200 });
				if (url.includes("select=request_id")) return new Response(JSON.stringify([{ request_id: "request-1", created_at: "2026-07-17T00:00:00Z", endpoint: "chat/completions", model_id: "openai/gpt-test", provider: "openai", app_id: "app-1", success: true, cost_nanos: 1000 }]), { status: 200, headers: { "content-range": "0-0/1" } });
				return new Response(JSON.stringify([{ model_id: "openai/gpt-test", provider: "openai", app_id: "app-1" }]), { status: 200 });
			}
			if (url.includes("/keys")) return new Response(JSON.stringify([{ id: "key-1", name: "Production", prefix: "ph_" }]), { status: 200 });
			if (url.includes("data_api_provider_models")) return new Response(JSON.stringify([{ api_model_id: "gpt-test", model_id: "openai/gpt-test" }]), { status: 200 });
			if (url.includes("data_models")) return new Response(JSON.stringify([{ model_id: "openai/gpt-test", name: "GPT Test", organisation_id: "openai", organisation: { name: "OpenAI" } }]), { status: 200 });
			if (url.includes("data_api_providers")) return new Response(JSON.stringify([{ api_provider_id: "openai", api_provider_name: "OpenAI", colour: "#000" }]), { status: 200 });
			if (url.includes("api_apps")) return new Response(JSON.stringify([{ id: "app-1", title: "Example App", app_key: "example", image_url: null }]), { status: 200 });
			return new Response(JSON.stringify([]), { status: 200 });
		}));
		const init = { headers: { authorization: "Bearer token" } };
		const [logs, jobs, sessions] = await Promise.all([
			app.request("https://phaseo.app/api/account/settings/usage/logs?workspaceId=workspace-1&view=logs", init, env),
			app.request("https://phaseo.app/api/account/settings/usage/logs?workspaceId=workspace-1&view=jobs", init, env),
			app.request("https://phaseo.app/api/account/settings/usage/logs?workspaceId=workspace-1&view=sessions", init, env),
		]);
		for (const response of [logs, jobs, sessions]) {
			expect(response.status).toBe(200);
			expect(response.headers.get("cache-control")).toBe("private, no-store");
		}
		await expect(logs.json()).resolves.toMatchObject({ view: "logs", data: { dedupedModels: ["openai/gpt-test"], initialRequestsPage: { data: [{ request_id: "request-1" }], total: 1 }, providerNameEntries: [["openai", "OpenAI"]] } });
		await expect(jobs.json()).resolves.toMatchObject({ view: "jobs", data: { recentJobs: [{ internal_id: "job-1", webhook: { status: "delivered" } }], jobProviders: ["openai"] } });
		await expect(sessions.json()).resolves.toMatchObject({ view: "sessions", data: { sessions: [{ session_id: "session-1", request_count: 1, total_cost_nanos: 1000 }], sessionAppIds: ["app-1"] } });
	});

	it("returns the private observability windows and lookup metadata", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = input instanceof Request ? input.url : String(input);
			if (url.includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "user-1", created_at: "2025-01-01" }), { status: 200 });
			if (url.includes("workspace_members")) return new Response(JSON.stringify([{ role: "admin" }]), { status: 200 });
			if (url.includes("/workspaces")) return new Response(JSON.stringify([{ owner_user_id: "user-1" }]), { status: 200 });
			if (url.includes("gateway_requests")) return new Response(JSON.stringify([{ created_at: "2026-07-17T00:00:00Z", model_id: "openai/gpt-test", app_id: "app-1", key_id: "key-1", usage: { total_tokens: 12 }, cost_nanos: 1000, success: true }]), { status: 200 });
			if (url.includes("/keys")) return new Response(JSON.stringify([{ id: "key-1", name: "Production", prefix: "ph_" }]), { status: 200 });
			if (url.includes("data_api_provider_models")) return new Response(JSON.stringify([]), { status: 200 });
			if (url.includes("data_models")) return new Response(JSON.stringify([{ model_id: "openai/gpt-test", name: "GPT Test", organisation_id: "openai", organisation: { name: "OpenAI" } }]), { status: 200 });
			if (url.includes("api_apps")) return new Response(JSON.stringify([{ id: "app-1", title: "Example App", app_key: "example", image_url: null }]), { status: 200 });
			return new Response(JSON.stringify([]), { status: 200 });
		}));
		const params = new URLSearchParams({
			workspaceId: "workspace-1",
			from: "2026-07-17T00:00:00Z",
			to: "2026-07-18T00:00:00Z",
			previousFrom: "2026-07-16T00:00:00Z",
			previousTo: "2026-07-17T00:00:00Z",
		});
		const response = await app.request(`https://phaseo.app/api/account/settings/usage/observability?${params}`, { headers: { authorization: "Bearer token" } }, env);
		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toBe("private, no-store");
		await expect(response.json()).resolves.toMatchObject({
			workspaceId: "workspace-1",
			keys: [{ id: "key-1", name: "Production" }],
			current: { rows: [{ model_id: "openai/gpt-test" }], isSampled: false, limit: 5000 },
			previous: { rows: [{ model_id: "openai/gpt-test" }] },
			modelMetadataEntries: [["openai/gpt-test", { modelName: "GPT Test" }]],
			appNameEntries: [["app-1", "Example App"]],
		});
	});
});
