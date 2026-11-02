import { describe, expect, it } from "vitest";
import { fakeDataClient } from "./fakeDataClient.testing";
import { notify, resolveMentions, subscribe, subscriberIds } from "./notifications";

const ACTOR = "00000000-0000-4000-8000-0000000000aa";
const ANN = "00000000-0000-4000-8000-0000000000bb";
const BOB = "00000000-0000-4000-8000-0000000000cc";

describe("notify", () => {
	it("writes one row per person, deduplicated, never to the actor", async () => {
		const fake = fakeDataClient();
		const written = await notify(fake.client, {
			workspaceId: "ws", userIds: [ANN, ANN.toUpperCase(), ACTOR, null, BOB], workItemId: "item", kind: "comment", actorName: "Staff", body: "x".repeat(3000), exceptUserId: ACTOR,
		});
		expect(written).toBe(2);
		const insert = fake.queries.find((query) => query.table === "work_notifications")!;
		const rows = insert.payload as Array<Record<string, unknown>>;
		expect(rows.map((row) => row.user_id)).toEqual([ANN, BOB]);
		expect(String(rows[0]!.body)).toHaveLength(2000);
		expect(rows[0]).toMatchObject({ workspace_id: "ws", work_item_id: "item", kind: "comment", actor_name: "Staff" });
	});

	it("writes nothing when only the actor would be notified", async () => {
		const fake = fakeDataClient();
		expect(await notify(fake.client, { workspaceId: "ws", userIds: [ACTOR], workItemId: "item", kind: "state", exceptUserId: ACTOR })).toBe(0);
		expect(fake.queries).toHaveLength(0);
	});

	it("never throws when the insert fails", async () => {
		const fake = fakeDataClient(() => ({ data: null, error: { message: "boom" } }));
		expect(await notify(fake.client, { workspaceId: "ws", userIds: [ANN], workItemId: "item", kind: "agent" })).toBe(0);
	});
});

describe("subscriptions", () => {
	it("upserts idempotently and keeps the first reason", async () => {
		const fake = fakeDataClient();
		await subscribe(fake.client, { workspaceId: "ws", workItemId: "item", userId: ANN, reason: "commenter" });
		const upsert = fake.queries[0]!;
		expect(upsert).toMatchObject({ table: "work_subscriptions", op: "upsert", options: { onConflict: "work_item_id,user_id", ignoreDuplicates: true } });
		expect(upsert.payload).toEqual({ work_item_id: "item", user_id: ANN, workspace_id: "ws", reason: "commenter" });
	});

	it("lists subscriber ids", async () => {
		const fake = fakeDataClient(() => ({ data: [{ user_id: ANN }, { user_id: BOB }, { user_id: ANN }], error: null }));
		expect(await subscriberIds(fake.client, "item")).toEqual([ANN, BOB]);
	});
});

describe("resolveMentions", () => {
	const members = [
		{ userId: ANN, name: "Ann Lee", email: "ann.lee@acme.com" },
		{ userId: BOB, name: "Bob Stone", email: "robert@acme.com" },
		{ userId: ACTOR, name: "Ann Other", email: "staff@acme.com" },
	];

	it("matches email local parts and display names without spaces", () => {
		expect(resolveMentions("cc @robert and @annlee.", members).sort()).toEqual([ANN, BOB].sort());
		expect(resolveMentions("@ann.lee please look", members)).toEqual([ANN]);
	});

	it("matches a unique first name but not an ambiguous one", () => {
		expect(resolveMentions("@bob can you check", members)).toEqual([BOB]);
		expect(resolveMentions("@ann can you check", members)).toEqual([]);
	});

	it("ignores email addresses and unknown handles", () => {
		expect(resolveMentions("mail robert@acme.com or @nobody", members)).toEqual([]);
	});
});
