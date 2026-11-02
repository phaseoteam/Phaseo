import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@/env";
import { fakeDataClient, hasFilter } from "./fakeDataClient.testing";

const mocks = vi.hoisted(() => ({ triageWorkItem: vi.fn() }));
vi.mock("./triage", () => ({ triageWorkItem: mocks.triageWorkItem }));

const { askItemTitle, emailDomain, normaliseEmail, parseAskRequest, recordAsk, safeRedirectUrl } = await import("./intake");

const WORKSPACE = "11111111-1111-1111-1111-111111111111";
const form = { id: "form-1", workspace_id: WORKSPACE, name: "Website", enabled: true, auto_triage: true };

describe("parseAskRequest", () => {
	it("reads JSON asks", async () => {
		const result = await parseAskRequest("application/json", JSON.stringify({
			subject: " Export fails ",
			body: "The CSV export times out",
			name: "Ada",
			email: "Ada@Example.COM",
			metadata: { plan: "pro", nested: { a: 1 } },
		}));
		expect(result).toEqual({
			ok: true,
			isForm: false,
			ask: {
				subject: "Export fails",
				body: "The CSV export times out",
				name: "Ada",
				email: "Ada@example.com",
				metadata: { plan: "pro", nested: { a: 1 } },
				redirect: null,
			},
		});
	});

	it("reads urlencoded and multipart form posts, keeping extra fields as metadata", async () => {
		const urlencoded = await parseAskRequest(
			"application/x-www-form-urlencoded",
			new URLSearchParams({ message: "Please add SSO", email: "bob@corp.io", redirect: "https://corp.io/thanks", page: "/pricing", _hidden: "x" }).toString(),
		);
		expect(urlencoded).toMatchObject({ ok: true, isForm: true, ask: { body: "Please add SSO", email: "bob@corp.io", redirect: "https://corp.io/thanks", metadata: { page: "/pricing" } } });

		const multipart = new FormData();
		multipart.set("body", "Dark mode please");
		multipart.set("subject", "Dark mode");
		const request = new Request("https://phaseo.app/x", { method: "POST", body: multipart });
		const result = await parseAskRequest(request.headers.get("content-type"), await request.text());
		expect(result).toMatchObject({ ok: true, isForm: true, ask: { body: "Dark mode please", subject: "Dark mode" } });
	});

	it("rejects asks without a body, bad JSON and other media types", async () => {
		expect(await parseAskRequest("application/json", JSON.stringify({ subject: "x" }))).toMatchObject({ ok: false, code: "body_required" });
		expect(await parseAskRequest("application/json", "{")).toMatchObject({ ok: false, code: "invalid_json" });
		expect(await parseAskRequest("application/json", "[]")).toMatchObject({ ok: false, code: "invalid_body" });
		expect(await parseAskRequest("application/xml", "<a/>")).toMatchObject({ ok: false, code: "unsupported_media_type" });
	});

	it("drops invalid emails instead of failing", async () => {
		const result = await parseAskRequest("application/json", JSON.stringify({ body: "hi", email: "not an email" }));
		expect(result).toMatchObject({ ok: true, ask: { email: null } });
	});
});

describe("redirects and emails", () => {
	it("allows only absolute http(s) redirects without credentials", () => {
		expect(safeRedirectUrl("https://example.com/thanks?x=1")).toBe("https://example.com/thanks?x=1");
		expect(safeRedirectUrl("http://example.com")).toBe("http://example.com/");
		for (const bad of [
			"javascript:alert(1)",
			"JaVaScRiPt:alert(1)",
			"data:text/html,hi",
			"//evil.example",
			"/relative",
			"https://user:pass@example.com/",
			"https://example.com/\nSet-Cookie: x",
			"https:\\\\evil.example",
			"ftp://example.com",
			"",
			42,
			`https://example.com/${"a".repeat(3000)}`,
		]) {
			expect(safeRedirectUrl(bad), String(bad)).toBeNull();
		}
	});

	it("reads email domains", () => {
		expect(emailDomain("a@Sub.Example.co.uk")).toBe("sub.example.co.uk");
		expect(emailDomain("nope")).toBeNull();
		expect(normaliseEmail("x@localhost")).toBeNull();
	});

	it("titles items from the subject, never the body", () => {
		expect(askItemTitle({ subject: "Export fails" }, "Website")).toBe("Export fails");
		expect(askItemTitle({ subject: null }, "Website")).toBe("Customer request via Website");
	});
});

