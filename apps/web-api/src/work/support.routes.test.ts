import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDataClient, hasFilter, type FakeHandler } from "./fakeDataClient.testing";

const WS = "00000000-0000-4000-8000-000000000001";
const DRAFT = "00000000-0000-4000-8000-000000000501";
const state: { handler: FakeHandler; fake: ReturnType<typeof fakeDataClient> | null; allowed: boolean } = { handler: () => undefined, fake: null, allowed: true };

vi.mock("@/routes/account/work-shared", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/routes/account/work-shared")>();
	return {
		...actual,
		workAccess: async (c: any) => {
			if (!state.allowed) return { response: c.json({ error: "forbidden" }, 403) };
			state.fake = fakeDataClient((query) => state.handler(query));
			return { context: { client: state.fake.client, workspaceId: WS, user: { id: "sender", appMetadata: {} } } };
		},
	};
});

const email: { enabled: boolean; ok: boolean; sent: Array<Record<string, unknown>> } = { enabled: false, ok: true, sent: [] };
vi.mock("./email", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./email")>();
	return {
		...actual,
		workEmailEnabled: () => email.enabled,
		sendWorkEmail: async (_env: unknown, message: Record<string, unknown>) => {
			email.sent.push(message);
			return email.ok ? { ok: true, id: "e1" } : { ok: false, code: "email_failed", message: "boom" };
		},
	};
});

const { registerReplyDraftRoutes } = await import("./support");

function app() {
	const router = new Hono();
	registerReplyDraftRoutes(router);
	return router;
}

function draftRow(overrides: Record<string, unknown> = {}) {
	return {
		id: DRAFT, workspace_id: WS, work_item_id: "item", request_id: "req", subject: "Re: Export", body: "Hi Ana, it works now.",
		status: "draft", model: "m", cost_nanos: 10, sent_to: null, sent_by: null, sent_at: null, created_at: "t", updated_at: "t",
		item: { number: 9, title: "Export" }, request: { contact_name: "Ana", contact_email: "ana@example.com", customer: { name: "Acme" } },
		...overrides,
	};
}

