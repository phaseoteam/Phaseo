import { afterEach, describe, expect, it, vi } from "vitest";
import app from "@/index";
import { sortUpstreamRequestsNewestFirst } from "./settings-usage";

const env = { ENV: "development" as const, SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: "anon-key", SUPABASE_SERVICE_ROLE_KEY: "service-role-key" };

afterEach(() => vi.unstubAllGlobals());

describe("account usage settings routes", () => {
	it("scopes realtime session history to the authorized workspace and selects no secrets", async () => {
		let query: URL | undefined;
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = new URL(input instanceof Request ? input.url : String(input));
			if (url.pathname.includes("/auth/v1/user")) return Response.json({ id: "user-1" });
			if (url.pathname.includes("workspace_members")) return Response.json([{ role: "member" }]);
			if (url.pathname.includes("/workspaces")) return Response.json([{ owner_user_id: "user-1" }]);
			if (url.pathname.includes("gateway_realtime_sessions")) { query = url; return Response.json([{ session_id: "rt_test", status: "billing_unresolved", reserved_nanos: 5000000000 }]); }
			return Response.json([]);
		}));
		const response = await app.request("https://phaseo.app/api/account/settings/usage/realtime?workspaceId=workspace-1", { headers: { authorization: "Bearer session-token" } }, env);
		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toBe("private, no-store");
		expect(query?.searchParams.get("workspace_id")).toBe("eq.workspace-1");
		expect(query?.searchParams.get("select")).not.toMatch(/metadata|secret|error_message/);
		expect(await response.json()).toMatchObject({ sessions: [{ status: "billing_unresolved" }] });
	});
	it("denies realtime history to nonmembers before querying sessions", async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = input instanceof Request ? input.url : String(input);
			return Response.json(url.includes("/auth/v1/user") ? { id: "outsider" } : []);
		});
		vi.stubGlobal("fetch", fetchMock);
		const response = await app.request("https://phaseo.app/api/account/settings/usage/realtime?workspaceId=workspace-1", { headers: { authorization: "Bearer session-token" } }, env);
		expect(response.status).toBe(403);
		expect(fetchMock.mock.calls.some(([url]) => String(url).includes("gateway_realtime_sessions"))).toBe(false);
	});
	it.each(["video", "batch"])("filters %s jobs before limiting and returns safe normalized logging fields", async (kind) => {
		let jobUrl = "";
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = input instanceof Request ? input.url : String(input);
			if (url.includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "user-1", created_at: "2025-01-01" }));
			if (url.includes("workspace_members")) return new Response(JSON.stringify([{ role: "admin" }]));
			if (url.includes("/workspaces")) return new Response(JSON.stringify([{ owner_user_id: "user-1" }]));
			if (url.includes("gateway_async_operations")) {
				jobUrl = url;
				return new Response(JSON.stringify([{ kind, internal_id: "job", status: "completed", created_at: "2026-09-06T10:00:00Z", updated_at: "2026-09-06T10:01:00Z", meta: { billingReason: "unexpected_zero_cost", submissionState: "accepted", providerSecret: "do-not-expose", webhook: { url: "https://receiver.test/hook", secret: "do-not-expose" }, webhookAttempts: [{ event_type: `${kind}.completed`, status: "scheduled_retry", attempt_number: 1, max_attempts: 4, tried_at: "2026-09-06T10:01:00Z", response_status: 503 }] } }]));
			}
			return new Response("[]");
		}));
		const response = await app.request(`https://phaseo.app/api/account/settings/usage/logs?workspaceId=workspace-1&view=jobs&job_kind=${kind}`, { headers: { authorization: "Bearer session-token" } }, env);
		expect(response.status).toBe(200);
		expect(new URL(jobUrl).searchParams.getAll("kind")).toContain(`eq.${kind}`);
		const payload = await response.json() as any;
		expect(payload.data.recentJobs[0]).toMatchObject({ kind, billing_reason: "unexpected_zero_cost", submission_state: "accepted", webhook: { attempt_count: 1, last_attempt_status: "scheduled_retry" } });
		expect(JSON.stringify(payload)).not.toContain("do-not-expose");
		expect(payload.data.recentJobs[0]).not.toHaveProperty("meta");
	});
	it("sorts flattened upstream attempts globally by start time", () => {
		const attempts = sortUpstreamRequestsNewestFirst([
			{ request_id: "request-a", attempt_number: 2, created_at: "2026-07-17T00:00:10Z" },
			{ request_id: "request-b", attempt_number: 1, created_at: "2026-07-17T00:00:12Z" },
			{ request_id: "request-a", attempt_number: 1, created_at: "2026-07-17T00:00:09Z" },
		]);

		expect(attempts.map((attempt) => `${attempt.request_id}:${attempt.attempt_number}`)).toEqual([
			"request-b:1",
			"request-a:2",
			"request-a:1",
		]);
	});

	it("returns workspace-private lifecycle warnings with usage and replacement context", async () => {
		const retirementDate = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = input instanceof Request ? input.url : String(input);
			if (url.includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "user-1", created_at: "2025-01-01" }), { status: 200 });
			if (url.includes("workspace_members")) return new Response(JSON.stringify([{ role: "admin" }]), { status: 200 });
			if (url.includes("/workspaces")) return new Response(JSON.stringify([{ owner_user_id: "user-1" }]), { status: 200 });
			if (url.includes("/rpc/get_workspace_model_last_used")) return new Response(JSON.stringify([{ model_id: "gpt-old-api", last_used_at: new Date().toISOString() }]), { status: 200 });
			if (url.includes("v2_model_provider_routes")) return new Response(JSON.stringify([{ api_model_id: "gpt-old-api", provider_api_model_id: "provider-model-1", internal_model_id: "openai/gpt-old" }]), { status: 200 });
			if (url.includes("v2_models") && url.includes("previous_model_slug=in")) return new Response(JSON.stringify([{ model_id: "openai/gpt-new", previous_model_id: "openai/gpt-old" }]), { status: 200 });
			if (url.includes("v2_models")) return new Response(JSON.stringify([{ model_id: "openai/gpt-old", name: "GPT Old", organisation_id: "openai", deprecation_date: null, retirement_date: retirementDate, previous_model_id: null }]), { status: 200 });
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

	it("returns private logs, upstream, jobs, and session views with metadata", async () => {
		let requestedExactFacets = false;
		let requestedLabelFilter = false;
		let requestedUnfilteredLabelFacets = false;
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = input instanceof Request ? input.url : String(input);
			if (url.includes("/rpc/get_gateway_request_facets")) requestedExactFacets = true;
			if (url.includes("detail_metadata=cs")) requestedLabelFilter = true;
			if (url.includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "user-1", created_at: "2025-01-01" }), { status: 200 });
			if (url.includes("workspace_members")) return new Response(JSON.stringify([{ role: "admin" }]), { status: 200 });
			if (url.includes("/workspaces")) return new Response(JSON.stringify([{ owner_user_id: "user-1" }]), { status: 200 });
			if (url.includes("gateway_async_operations")) return new Response(JSON.stringify([{ kind: "video", internal_id: "job-1", request_id: "request-1", app_id: "app-1", provider: "openai", model: "openai/gpt-test", status: "completed", created_at: "2026-07-17T00:00:00Z", updated_at: "2026-07-17T00:01:00Z", meta: { webhook: { status: "delivered" } } }]), { status: 200 });
			if (url.includes("v2_web_private_usage_daily")) return new Response(JSON.stringify([{ canonical_model_id: "openai/gpt-test", provider: "openai" }]), { status: 200 });
			if (url.includes("select=safe_metadata")) {
				requestedUnfilteredLabelFacets = !url.includes("detail_metadata=cs");
				return new Response(JSON.stringify([{ safe_metadata: { labels: [{ key: "team", value: "support" }] }, cost_nanos: 1000 }]), { status: 200, headers: { "content-range": "0-0/1" } });
			}
			if (url.includes("v2_request_facts")) return new Response(JSON.stringify([{ request_event_id: "gateway-1", occurred_at: "2026-07-17T00:00:00Z", request_id: "G-test", key_id: "key-1", endpoint: "chat/completions", requested_model_input: "openai/gpt-test", requested_model_slug: "openai/gpt-test", routed_model_slug: "openai/gpt-test", provider_model_id: "openai:gpt-test", status_code: 200, success: true, byok: false, generation_ms: 80, gateway_total_ms: 140, upstream_attempt_count: 2, throughput: 125, cost_nanos: 1000, currency: "USD", v2_request_attempts: [{ attempt_id: "upstream-1", attempt_number: 1, provider_model_id: "openai:gpt-test", started_at: "2026-07-17T00:00:01Z", status_code: 503, success: false, error_code: "unavailable", failure_class: "provider_error", latency_ms: 120, safe_metadata: { provider: "openai", key_source: "gateway" } }, { attempt_id: "upstream-2", attempt_number: 2, provider_model_id: "openai:gpt-test", started_at: "2026-07-17T00:00:02Z", status_code: 200, success: true, upstream_response_id: "resp-1", latency_ms: 120, safe_metadata: { provider: "openai", key_source: "gateway" } }] }]), { status: 200 });
			if (url.includes("gateway_upstream_requests")) return new Response(JSON.stringify([{ id: "upstream-1", created_at: "2026-07-17T00:00:01Z", gateway_request_id: "gateway-1", request_id: "G-test", sequence: 1, round_number: 1, attempt_number: 1, stage: "upstream", endpoint: "chat/completions", model_id: "openai/gpt-test", provider: "openai", status_code: 200, success: true, outcome: "success", key_source: "gateway", latency_ms: 120, generation_ms: 80, usage: { output_tokens: 10 }, metadata: {} }]), { status: 200 });
			if (url.includes("gateway_usage_rollup_15m")) return new Response(JSON.stringify([{ canonical_model_id: "openai/gpt-test", provider: "openai" }]), { status: 200 });
			if (url.includes("gateway_requests")) {
				if (url.includes("select=session_id")) return new Response(JSON.stringify([{ session_id: "session-1", created_at: "2026-07-17T00:00:00Z", cost_nanos: 1000, app_id: "app-1", model_id: "openai/gpt-test", provider: "openai", end_user_id: "end-user-1" }]), { status: 200 });
				if (url.includes("request_id=eq.request-1")) return new Response(JSON.stringify([{ request_id: "request-1", created_at: "2026-07-17T00:00:00Z", endpoint: "chat/completions", model_id: "openai/gpt-test", provider: "openai", app_id: "app-1", success: true, cost_nanos: 1000 }]), { status: 200 });
				if (url.includes("select=id%2Crequest_id") || url.includes("select=id,request_id")) return new Response(JSON.stringify([{ id: "row-1", request_id: "request-1", created_at: "2026-07-17T00:00:00Z", endpoint: "chat/completions", model_id: "openai/gpt-test", provider: "openai", app_id: "app-1", success: true, cost_nanos: 1000 }]), { status: 200 });
				return new Response(JSON.stringify([{ model_id: "openai/gpt-test", provider: "openai", app_id: "app-1" }]), { status: 200 });
			}
			if (url.includes("/keys")) return new Response(JSON.stringify([{ id: "key-1", name: "Production", prefix: "ph_" }]), { status: 200 });
			if (url.includes("v2_model_provider_routes")) return new Response(JSON.stringify([{ api_model_id: "gpt-test", model_id: "openai/gpt-test" }]), { status: 200 });
			if (url.includes("v2_models")) return new Response(JSON.stringify([{ model_id: "openai/gpt-test", name: "GPT Test", organisation_id: "openai", organisation: { name: "OpenAI" } }]), { status: 200 });
			if (url.includes("v2_providers")) return new Response(JSON.stringify([{ api_provider_id: "openai", api_provider_name: "OpenAI", colour: "#000" }]), { status: 200 });
			if (url.includes("api_apps")) return new Response(JSON.stringify([{ id: "app-1", title: "Example App", app_key: "example", image_url: null }]), { status: 200 });
			return new Response(JSON.stringify([]), { status: 200 });
		}));
		const init = { headers: { authorization: "Bearer token" } };
		const [logs, labeledLogs, upstream, jobs, sessions, detail] = await Promise.all([
			app.request("https://phaseo.app/api/account/settings/usage/logs?workspaceId=workspace-1&view=logs", init, env),
			app.request("https://phaseo.app/api/account/settings/usage/logs?workspaceId=workspace-1&view=logs&label_key=team&label_value=support", init, env),
			app.request("https://phaseo.app/api/account/settings/usage/logs?workspaceId=workspace-1&view=upstream", init, env),
			app.request("https://phaseo.app/api/account/settings/usage/logs?workspaceId=workspace-1&view=jobs", init, env),
			app.request("https://phaseo.app/api/account/settings/usage/logs?workspaceId=workspace-1&view=sessions", init, env),
			app.request("https://phaseo.app/api/account/settings/usage/logs/request-1?workspaceId=workspace-1", init, env),
		]);
		for (const response of [logs, labeledLogs, upstream, jobs, sessions, detail]) {
			expect(response.status).toBe(200);
			expect(response.headers.get("cache-control")).toBe("private, no-store");
		}
		await expect(logs.json()).resolves.toMatchObject({ view: "logs", data: { dedupedModels: ["openai/gpt-test"], labelFacets: [{ key: "team", value: "support" }], labelSummary: null, initialRequestsPage: { data: [{ request_id: "request-1" }], pageSize: 50, hasMore: false, nextCursor: null }, providerNameEntries: [["openai", "OpenAI"]] } });
		expect(requestedExactFacets).toBe(true);
		expect(requestedLabelFilter).toBe(true);
		expect(requestedUnfilteredLabelFacets).toBe(true);
		await expect(labeledLogs.json()).resolves.toMatchObject({ view: "logs", data: { labelSummary: { key: "team", value: "support", requestCount: 1, totalCostNanos: 1000, isSampled: false } } });
		await expect(upstream.json()).resolves.toMatchObject({ view: "upstream", data: { availableKeys: [{ id: "key-1", name: "Production" }], upstreamRequests: [{ id: "upstream-2", request_id: "G-test", attempt_number: 2 }, { id: "upstream-1", request_id: "G-test", attempt_number: 1 }], providerMetadataEntries: [["openai", { name: "OpenAI" }]], providerNameEntries: [["openai", "OpenAI"]] } });
		await expect(jobs.json()).resolves.toMatchObject({ view: "jobs", data: { recentJobs: [{ internal_id: "job-1", webhook: { configured: true, attempt_count: 0 } }], jobProviders: ["openai"] } });
		await expect(sessions.json()).resolves.toMatchObject({ view: "sessions", data: { sessions: [{ session_id: "session-1", request_count: 1, total_cost_nanos: 1000 }], sessionAppIds: ["app-1"] } });
		await expect(detail.json()).resolves.toMatchObject({ data: { request: { request_id: "request-1" }, providerNames: [["openai", "OpenAI"]] } });
	});

	it("returns the private observability windows and lookup metadata", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = input instanceof Request ? input.url : String(input);
			if (url.includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "user-1", created_at: "2025-01-01" }), { status: 200 });
			if (url.includes("workspace_members")) return new Response(JSON.stringify([{ role: "admin" }]), { status: 200 });
			if (url.includes("/workspaces")) return new Response(JSON.stringify([{ owner_user_id: "user-1" }]), { status: 200 });
			if (url.includes("v2_request_facts")) return new Response(JSON.stringify([{ safe_metadata: { labels: [{ key: "team", value: "support" }] }, cost_nanos: 1000 }]), { status: 200, headers: { "content-range": "0-0/1" } });
			if (url.includes("gateway_requests")) return new Response(JSON.stringify([{ created_at: "2026-07-17T00:00:00Z", model_id: "openai/gpt-test", app_id: "app-1", key_id: "key-1", usage: { total_tokens: 12 }, cost_nanos: 1000, success: true }]), { status: 200 });
			if (url.includes("/keys")) return new Response(JSON.stringify([{ id: "key-1", name: "Production", prefix: "ph_" }]), { status: 200 });
			if (url.includes("v2_model_provider_routes")) return new Response(JSON.stringify([]), { status: 200 });
			if (url.includes("v2_models")) return new Response(JSON.stringify([{ model_id: "openai/gpt-test", name: "GPT Test", organisation_id: "openai", organisation: { name: "OpenAI" } }]), { status: 200 });
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
			labelFacets: [{ key: "team", value: "support" }],
			labelSummary: null,
			modelMetadataEntries: [["openai/gpt-test", { modelName: "GPT Test" }]],
			appMetadataEntries: [["app-1", { title: "Example App", imageUrl: null }]],
			appNameEntries: [["app-1", "Example App"]],
		});
	});
});
