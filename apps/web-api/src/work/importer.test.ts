import { describe, expect, it } from "vitest";
import { fakeDataClient } from "./fakeDataClient.testing";
import { cleanImportRow, importItems, importLabels, importPriority, importState } from "./importer";

describe("CSV import", () => {
	it("maps other trackers' state and priority names", () => {
		expect(importState("In Progress")).toBe("in_progress");
		expect(importState("in_progress")).toBe("in_progress");
		expect(importState("Canceled")).toBe("cancelled");
		expect(importState("Selected for Development")).toBe("todo");
		expect(importState("Something else")).toBe("backlog");
		expect(importPriority("Urgent")).toBe(1);
		expect(importPriority("Highest")).toBe(1);
		expect(importPriority("Medium")).toBe(3);
		expect(importPriority("whatever")).toBe(0);
	});

	it("cleans labels and rows", () => {
		expect(importLabels("Bug, UI; bug | Billing!")).toEqual(["bug", "ui", "billing"]);
		expect(cleanImportRow({ title: "  Fix   login ", state: "Done", priority: "High", labels: "auth", estimate: "3", externalId: "ENG-12" })).toEqual({ title: "Fix login", description: "", state: "done", priority: 2, labels: ["auth"], estimate: 3, externalId: "ENG-12" });
		expect(cleanImportRow({ title: "x", estimate: "40" })!.estimate).toBeNull();
		expect(cleanImportRow({ title: "" })).toBeNull();
		expect(cleanImportRow("nope")).toBeNull();
	});

	it("creates manual items one by one, skipping rows without a title", async () => {
		let number = 10;
		const fake = fakeDataClient(() => ({ data: null, error: null }));
		fake.onRpc(() => ({ data: { id: `item-${number}`, workspace_id: "ws", number: number++, state: "backlog" }, error: null }));
		const result = await importItems({ client: fake.client, workspaceId: "ws", userId: "me", actorName: "Ana", source: "Tracker export", rows: [{ title: "A" }, { title: "" }, { title: "B", externalId: "X-2" }] });
		expect(result).toEqual({ created: 2, skipped: 1, numbers: [10, 11], failedAt: null });
		const creates = fake.rpcCalls.filter((call) => call.name === "create_work_item");
		expect(creates.every((call) => call.args.p_source === "manual")).toBe(true);
		const notes = fake.queries.filter((query) => query.table === "work_item_events").map((query) => (query.payload as { body: string }).body);
		expect(notes).toContain("Imported from Tracker export (X-2)");
	});

	it("stops at the first row that fails, saying where", async () => {
		const fake = fakeDataClient(() => ({ data: null, error: null }));
		fake.onRpc(() => ({ data: null, error: { message: "boom" } }));
		expect(await importItems({ client: fake.client, workspaceId: "ws", userId: "me", actorName: null, source: "csv", rows: [{ title: "A" }, { title: "B" }] })).toMatchObject({ created: 0, failedAt: 0 });
	});
});
