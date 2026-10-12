import { describe, expect, it, vi } from "vitest";
import { apiModels, readCodexModels } from "./modelCatalog";
import type { Account } from "../shared/workspace";

const account: Account = { id: "account", name: "API", harness: "phaseo", kind: "api", configured: true, endpoint: "https://api.example.test/v1/" };
describe("API model catalog", () => {
	const gatewayAccount = { ...account, endpoint: "https://api.phaseo.app/v1" };
	const nativeModel = (id: string, overrides = {}) => ({ id, name: id, capabilities: { endpoints: ["text.generate"] }, offers: [{ routable: true }], lifecycle: { status: "active" }, ...overrides });
	it("preserves catalog organization branding", async () => {
		const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, offset: 0, total: 1, models: [nativeModel("openai/example", { organization: { id: "openai", name: "OpenAI" }, lifecycle: { status: "active", released_at: "2026-10-04" } })] })));
		expect(await apiModels(gatewayAccount, "owned-key", fetcher)).toEqual([{ id: "openai/example", name: "openai/example", organisationId: "openai", organisationName: "OpenAI", releaseDate: "2026-10-04" }]);
	});
	it("reads the Phaseo catalog across pages with real gateway IDs and readable names", async () => {
		const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, offset: 0, limit: 250, total: 3, models: [nativeModel("owned/first", { name: "First Model", description: "Owned model" }), nativeModel("owned/second")] }))).mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, offset: 2, limit: 250, total: 3, models: [nativeModel("owned/last")] })));
		expect(await apiModels(gatewayAccount, "owned-key", fetcher)).toEqual([{ id: "owned/first", name: "First Model", description: "Owned model" }, { id: "owned/second", name: "owned/second" }, { id: "owned/last", name: "owned/last" }]);
		const first = new URL(fetcher.mock.calls[0][0]); const last = new URL(fetcher.mock.calls[1][0]);
		expect(first.searchParams.get("limit")).toBe("250"); expect(first.searchParams.get("endpoints")).toBe("text.generate"); expect(first.searchParams.get("gateway_available_only")).toBe("true"); expect(last.searchParams.get("offset")).toBe("2");
		expect(fetcher.mock.calls.every(([, options]) => options.headers.Authorization === "Bearer owned-key" && options.redirect === "error")).toBe(true);
	});
	it("skips unavailable and non-chat models without dropping later valid pages", async () => {
		const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, offset: 0, total: 4, models: [nativeModel("owned/image", { capabilities: { endpoints: ["images/generations"] } }), nativeModel("owned/offline", { offers: [{ routable: false }] })] }))).mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, offset: 2, total: 4, models: [nativeModel("owned/retired", { lifecycle: { status: "retired" } }), nativeModel("owned/chat")] })));
		expect(await apiModels(gatewayAccount, "owned-key", fetcher)).toEqual([{ id: "owned/chat", name: "owned/chat" }]);
	});
	it("rejects malformed, empty and repeated native pagination", async () => {
		for (const page of [{ ok: true, offset: 0, total: 2, models: [] }, { ok: true, offset: 1, total: 1, models: [nativeModel("one")] }, { ok: false, offset: 0, total: 1, models: [nativeModel("one")] }]) await expect(apiModels(gatewayAccount, "owned-key", vi.fn().mockResolvedValue(new Response(JSON.stringify(page))))).rejects.toThrow(/pagination|page/);
		const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, offset: 0, total: 2, models: [nativeModel("one")] }))).mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, offset: 1, total: 2, models: [nativeModel("one")] })));
		await expect(apiModels(gatewayAccount, "owned-key", fetcher)).rejects.toThrow("repeated");
	});
	it.each([null, [], { data: null }, { unexpected: [] }])("rejects malformed catalog envelopes without crashing: %j", async payload => {
		await expect(apiModels(account, "owned-key", vi.fn().mockResolvedValue(new Response(JSON.stringify(payload))))).rejects.toThrow("invalid model catalog");
	});
	it("preserves native model-specific reasoning options through pagination", async () => {
		const request = vi.fn().mockResolvedValueOnce({ data: [{ model: "first", displayName: "First", description: "", isDefault: true, supportedReasoningEfforts: [{ reasoningEffort: "medium", description: "Balanced" }, { reasoningEffort: 42 }], defaultReasoningEffort: "medium", serviceTiers: [{ id: "fast", name: "Fast", description: "Priority" }], defaultServiceTier: "default" }], nextCursor: "page-2" }).mockResolvedValueOnce({ data: [{ model: "hidden", hidden: true }, { model: "second", displayName: "Second", supportedReasoningEfforts: [{ reasoningEffort: "custom-native-level", description: "Native option" }] }], nextCursor: null });
		const models = await readCodexModels({ request }); expect(models).toHaveLength(2); expect(models[0].serviceTiers).toEqual([{ id: "fast", name: "Fast", description: "Priority" }]); expect(models[0]).toMatchObject({ defaultReasoningEffort: "medium", reasoningEfforts: [{ id: "medium", description: "Balanced" }] }); expect(models[1].reasoningEfforts?.[0].id).toBe("custom-native-level"); expect(request.mock.calls[1]).toEqual(["model/list", { cursor: "page-2", limit: 100 }]);
	});
	it("uses the selected account and filters malformed catalog entries", async () => {
		const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ id: "model-one", name: "Model One" }, { id: 42 }, { id: "model-two" }] })));
		expect(await apiModels(account, "secret", fetcher)).toEqual([{ id: "model-one", name: "Model One" }, { id: "model-two", name: "model-two" }]);
		expect(fetcher).toHaveBeenCalledWith("https://api.example.test/v1/models", expect.objectContaining({ headers: { Authorization: "Bearer secret" }, redirect: "error" }));
	});
	it("surfaces authentication errors", async () => {
		await expect(apiModels(account, "secret", vi.fn().mockResolvedValue(new Response("", { status: 401 })))).rejects.toThrow("HTTP 401");
	});
});
