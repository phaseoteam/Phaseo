import { describe, expect, it, vi } from "vitest";
import { apiModels, readCodexModels } from "./modelCatalog";
import type { Account } from "../shared/workspace";

const account: Account = { id: "account", name: "API", harness: "phaseo", kind: "api", configured: true, endpoint: "https://api.example.test/v1/" };
describe("API model catalog", () => {
	it("preserves native model-specific reasoning options through pagination", async () => {
		const request = vi.fn().mockResolvedValueOnce({ data: [{ model: "first", displayName: "First", description: "", isDefault: true, supportedReasoningEfforts: [{ reasoningEffort: "medium", description: "Balanced" }, { reasoningEffort: 42 }], defaultReasoningEffort: "medium" }], nextCursor: "page-2" }).mockResolvedValueOnce({ data: [{ model: "hidden", hidden: true }, { model: "second", displayName: "Second", supportedReasoningEfforts: [{ reasoningEffort: "custom-native-level", description: "Native option" }] }], nextCursor: null });
		const models = await readCodexModels({ request }); expect(models).toHaveLength(2); expect(models[0]).toMatchObject({ defaultReasoningEffort: "medium", reasoningEfforts: [{ id: "medium", description: "Balanced" }] }); expect(models[1].reasoningEfforts?.[0].id).toBe("custom-native-level"); expect(request.mock.calls[1]).toEqual(["model/list", { cursor: "page-2", limit: 100 }]);
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
