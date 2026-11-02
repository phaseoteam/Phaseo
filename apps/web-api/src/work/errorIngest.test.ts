import { describe, expect, it, vi } from "vitest";
import { cleanErrorEvent, ingestErrorEvents } from "./errorIngest";
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
		expect(fake.queries).toHaveLength(0);
	});
});
