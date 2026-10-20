import { afterEach, describe, expect, it, vi } from "vitest";
import app from "@/index";
import { applyRequestLabelFilter, classifierIdsInDetail, parseRequestLabelFilter, summarizeRequestClassifier } from "@/usage/requestClassifiers";

const env = { ENV: "development" as const, SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: "anon-key", SUPABASE_SERVICE_ROLE_KEY: "service-role-key" };
const init = { headers: { authorization: "Bearer token" } };

const CLASSIFIER_ROW = {
	id: "c1",
	name: "Department",
	enabled: true,
	// Columns the summary must never pass on, even if a select returned them.
	instructions: "secret routing rules",
	model: "openai/gpt-5-mini",
	monthly_budget_nanos: 5_000_000_000,
	dimensions: [
		{ key: "department", name: "Department", description: "Who it is for", multiple: false, allow_other: true, values: [{ value: "legal", description: "Contracts" }, { value: "sales" }] },
		{ key: "intent", name: "Intent", multiple: true, allow_other: false, values: [{ value: "draft" }] },
	],
};

type Call = { url: URL; body: Record<string, unknown> | null };

function stubSupabase(role: "admin" | "member", handlers: Record<string, (call: Call) => unknown> = {}) {
	const calls: Call[] = [];
	vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, requestInit?: RequestInit) => {
		const url = new URL(input instanceof Request ? input.url : String(input));
		const body = requestInit?.body ? JSON.parse(String(requestInit.body)) : null;
		const call = { url, body };
		calls.push(call);
		if (url.pathname === "/auth/v1/user") return Response.json({ id: "viewer", created_at: "2025-01-01" });
		if (url.pathname.endsWith("/workspace_members")) return Response.json(role === "member" ? [{ role: "member" }] : [{ role: "admin" }]);
		if (url.pathname.endsWith("/workspaces")) return Response.json([{ owner_user_id: "owner" }]);
		for (const [suffix, handler] of Object.entries(handlers)) {
			if (url.pathname.endsWith(suffix)) return Response.json(handler(call));
		}
		if (url.pathname.endsWith("/workspace_request_classifiers")) return Response.json([CLASSIFIER_ROW]);
		return Response.json([]);
	}));
	return calls;
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("request classifier summaries", () => {
	it("keeps display fields only and adds the other value", () => {
		expect(summarizeRequestClassifier(CLASSIFIER_ROW)).toEqual({
			id: "c1",
			name: "Department",
			enabled: true,
			dimensions: [
				{ key: "department", name: "Department", multiple: false, values: ["legal", "sales", "other"] },
				{ key: "intent", name: "Intent", multiple: true, values: ["draft"] },
			],
		});
		expect(summarizeRequestClassifier({ id: "c2", name: " " })).toBeNull();
		expect(summarizeRequestClassifier({ id: "c3", name: "Bad", dimensions: [{ name: "No key" }, "x"] })).toEqual({ id: "c3", name: "Bad", enabled: true, dimensions: [] });
	});

	it("finds the classifiers a request detail mentions", () => {
		expect(classifierIdsInDetail({
			classifications: [{ classifier_id: "c1" }, { classifier_id: "c1" }, { status: "failed" }],
			labels: [{ key: "phaseo.classifier", value: "c2" }, { key: "team", value: "c3" }],
		})).toEqual(["c1", "c2"]);
		expect(classifierIdsInDetail(null)).toEqual([]);
	});

	it("parses label filters, including any value and is not", () => {
		const parse = (query: string, options?: { exactOnly?: boolean }) => parseRequestLabelFilter(new URL(`https://x.test/?${query}`), options);
		expect(parse("")).toBeNull();
		expect(parse("label_key=team&label_value=search")).toEqual({ key: "team", value: "search", exclude: false });
		expect(parse("label_key=team")).toEqual({ key: "team", value: null, exclude: false });
		expect(parse("label_key=team&label_op=is_not")).toEqual({ key: "team", value: null, exclude: true });
		expect(parse("label_value=search")).toEqual({ error: expect.any(String) });
		expect(parse("label_key=bad%20key&label_value=x")).toEqual({ error: "label_key is invalid" });
		expect(parse("label_key=team", { exactOnly: true })).toEqual({ error: expect.any(String) });
	});

	it("applies label filters as jsonb containment", () => {
		const calls: unknown[][] = [];
		const query = { contains: (...args: unknown[]) => { calls.push(["contains", ...args]); return query; }, or: (...args: unknown[]) => { calls.push(["or", ...args]); return query; } };
		applyRequestLabelFilter(query, { key: "team", value: null, exclude: false });
		applyRequestLabelFilter(query, { key: "team", value: "search", exclude: true });
		applyRequestLabelFilter(query, { key: "team", value: "a,b (c)", exclude: true });
		applyRequestLabelFilter(query, null);
		expect(calls).toEqual([
			["contains", "detail_metadata", { labels: [{ key: "team" }] }],
			// Requests without metadata have no labels, so "is not" includes them.
			["or", 'detail_metadata.is.null,detail_metadata.not.cs."{\\"labels\\":[{\\"key\\":\\"team\\",\\"value\\":\\"search\\"}]}"'],
			["or", 'detail_metadata.is.null,detail_metadata.not.cs."{\\"labels\\":[{\\"key\\":\\"team\\",\\"value\\":\\"a,b (c)\\"}]}"'],
		]);
	});
});

