import { describe, expect, it } from "vitest";
import { fakeDataClient, hasFilter } from "./fakeDataClient.testing";
import { followUpStalledItems, runAmbientFollowUps, stalledEventBody } from "./ambient";
import { dueWorkJobs, runWorkAutomation } from "./scheduled";
import { runSlaWatch, slaThreshold } from "./slaWatch";

const NOW = new Date("2026-11-02T12:05:00.000Z");
const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();
const ON = { WORK_AMBIENT_ENABLED: "true", WORK_SLA_WATCH_ENABLED: "true" };
const OFF = {};

describe("flags", () => {
	it("reads nothing while the env flags are off", async () => {
		const fake = fakeDataClient();
		expect(await runAmbientFollowUps({ env: OFF, client: fake.client, now: NOW })).toEqual({ workspaces: 0, stalled: 0 });
		expect(await runSlaWatch({ env: { WORK_SLA_WATCH_ENABLED: "1" }, client: fake.client, now: NOW })).toEqual({ checked: 0, warned: 0 });
		expect(await runWorkAutomation({ env: OFF, client: fake.client, now: NOW, jobs: { sla: true, ambient: true } })).toEqual({ sla: null, ambient: null });
		expect(fake.queries).toHaveLength(0);
	});

	it("runs SLA watch every 15 minutes and ambient hourly", () => {
		expect(dueWorkJobs(new Date("2026-11-02T12:05:00Z"))).toEqual({ sla: true, ambient: false });
		expect(dueWorkJobs(new Date("2026-11-02T12:35:00Z"))).toEqual({ sla: true, ambient: true });
		expect(dueWorkJobs(new Date("2026-11-02T12:06:00Z"))).toEqual({ sla: false, ambient: false });
	});
});

describe("ambient follow-ups", () => {
	it("only reads workspaces that turned ambient on", async () => {
		const fake = fakeDataClient((query) => query.table === "work_settings" ? { data: [], error: null } : undefined);
		await runAmbientFollowUps({ env: ON, client: fake.client, now: NOW });
		expect(hasFilter(fake.queries[0], "eq", "ambient_enabled", true)).toBe(true);
	});

	it("follows up stalled items once per stall period, without bumping activity", async () => {
		const fake = fakeDataClient((query) => {
			if (query.table === "work_items") return { data: [
				{ id: "a", number: 1, title: "Old", assignee_user_id: "alice", last_activity_at: ago(10) },
				{ id: "b", number: 2, title: "Done before", assignee_user_id: null, last_activity_at: ago(9) },
				{ id: "c", number: 3, title: "Nobody", assignee_user_id: null, last_activity_at: ago(8) },
			], error: null };
			if (query.table === "work_item_events" && query.op === "select") return { data: [{ work_item_id: "b" }], error: null };
			if (query.table === "work_subscriptions") return { data: [{ user_id: "sub" }], error: null };
			return { data: null, error: null };
		});
		const written = await followUpStalledItems(fake.client, "ws", 7, NOW);
		expect(written).toBe(2);
		const items = fake.queries.find((query) => query.table === "work_items")!;
		expect(items.filters).toContainEqual(["lt", "last_activity_at", ago(7)]);
		const events = fake.queries.filter((query) => query.table === "work_item_events" && query.op === "insert").map((query) => query.payload as any);
		expect(events.map((event) => [event.work_item_id, event.kind, event.body])).toEqual([["a", "stalled", "No activity for 10 days."], ["c", "stalled", "No activity for 8 days."]]);
		const notifications = fake.queries.filter((query) => query.table === "work_notifications").flatMap((query) => query.payload as any[]);
		expect(notifications.map((row) => [row.work_item_id, row.user_id, row.kind])).toEqual([["a", "alice", "stalled"], ["c", "sub", "stalled"]]);
		expect(fake.queries.some((query) => query.table === "work_items" && query.op === "update")).toBe(false);
	});

	it("stops at 20 per workspace", async () => {
		const rows = Array.from({ length: 30 }, (_, index) => ({ id: `i${index}`, number: index, title: "t", assignee_user_id: "u", last_activity_at: ago(30) }));
		const fake = fakeDataClient((query) => query.table === "work_items" ? { data: rows, error: null } : query.table === "work_item_events" && query.op === "select" ? { data: [], error: null } : undefined);
		expect(await followUpStalledItems(fake.client, "ws", 7, NOW)).toBe(20);
		expect(stalledEventBody(1)).toBe("No activity for 1 day.");
	});
});

describe("SLA watch", () => {
	it("reads thresholds", () => {
		expect(slaThreshold("2026-11-02T13:00:00Z", NOW)).toBe("at_risk");
		expect(slaThreshold("2026-11-02T12:00:00Z", NOW)).toBe("breached");
		expect(slaThreshold("2026-11-02T18:00:00Z", NOW)).toBeNull();
	});

	it("warns once per threshold and due time", async () => {
		const fake = fakeDataClient((query) => {
			if (query.table === "work_items") return { data: [
				{ id: "a", workspace_id: "ws", number: 1, title: "Soon", assignee_user_id: "alice", sla_due_at: "2026-11-02T13:00:00.000Z" },
				{ id: "b", workspace_id: "ws", number: 2, title: "Late", assignee_user_id: "bob", sla_due_at: "2026-11-02T11:00:00.000Z" },
				{ id: "c", workspace_id: "ws", number: 3, title: "Warned", assignee_user_id: "carol", sla_due_at: "2026-11-02T13:30:00.000Z" },
			], error: null };
			if (query.table === "work_item_events" && query.op === "select") return { data: [
				{ work_item_id: "c", data: { threshold: "at_risk", dueAt: "2026-11-02T13:30:00Z" } },
				{ work_item_id: "b", data: { threshold: "at_risk", dueAt: "2026-11-02T11:00:00Z" } },
			], error: null };
			return { data: null, error: null };
		});
		const summary = await runSlaWatch({ env: ON, client: fake.client, now: NOW });
		expect(summary).toEqual({ checked: 3, warned: 2 });
		const events = fake.queries.filter((query) => query.table === "work_item_events" && query.op === "insert").map((query) => query.payload as any);
		expect(events.map((event) => [event.work_item_id, event.data.threshold])).toEqual([["a", "at_risk"], ["b", "breached"]]);
		const notifications = fake.queries.filter((query) => query.table === "work_notifications").flatMap((query) => query.payload as any[]);
		expect(notifications.map((row) => [row.user_id, row.kind])).toEqual([["alice", "sla"], ["bob", "sla"]]);
		const items = fake.queries.find((query) => query.table === "work_items")!;
		expect(items.filters).toContainEqual(["lte", "sla_due_at", "2026-11-02T14:05:00.000Z"]);
	});
});