describe("recordAsk", () => {
	beforeEach(() => {
		mocks.triageWorkItem.mockReset().mockResolvedValue({ ok: true });
	});

	const ask = { subject: "Export fails", body: "Private words from Ada", name: "Ada Lovelace", email: "ada@acme.com", metadata: {}, redirect: null };

	it("stores the request, matches the customer, creates an item without private text and triages it", async () => {
		const fake = fakeDataClient((query) => {
			if (query.table === "work_customers") return { data: { id: "cust-1", name: "Acme" }, error: null };
			if (query.table === "work_customer_requests" && query.op === "insert") return { data: { id: "req-1" }, error: null };
			return undefined;
		});
		fake.onRpc(() => ({ data: { id: "item-1", workspace_id: WORKSPACE, number: 7 }, error: null }));
		const background: Promise<unknown>[] = [];
		const result = await recordAsk({ env: {} as Env, client: fake.client, form, ask, waitUntil: (promise) => background.push(promise) });
		await Promise.all(background);

		expect(result).toEqual({ reference: "req-1", itemId: "item-1" });
		const customerQuery = fake.queries.find((query) => query.table === "work_customers")!;
		expect(hasFilter(customerQuery, "ilike", "domain", "acme.com")).toBe(true);
		expect(hasFilter(customerQuery, "eq", "workspace_id", WORKSPACE)).toBe(true);
		const insert = fake.queries.find((query) => query.table === "work_customer_requests" && query.op === "insert")!;
		expect(insert.payload).toMatchObject({ customer_id: "cust-1", source: "form", status: "new", body: "Private words from Ada", contact_email: "ada@acme.com", intake_form_id: "form-1" });

		const [rpc] = fake.rpcCalls;
		expect(rpc.name).toBe("create_work_item");
		expect(rpc.args).toMatchObject({ p_title: "Export fails", p_description: "", p_source: "ask", p_state: "triage" });
		expect(JSON.stringify(rpc.args)).not.toMatch(/Ada|Private words|ada@acme/);

		const event = fake.queries.find((query) => query.table === "work_item_events")!;
		expect(event.payload).toMatchObject({ kind: "customer_request", body: "Customer request from Acme" });
		expect(JSON.stringify(event.payload)).not.toMatch(/Ada|Private words|ada@acme/);

		const link = fake.queries.find((query) => query.table === "work_customer_requests" && query.op === "update")!;
		expect(link.payload).toMatchObject({ work_item_id: "item-1", status: "linked" });
		expect(mocks.triageWorkItem).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: WORKSPACE, itemId: "item-1", requestedBy: null }));
	});

	it("only stores the request when auto-triage is off", async () => {
		const fake = fakeDataClient((query) =>
			query.table === "work_customer_requests" && query.op === "insert" ? { data: { id: "req-2" }, error: null } : undefined,
		);
		const result = await recordAsk({ env: {} as Env, client: fake.client, form: { ...form, auto_triage: false }, ask: { ...ask, email: null }, waitUntil: () => undefined });
		expect(result).toEqual({ reference: "req-2", itemId: null });
		expect(fake.rpcCalls).toHaveLength(0);
		expect(fake.queries.some((query) => query.table === "work_customers")).toBe(false);
		expect(mocks.triageWorkItem).not.toHaveBeenCalled();
	});
});