describe("usage routes with request classifiers", () => {
	it("gives members the classifier display names on the logs, without configuration", async () => {
		const calls = stubSupabase("member");
		const response = await app.request("https://phaseo.app/api/account/settings/usage/logs?workspaceId=workspace-1&view=logs", init, env);
		expect(response.status).toBe(200);
		const payload = await response.json() as any;
		expect(payload.data.requestClassifiers).toEqual([summarizeRequestClassifier(CLASSIFIER_ROW)]);
		const serialized = JSON.stringify(payload);
		for (const secret of ["secret routing rules", "gpt-5-mini", "5000000000", "Contracts"]) expect(serialized).not.toContain(secret);
		const classifierRead = calls.find((call) => call.url.pathname.endsWith("/workspace_request_classifiers"));
		expect(classifierRead?.url.searchParams.get("workspace_id")).toBe("eq.workspace-1");
		expect(classifierRead?.url.searchParams.get("select")).toBe("id,name,enabled,dimensions");
	});

	it("filters logs to a label key with any value, or without a label value, and skips the totals", async () => {
		const calls = stubSupabase("admin");
		const [anyValue, notValue] = await Promise.all([
			app.request("https://phaseo.app/api/account/settings/usage/logs?workspaceId=workspace-1&view=logs&label_key=department", init, env),
			app.request("https://phaseo.app/api/account/settings/usage/logs?workspaceId=workspace-1&view=logs&label_key=department&label_value=legal&label_op=is_not", init, env),
		]);
		expect(anyValue.status).toBe(200);
		expect(notValue.status).toBe(200);
		const requestCalls = calls.filter((call) => call.url.pathname.endsWith("/gateway_requests"));
		expect(requestCalls.map((call) => call.url.searchParams.get("detail_metadata"))).toContain('cs.{"labels":[{"key":"department"}]}');
		expect(requestCalls.flatMap((call) => call.url.searchParams.getAll("or"))).toContain(
			'(detail_metadata.is.null,detail_metadata.not.cs."{\\"labels\\":[{\\"key\\":\\"department\\",\\"value\\":\\"legal\\"}]}")',
		);
		// Only an exact key and value has rollup totals.
		expect(calls.some((call) => call.url.pathname.endsWith("/rpc/get_private_usage_overview"))).toBe(false);
		expect((await anyValue.json() as any).data.labelSummary).toBeNull();
	});

	it("leaves the usage overview unfiltered for label filters only the logs support", async () => {
		const calls = stubSupabase("admin");
		const response = await app.request("https://phaseo.app/api/account/settings/usage/observability?workspaceId=workspace-1&from=2026-10-01&to=2026-10-02&previousFrom=2026-09-30&previousTo=2026-10-01&label_key=department&label_op=is_not", init, env);
		expect(response.status).toBe(200);
		const overviewCalls = calls.filter((call) => call.url.pathname.endsWith("/rpc/get_private_usage_overview"));
		expect(overviewCalls).toHaveLength(3);
		for (const call of overviewCalls) expect(call.body).toMatchObject({ p_label_key: null, p_label_value: null });
		const payload = await response.json() as any;
		expect(payload.labelSummary).toBeNull();
		expect(payload.requestClassifiers).toHaveLength(1);
	});

	it("groups usage by a label key in the database", async () => {
		const calls = stubSupabase("member", {
			"/rpc/get_private_usage_label_breakdown": () => [
				{ value: "legal", requests: 3, successfulRequests: 2, costNanos: "1500", tokens: 900, inputTokens: 600, outputTokens: 300 },
				{ value: null, requests: 1 },
			],
		});
		const response = await app.request("https://phaseo.app/api/account/settings/usage/labels/breakdown?workspaceId=workspace-1&label_key=department&from=2026-10-01T00:00:00Z&to=2026-10-02T00:00:00Z&key=key-1&key_op=is_not&user=viewer&limit=9999", init, env);
		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toBe("private, no-store");
		expect(await response.json()).toEqual({
			key: "department",
			from: "2026-10-01T00:00:00Z",
			to: "2026-10-02T00:00:00Z",
			workspaceId: "workspace-1",
			rows: [{ value: "legal", requests: 3, successfulRequests: 2, costNanos: 1500, tokens: 900, inputTokens: 600, outputTokens: 300 }],
		});
		expect(calls.find((call) => call.url.pathname.endsWith("/rpc/get_private_usage_label_breakdown"))?.body).toEqual({
			p_workspace_id: "workspace-1",
			p_from: "2026-10-01T00:00:00.000Z",
			p_to: "2026-10-02T00:00:00.000Z",
			p_label_key: "department",
			p_key_id: "key-1",
			p_exclude_key: true,
			p_creator_id: "viewer",
			p_limit: 500,
		});
	});

	it("rejects bad label breakdown requests before reading usage", async () => {
		const calls = stubSupabase("member");
		const base = "https://phaseo.app/api/account/settings/usage/labels/breakdown?workspaceId=workspace-1&from=2026-10-01T00:00:00Z&to=2026-10-02T00:00:00Z";
		expect((await app.request(`${base}&label_key=bad%20key`, init, env)).status).toBe(400);
		expect((await app.request(`${base.replace("from=2026-10-01", "from=2026-10-03")}&label_key=team`, init, env)).status).toBe(400);
		// A member cannot look at someone else's keys.
		expect((await app.request(`${base}&label_key=team&user=someone-else`, init, env)).status).toBe(403);
		expect(calls.some((call) => call.url.pathname.includes("/rpc/"))).toBe(false);
	});

	it("does not group usage for people outside the workspace", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = new URL(input instanceof Request ? input.url : String(input));
			if (url.pathname === "/auth/v1/user") return Response.json({ id: "viewer" });
			if (url.pathname.endsWith("/workspaces")) return Response.json([{ owner_user_id: "owner" }]);
			if (url.pathname.includes("/rpc/")) throw new Error("must not read usage");
			return Response.json([]);
		}));
		const response = await app.request("https://phaseo.app/api/account/settings/usage/labels/breakdown?workspaceId=workspace-1&label_key=team&from=2026-10-01T00:00:00Z&to=2026-10-02T00:00:00Z", init, env);
		expect(response.status).toBe(403);
	});

	it("names the classifiers a request detail mentions", async () => {
		stubSupabase("member", {
			"/gateway_requests": () => [{
				request_id: "request-1",
				created_at: "2026-10-19T00:00:00Z",
				success: true,
				detail_metadata: { labels: [{ key: "department", value: "legal" }], classifications: [{ classifier_id: "c1", status: "classified", model: "m", labels: [{ key: "department", value: "legal", confidence: 0.9 }] }] },
			}],
			"/workspace_request_classifiers": () => [CLASSIFIER_ROW, { ...CLASSIFIER_ROW, id: "c9", name: "Unrelated" }],
		});
		const response = await app.request("https://phaseo.app/api/account/settings/usage/logs/request-1?workspaceId=workspace-1", init, env);
		expect(response.status).toBe(200);
		const payload = await response.json() as any;
		expect(payload.data.requestClassifiers).toEqual([summarizeRequestClassifier(CLASSIFIER_ROW)]);
		expect(JSON.stringify(payload)).not.toContain("secret routing rules");
	});

	it("passes label operators through paginated log requests", async () => {
		const calls = stubSupabase("admin");
		const response = await app.request("https://phaseo.app/api/account/settings/usage/actions", {
			method: "POST",
			headers: { ...init.headers, "content-type": "application/json" },
			body: JSON.stringify({ workspaceId: "workspace-1", operation: "paginatedRequests", args: [{ timeRange: { from: "2026-10-01T00:00:00Z", to: "2026-10-02T00:00:00Z" }, pageSize: 25, labelKey: "department", labelValue: null, labelOperator: "is_not" }] }),
		}, env);
		expect(response.status).toBe(200);
		const filters = calls.filter((call) => call.url.pathname.endsWith("/gateway_requests")).map((call) => call.url.searchParams.getAll("or"));
		expect(filters[0]).toContain('(detail_metadata.is.null,detail_metadata.not.cs."{\\"labels\\":[{\\"key\\":\\"department\\"}]}")');
	});
});
