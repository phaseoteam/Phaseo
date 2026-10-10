import { toCompareModelOption } from "./types";
import type { ExtendedModel } from "@/data/types";

it("keeps picker identity, release grouping and compatible modalities without full model details", () => {
	const full = { id: "test/model", name: "Test Model", release_date: "2026-10-01", input_types: ["text", "image"], output_types: ["text"], provider: { provider_id: "test", name: "Test", description: "Unused provider detail" }, description: "Unused detailed content", prices: [{ price: 5 }], benchmark_results: [{ score: 42 }] } as unknown as ExtendedModel;
	expect(toCompareModelOption(full)).toEqual({ id: full.id, name: full.name, release_date: full.release_date, input_types: full.input_types, output_types: full.output_types, provider: { provider_id: "test", name: "Test" } });
	expect(toCompareModelOption({ ...full, provider: null } as unknown as ExtendedModel)).toMatchObject({ provider: null });
	expect(full.description).toBe("Unused detailed content");
});
