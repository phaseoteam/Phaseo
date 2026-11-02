import { describe, expect, it, vi } from "vitest";
import { fakeDataClient } from "./fakeDataClient.testing";
import { handleErrorSpike, spikeEventBody } from "./spikes";

const result = {
	group_id: "group", workspace_id: "ws", is_new: false, reopened: false, status: "open" as const, work_item_id: "item",
	event_count: 120, auto_triage: true, github_repo: null, hour_count: 42, spiking: true,
};

function client(withItem = true) {
	return fakeDataClient((query) => {
		if (query.table === "work_items") return { data: withItem ? { id: "item", workspace_id: "ws", number: 5, state: "todo" } : null, error: null };
		if (query.table === "work_subscriptions") return { data: [{ user_id: "sub" }, { user_id: "owner" }], error: null };
		if (query.table === "workspaces") return { data: { owner_user_id: "owner" }, error: null };
		if (query.table === "workspace_members") return { data: [{ user_id: "admin" }], error: null };
		return { data: null, error: null };
	});
}

describe("handleErrorSpike", () => {
	it("writes a spike event on the group's item and notifies subscribers and admins once each", async () => {
		const fake = client();
		const createItem = vi.fn(async () => "new");
		const outcome = await handleErrorSpike({ client: fake.client, result, errorLabel: "TypeError: x", createItem });
		expect(createItem).not.toHaveBeenCalled();
		expect(outcome).toEqual({ itemId: "item", notified: 3 });
		const event = fake.queries.find((query) => query.table === "work_item_events")!;
		expect(event.payload).toMatchObject({ kind: "error", body: "Spiking: 42 events in the last hour" });
		const notifications = fake.queries.filter((query) => query.table === "work_notifications").flatMap((query) => query.payload as any[]);
		expect(notifications.map((row) => row.user_id).sort()).toEqual(["admin", "owner", "sub"]);
		expect(notifications.every((row) => row.kind === "error_spike")).toBe(true);
		const members = fake.queries.find((query) => query.table === "workspace_members")!;
		expect(members.filters).toContainEqual(["in", "role", ["owner", "admin"]]);
	});

	it("creates an item when the group has none", async () => {
		const fake = client(false);
		const createItem = vi.fn(async () => "new");
		const outcome = await handleErrorSpike({ client: fake.client, result: { ...result, work_item_id: null }, errorLabel: "E", createItem });
		expect(createItem).toHaveBeenCalledOnce();
		expect(outcome.itemId).toBe("new");
		expect(fake.queries.some((query) => query.table === "work_item_events")).toBe(false);
	});

	it("says event or events", () => {
		expect(spikeEventBody(1)).toBe("Spiking: 1 event in the last hour");
	});
});
