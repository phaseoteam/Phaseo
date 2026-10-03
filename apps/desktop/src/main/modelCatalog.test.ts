import { describe, expect, it, vi } from "vitest";
import { apiModels } from "./modelCatalog";
import type { Account } from "../shared/workspace";

const account: Account = { id: "account", name: "API", harness: "phaseo", kind: "api", configured: true, endpoint: "https://api.example.test/v1/" };
describe("API model catalog", () => {
	it("uses the selected account and filters malformed catalog entries", async () => {
		const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ id: "model-one", name: "Model One" }, { id: 42 }, { id: "model-two" }] })));
		expect(await apiModels(account, "secret", fetcher)).toEqual([{ id: "model-one", name: "Model One" }, { id: "model-two", name: "model-two" }]);
		expect(fetcher).toHaveBeenCalledWith("https://api.example.test/v1/models", expect.objectContaining({ headers: { Authorization: "Bearer secret" }, redirect: "error" }));
	});
	it("surfaces authentication errors", async () => {
		await expect(apiModels(account, "secret", vi.fn().mockResolvedValue(new Response("", { status: 401 })))).rejects.toThrow("HTTP 401");
	});
});
