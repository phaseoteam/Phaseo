import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDataClient, type FakeHandler } from "@/work/fakeDataClient.testing";

const state: { handler: FakeHandler; fake: ReturnType<typeof fakeDataClient> } = { handler: () => undefined, fake: fakeDataClient() };
vi.mock("@/data/supabase", () => ({ getDataClient: () => state.fake.client }));
const triage = vi.fn(async () => ({ ok: true }));
vi.mock("@/work/triage", () => ({ triageWorkItem: (...args: unknown[]) => triage(...(args as [])) }));

const { internalWorkSlackRouter, parseSlackFileInput, signWorkSlackRequest, verifyWorkSlackRequest } = await import("./internal-work-slack");

const SECRET = "test-secret";
const INSTALLATION = "00000000-0000-4000-8000-000000000a01";
const WS = "00000000-0000-4000-8000-000000000001";
const env = { ENV: "development", SLACK_STATE_SECRET: SECRET, PHASEO_WEB_ORIGIN: "https://phaseo.test" } as any;

function payload(overrides: Record<string, unknown> = {}) {
	return {
		installationId: INSTALLATION, slackUserId: "U0PERSON01", channel: "C0GENERAL1", threadTs: "1762084800.000100",
		permalink: "https://acme.slack.com/archives/C0GENERAL1/p1762084800000100", title: "Export is empty", description: "Steps: export CSV", kind: "item",
		...overrides,
	};
}

async function call(body: unknown, options: { secret?: string; timestamp?: number } = {}) {
	const raw = JSON.stringify(body);
	const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000);
	const signature = await signWorkSlackRequest(options.secret ?? SECRET, timestamp, raw);
	return internalWorkSlackRouter.request("/work/slack/items", {
		method: "POST",
		headers: { "content-type": "application/json", "x-phaseo-timestamp": String(timestamp), "x-phaseo-signature": signature },
		body: raw,
	}, env);
}

function tables(options: { admin?: boolean; status?: string } = {}): FakeHandler {
	return (query) => {
		switch (query.table) {
			case "slack_installations": return { data: { id: INSTALLATION, workspace_id: WS, status: options.status ?? "active" }, error: null };
			case "workspaces": return { data: { owner_user_id: "owner" }, error: null };
			case "workspace_members": return { data: query.filters.some(([name, column]) => name === "eq" && column === "user_id") ? null : [{ user_id: "member" }], error: null };
			case "users": return { data: options.admin === false ? [] : [{ user_id: "member" }], error: null };
			case "slack_user_links": return { data: null, error: null };
			case "work_customers": return { data: { id: "cust", name: "Acme" }, error: null };
			case "work_customer_requests": return { data: { id: "req" }, error: null };
			default: return { data: null, error: null };
		}
	};
}

beforeEach(() => {
	triage.mockClear();
	state.fake = fakeDataClient((query) => state.handler(query));
	state.fake.onRpc((name) => name === "create_work_item" ? { data: { id: "item", workspace_id: WS, number: 12, state: "triage" }, error: null } : { data: null, error: null });
});

describe("signature", () => {
	it("matches the fixed vector the Slack Worker tests too", async () => {
		expect(await signWorkSlackRequest(SECRET, 1762084800, '{"title":"x"}')).toBe("v1=cd7afac4d34a1bd29de1188e9cbf1fbc1249a1a47f5dd9548b1abb307906653a");
		const now = 1762084800 * 1000;
		expect(await verifyWorkSlackRequest(SECRET, "1762084800", "v1=cd7afac4d34a1bd29de1188e9cbf1fbc1249a1a47f5dd9548b1abb307906653a", '{"title":"x"}', now)).toBe(true);
		expect(await verifyWorkSlackRequest(SECRET, "1762084800", "v1=cd7afac4d34a1bd29de1188e9cbf1fbc1249a1a47f5dd9548b1abb307906653a", '{"title":"y"}', now)).toBe(false);
		expect(await verifyWorkSlackRequest(SECRET, "1762084800", "v1=cd7afac4d34a1bd29de1188e9cbf1fbc1249a1a47f5dd9548b1abb307906653a", '{"title":"x"}', now + 600_000)).toBe(false);
		expect(await verifyWorkSlackRequest(undefined, "1762084800", "v1=00", "{}", now)).toBe(false);
	});
});

describe("POST /work/slack/items", () => {
	it("refuses unsigned or wrongly signed requests", async () => {
		state.handler = tables();
		expect((await call(payload(), { secret: "other" })).status).toBe(401);
		expect(state.fake.queries).toHaveLength(0);
	});

	it("is off unless the workspace has an internal admin", async () => {
		state.handler = tables({ admin: false });
		const response = await call(payload());
		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({ error: "work_not_enabled" });
		expect(state.fake.rpcCalls).toHaveLength(0);
	});

	it("files an item (source slack) with a link to the thread and triages it", async () => {
		state.handler = tables();
		const response = await call(payload());
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ ok: true, item: { number: 12, url: "https://phaseo.test/work/12" } });
		expect(state.fake.rpcCalls[0].args).toMatchObject({ p_source: "slack", p_title: "Export is empty", p_description: "Steps: export CSV", p_state: "triage" });
		const link = state.fake.queries.find((query) => query.table === "work_item_events")!;
		expect(link.payload).toMatchObject({ kind: "link", data: { type: "slack_thread", url: payload().permalink } });
		expect(triage).toHaveBeenCalledOnce();
	});

	it("keeps an ask's text in a private customer request, never on the item", async () => {
		state.handler = tables();
		const response = await call(payload({ kind: "ask", customer: "acme", title: "Ana from Acme wants SSO", description: "Ana (ana@acme.com): we need SSO by Friday" }));
		expect(response.status).toBe(200);
		const request = state.fake.queries.find((query) => query.table === "work_customer_requests" && query.op === "insert")!;
		expect(request.payload).toMatchObject({ source: "slack", customer_id: "cust", body: "Ana (ana@acme.com): we need SSO by Friday" });
		const create = state.fake.rpcCalls[0].args;
		expect(create).toMatchObject({ p_source: "ask", p_title: "Customer request via Slack", p_description: "" });
		const events = state.fake.queries.filter((query) => query.table === "work_item_events").map((query) => JSON.stringify(query.payload));
		expect(events.join()).not.toContain("ana@acme.com");
		expect(events.join()).toContain("Customer request from Acme");
	});

	it("validates input and the installation", async () => {
		expect(parseSlackFileInput(payload({ kind: "ask", description: "" }))).toMatchObject({ ok: false });
		expect(parseSlackFileInput(payload({ permalink: "https://evil.example/x" }))).toMatchObject({ ok: true, input: { permalink: null } });
		state.handler = tables({ status: "paused" });
		expect((await call(payload())).status).toBe(404);
	});
});
