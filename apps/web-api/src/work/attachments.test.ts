import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanContentType, cleanFileName, contentDisposition } from "./attachments";
import { fakeDataClient, type FakeHandler } from "./fakeDataClient.testing";

const WS = "00000000-0000-4000-8000-000000000001";
const ATTACHMENT = "00000000-0000-4000-8000-0000000000a1";
const state: { handler: FakeHandler; fake: ReturnType<typeof fakeDataClient> | null; admin: boolean } = { handler: () => undefined, fake: null, admin: false };

vi.mock("@/routes/account/work-shared", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/routes/account/work-shared")>();
	return {
		...actual,
		accessFromQuery: async () => {
			state.fake = fakeDataClient((query) => state.handler(query));
			return { context: { client: state.fake.client, workspaceId: WS, user: { id: "me" }, isOwner: state.admin, role: state.admin ? "admin" : "member" } };
		},
	};
});

const { registerAttachmentRoutes } = await import("./attachments");

function app() {
	const router = new Hono();
	registerAttachmentRoutes(router);
	return router;
}

const item = { id: "item-1", workspace_id: WS, number: 7, state: "todo" };
const row = (overrides: Record<string, unknown> = {}) => ({ id: ATTACHMENT, workspace_id: WS, work_item_id: "item-1", file_name: "shot.png", content_type: "image/png", size_bytes: 3, object_key: "work-attachments/ws/k", uploaded_by: "me", created_at: "t", ...overrides });

beforeEach(() => {
	state.admin = false;
	state.handler = (query) => {
		if (query.table === "work_items") return { data: item, error: null };
		if (query.table === "work_attachments" && query.op === "insert") return { data: row(), error: null };
		if (query.table === "work_attachments" && query.options?.head) return { data: null, error: null, count: 0 } as never;
		if (query.table === "work_attachments") return { data: row(), error: null };
		return { data: null, error: null };
	};
});

describe("attachment helpers", () => {
	it("keeps only a safe file name", () => {
		expect(cleanFileName("C:\\Users\\ana\\report final.pdf")).toBe("report final.pdf");
		expect(cleanFileName("../../etc/passwd")).toBe("passwd");
		expect(cleanFileName('a"b<c>.txt')).toBe("a_b_c_.txt");
		expect(cleanFileName("..")).toBeNull();
		expect(cleanFileName("")).toBeNull();
	});

	it("keeps a plain content type", () => {
		expect(cleanContentType("image/png; charset=binary")).toBe("image/png");
		expect(cleanContentType("text/html\r\nX: y")).toBe("application/octet-stream");
		expect(cleanContentType(null)).toBe("application/octet-stream");
	});

	it("always downloads as an attachment, with a UTF-8 name", () => {
		expect(contentDisposition("résumé \"v2\".pdf")).toBe("attachment; filename=\"r_sum_ _v2_.pdf\"; filename*=UTF-8''r%C3%A9sum%C3%A9%20%22v2%22.pdf");
	});
});

describe("attachment routes", () => {
	it("answers 503 until the bucket is bound", async () => {
		const response = await app().request(`/items/7/attachments?workspaceId=${WS}&name=a.png`, { method: "POST", body: "abc" }, {});
		expect(response.status).toBe(503);
	});

	it("stores the file under a random key and records it with an event", async () => {
		const bucket = { put: vi.fn(async () => ({})), get: vi.fn(), delete: vi.fn() };
		const response = await app().request(`/items/7/attachments?workspaceId=${WS}&name=../shot.png`, { method: "POST", headers: { "content-type": "image/png" }, body: "abc" }, { WORK_FILES: bucket });
		expect(response.status).toBe(201);
		const [key] = bucket.put.mock.calls[0] as unknown as [string];
		expect(key).toMatch(new RegExp(`^work-attachments/${WS}/[0-9a-f-]{36}$`));
		const insert = state.fake!.queries.find((query) => query.table === "work_attachments" && query.op === "insert")!;
		expect(insert.payload).toMatchObject({ file_name: "shot.png", content_type: "image/png", size_bytes: 3, uploaded_by: "me", object_key: key });
		const event = state.fake!.queries.find((query) => query.table === "work_item_events")!;
		expect(event.payload).toMatchObject({ kind: "attachment", body: "shot.png" });
	});

	it("refuses files over 25 MB by their declared length", async () => {
		const bucket = { put: vi.fn(), get: vi.fn(), delete: vi.fn() };
		const response = await app().request(`/items/7/attachments?workspaceId=${WS}&name=big.zip`, { method: "POST", headers: { "content-length": String(26 * 1024 * 1024) }, body: "x" }, { WORK_FILES: bucket });
		expect(response.status).toBe(413);
		expect(bucket.put).not.toHaveBeenCalled();
	});

	it("serves downloads as sandboxed attachments", async () => {
		const bucket = { get: vi.fn(async () => ({ body: "abc", size: 3 })), put: vi.fn(), delete: vi.fn() };
		const response = await app().request(`/attachments/${ATTACHMENT}/download?workspaceId=${WS}`, {}, { WORK_FILES: bucket });
		expect(response.status).toBe(200);
		expect(response.headers.get("content-disposition")).toContain("attachment;");
		expect(response.headers.get("x-content-type-options")).toBe("nosniff");
		expect(response.headers.get("content-security-policy")).toContain("sandbox");
	});

	it("lets only the uploader or an admin remove a file", async () => {
		state.handler = (query) => (query.table === "work_attachments" && query.op === "select" ? { data: row({ uploaded_by: "someone-else" }), error: null } : { data: null, error: null });
		const bucket = { get: vi.fn(), put: vi.fn(), delete: vi.fn(async () => undefined) };
		expect((await app().request(`/attachments/${ATTACHMENT}?workspaceId=${WS}`, { method: "DELETE" }, { WORK_FILES: bucket })).status).toBe(403);
		state.admin = true;
		expect((await app().request(`/attachments/${ATTACHMENT}?workspaceId=${WS}`, { method: "DELETE" }, { WORK_FILES: bucket })).status).toBe(200);
		expect(bucket.delete).toHaveBeenCalledWith("work-attachments/ws/k");
	});
});