function post(path: string, body: unknown) {
	return app().request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

beforeEach(() => {
	state.allowed = true;
	state.fake = null;
	email.enabled = false;
	email.ok = true;
	email.sent = [];
});

describe("reply draft routes", () => {
	it("send marks an open draft sent by the person and returns the email to copy", async () => {
		state.handler = (query) => {
			if (query.table === "work_reply_drafts" && query.op === "select") return { data: draftRow(), error: null };
			if (query.table === "work_reply_drafts" && query.op === "update") return { data: draftRow({ status: "sent", sent_to: "ana@example.com", sent_by: "sender", sent_at: "now" }), error: null };
			return { data: null, error: null };
		};
		const response = await post(`/reply-drafts/${DRAFT}/send`, { workspaceId: WS, confirmRecipient: "ANA@example.com" });
		expect(response.status).toBe(200);
		const body = await response.json() as any;
		expect(body).toMatchObject({ delivery: "manual", email: { to: "ana@example.com", subject: "Re: Export" }, draft: { status: "sent", contactEmail: "ana@example.com" } });
		expect(body.mailto).toMatch(/^mailto:ana@example.com\?subject=/);
		const update = state.fake!.queries.find((query) => query.table === "work_reply_drafts" && query.op === "update")!;
		expect(update.payload).toMatchObject({ status: "sent", sent_to: "ana@example.com", sent_by: "sender" });
		expect(hasFilter(update, "eq", "status", "draft")).toBe(true);
		const event = state.fake!.queries.find((query) => query.table === "work_item_events")!;
		expect(event.payload).toMatchObject({ kind: "reply", author_kind: "user", body: "Reply sent to a customer" });
		expect(JSON.stringify(event.payload)).not.toContain("ana@example.com");
		expect(state.fake!.queries.some((query) => query.table === "work_items" && query.op === "update")).toBe(true);
	});

	it("emails the reply from the workspace when work email is on, replies going to the sender", async () => {
		email.enabled = true;
		state.handler = (query) => {
			if (query.table === "work_reply_drafts" && query.op === "select") return { data: draftRow(), error: null };
			if (query.table === "work_reply_drafts" && query.op === "update") return { data: draftRow({ status: "sent", sent_to: "ana@example.com", sent_by: "sender", sent_at: "now" }), error: null };
			if (query.table === "workspaces") return { data: { name: "Acme Tools" }, error: null };
			return { data: null, error: null };
		};
		const response = await post(`/reply-drafts/${DRAFT}/send`, { workspaceId: WS });
		expect(response.status).toBe(200);
		const body = await response.json() as any;
		expect(body).toMatchObject({ delivery: "email", draft: { status: "sent" } });
		expect(body.mailto).toBeUndefined();
		expect(email.sent).toEqual([expect.objectContaining({ to: "ana@example.com", subject: "Re: Export", fromName: "Acme Tools via Phaseo", idempotencyKey: `work-reply-${DRAFT}` })]);
		const event = state.fake!.queries.find((query) => query.table === "work_item_events")!;
		expect(event.payload).toMatchObject({ kind: "reply", data: { delivery: "email" } });
	});

	it("puts the draft back to open when the email fails", async () => {
		email.enabled = true;
		email.ok = false;
		state.handler = (query) => {
			if (query.table === "work_reply_drafts" && query.op === "select") return { data: draftRow(), error: null };
			if (query.table === "work_reply_drafts" && query.op === "update") return { data: draftRow({ status: "sent" }), error: null };
			return { data: null, error: null };
		};
		const response = await post(`/reply-drafts/${DRAFT}/send`, { workspaceId: WS });
		expect(response.status).toBe(502);
		expect((await response.json() as any).error).toBe("email_failed");
		const updates = state.fake!.queries.filter((query) => query.table === "work_reply_drafts" && query.op === "update");
		expect(updates[1]!.payload).toMatchObject({ status: "draft", sent_to: null, sent_at: null });
		expect(state.fake!.queries.some((query) => query.table === "work_item_events")).toBe(false);
	});

	it("refuses to send a draft that is not open, or to a changed recipient", async () => {
		state.handler = (query) => query.table === "work_reply_drafts" ? { data: draftRow({ status: "sent" }), error: null } : undefined;
		expect((await post(`/reply-drafts/${DRAFT}/send`, { workspaceId: WS })).status).toBe(409);
		state.handler = (query) => query.table === "work_reply_drafts" ? { data: draftRow(), error: null } : undefined;
		const mismatch = await post(`/reply-drafts/${DRAFT}/send`, { workspaceId: WS, confirmRecipient: "bob@example.com" });
		expect(mismatch.status).toBe(409);
		expect(state.fake!.queries.some((query) => query.op === "update")).toBe(false);
	});

	it("edits and discards only open drafts, and lists drafts", async () => {
		state.handler = (query) => query.table === "work_reply_drafts" ? { data: query.op === "update" ? draftRow({ body: "New body" }) : [draftRow()], error: null } : undefined;
		const edited = await app().request(`/reply-drafts/${DRAFT}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspaceId: WS, body: " New body " }) });
		expect(edited.status).toBe(200);
		expect(state.fake!.queries[0].payload).toMatchObject({ body: "New body" });
		expect(hasFilter(state.fake!.queries[0], "eq", "status", "draft")).toBe(true);

		expect((await post(`/reply-drafts/${DRAFT}/discard`, { workspaceId: WS })).status).toBe(200);
		expect(state.fake!.queries[0].payload).toMatchObject({ status: "discarded" });

		const list = await app().request(`/reply-drafts?workspaceId=${WS}&status=draft`);
		expect(await list.json()).toMatchObject({ drafts: [{ id: DRAFT, workItemNumber: 9, customerName: "Acme" }] });
		expect((await app().request(`/reply-drafts?workspaceId=${WS}&status=bogus`)).status).toBe(400);
	});

	it("needs work access", async () => {
		state.allowed = false;
		expect((await post(`/reply-drafts/${DRAFT}/send`, { workspaceId: WS })).status).toBe(403);
	});
});
