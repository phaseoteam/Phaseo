import { fetchAdminModelBenchmarks } from "./fetchAdminModelBenchmarks";
import { fetchAdminModelSource } from "./fetchAdminModelSource";
import { fetchAdminCatalogRecord } from "./fetchAdminCatalog";
jest.mock("./fetchAdminModelSource", () => ({ fetchAdminModelSource: jest.fn() }));
jest.mock("./fetchAdminCatalog", () => ({ fetchAdminCatalogRecord: jest.fn() }));

it("reads internal benchmark scores without assigning public ranks", async () => {
	jest.mocked(fetchAdminModelSource).mockResolvedValue({ model: { benchmark_results: [{ result_id: "result", benchmark_id: "test", score: "42", is_self_reported: true }] } } as any);
	jest.mocked(fetchAdminCatalogRecord).mockResolvedValue({ row: { name: "Test benchmark", ascending_order: true } });
	expect(await fetchAdminModelBenchmarks("test/internal")).toMatchObject([{ score: 42, rank: null, benchmark: { name: "Test benchmark", total_models: null } }]);
	expect(fetchAdminModelSource).toHaveBeenCalledWith("test/internal");
});

it("does not fall back to public results when admin access is denied", async () => {
	jest.mocked(fetchAdminModelSource).mockRejectedValue(new Error("Forbidden"));
	await expect(fetchAdminModelBenchmarks("test/internal")).rejects.toThrow("Forbidden");
});
