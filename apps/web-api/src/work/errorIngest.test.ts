import { describe, expect, it, vi } from "vitest";
import { cleanErrorEvent, ingestErrorEvents, regressionNote } from "./errorIngest";
import { fakeDataClient } from "./fakeDataClient.testing";

vi.mock("./triage", () => ({ triageWorkItem: vi.fn(async () => ({ ok: false, code: "skipped", message: "" })) }));

const project = { id: "project", workspace_id: "ws", name: "App", enabled: true, auto_triage: false, github_repo: null };
const event = cleanErrorEvent({ type: "TypeError", message: "x is undefined\nmore", frames: [{ function: "f", file: "app.js", line: 1 }] })!;

function rpcResult(overrides: Record<string, unknown>) {
	return {
		group_id: "group", workspace_id: "ws", is_new: false, reopened: false, status: "open", work_item_id: null,
		event_count: 50, auto_triage: false, github_repo: null, hour_count: 12, spiking: false, ...overrides,
	};
}

function setup(result: Record<string, unknown>) {
	const fake = fakeDataClient((query) => {
		if (query.table === "work_items") return { data: { id: "item", workspace_id: "ws", number: 3, state: "todo" }, error: null };
		if (query.table === "workspaces") return { data: { owner_user_id: "owner" }, error: null };
		if (query.table === "workspace_members") return { data: [], error: null };
		if (query.table === "work_subscriptions") return { data: [], error: null };
		return { data: null, error: null };
	});
	fake.onRpc((name) => name === "create_work_item"
		? { data: { id: "new-item", workspace_id: "ws", number: 4, state: "triage" }, error: null }
		: { data: rpcResult(result), error: null });
	return fake;
}

describe("ingestErrorEvents spikes", () => {
	it("creates a priority 2 item for a spiking group without one, even without auto-triage", async () => {
		const fake = setup({ spiking: true });
		await ingestErrorEvents({ env: {} as any, client: fake.client, project, events: [event], waitUntil: () => undefined });
		const create = fake.rpcCalls.find((call) => call.name === "create_work_item")!;
		expect(create.args).toMatchObject({ p_priority: 2, p_source: "error", p_state: "triage" });
		const notification = fake.queries.find((query) => query.table === "work_notifications")!;
		expect(notification.payload).toEqual([expect.objectContaining({ user_id: "owner", kind: "error_spike", work_item_id: "new-item" })]);
	});

	it("writes a spike event on the group's existing item", async () => {
		const fake = setup({ spiking: true, work_item_id: "item" });
		await ingestErrorEvents({ env: {} as any, client: fake.client, project, events: [event], waitUntil: () => undefined });
		expect(fake.rpcCalls.some((call) => call.name === "create_work_item")).toBe(false);
		const spike = fake.queries.find((query) => query.table === "work_item_events")!;
		expect(spike.payload).toMatchObject({ work_item_id: "item", kind: "error", body: "Spiking: 12 events in the last hour" });
	});

	it("does nothing extra without a spike", async () => {
		const fake = setup({ spiking: false });
		await ingestErrorEvents({ env: {} as any, client: fake.client, project, events: [event], waitUntil: () => undefined });
		expect(fake.queries.filter((query) => query.table !== "work_error_rules")).toHaveLength(0);
	});
});

describe("ingestErrorEvents users, rules and releases", () => {
	function withRules(rules: unknown[], result: Record<string, unknown> = {}) {
		const fake = fakeDataClient((query) => {
			if (query.table === "work_error_rules") return { data: rules, error: null };
			if (query.table === "work_items") return { data: { id: "item", workspace_id: "ws", number: 3, state: "todo" }, error: null };
			return { data: null, error: null };
		});
		fake.onRpc((name) => name === "create_work_item"
			? { data: { id: "new-item", workspace_id: "ws", number: 4, state: "triage" }, error: null }
			: { data: rpcResult(result), error: null });
		return fake;
	}

	it("sends a hash of the user, and never the user, to the database", async () => {
		const withUser = cleanErrorEvent({ type: "TypeError", message: "boom", user: { id: "ana@example.com" } })!;
		expect(withUser.user).toBe("ana@example.com");
		const fake = withRules([]);
		await ingestErrorEvents({ env: {} as any, client: fake.client, project, events: [withUser], waitUntil: () => undefined });
		const record = fake.rpcCalls.find((call) => call.name === "record_work_error_event")!;
		expect(record.args.p_user_hash).toMatch(/^[0-9a-f]{32}$/);
		expect(JSON.stringify(record.args)).not.toContain("ana@example.com");
	});

	it("drops events an ignore rule matches", async () => {
		const fake = withRules([{ action: "ignore", field: "message", pattern: "undefined", enabled: true, assignee_user_id: null }]);
		const groups = await ingestErrorEvents({ env: {} as any, client: fake.client, project, events: [event], waitUntil: () => undefined });
		expect(groups).toEqual([]);
		expect(fake.rpcCalls).toEqual([]);
	});

	it("assigns a new error item with an assign rule", async () => {
		const fake = withRules([{ action: "assign", field: "type", pattern: "TypeError", enabled: true, assignee_user_id: "user-1" }], { is_new: true, auto_triage: true });
		await ingestErrorEvents({ env: {} as any, client: fake.client, project: { ...project, auto_triage: true }, events: [event], waitUntil: () => undefined });
		const create = fake.rpcCalls.find((call) => call.name === "create_work_item")!;
		expect(JSON.stringify(create.args)).toContain("user-1");
	});

	it("names the releases when an error regresses", () => {
		expect(regressionNote({ reopened: true, resolved_in_release: "1.2.0" }, { release: "1.3.0" })).toBe("The error came back in release 1.3.0 after it was resolved in 1.2.0.");
		expect(regressionNote({ reopened: true, resolved_in_release: null }, { release: "1.3.0" })).toBe("The error came back after it was resolved.");
		expect(regressionNote({ reopened: false, resolved_in_release: "1" }, {})).toBe("The error was seen again.");
	});
});
