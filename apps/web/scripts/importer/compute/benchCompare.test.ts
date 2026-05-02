import { computeBenchMap } from "./benchCompare";

describe("computeBenchMap", () => {
	it("ranks higher scores first when ascending_order is true", () => {
		const map = computeBenchMap([
			{ model_id: "model-low", benchmark_id: "bench-higher", score: "10", ascending_order: true },
			{ model_id: "model-high", benchmark_id: "bench-higher", score: "20", ascending_order: true },
		]);

		expect(map["model-high"].benchmarks["bench-higher"].rank).toBe(1);
		expect(map["model-low"].benchmarks["bench-higher"].rank).toBe(2);
	});

	it("ranks lower scores first when ascending_order is false", () => {
		const map = computeBenchMap([
			{ model_id: "model-low", benchmark_id: "bench-lower", score: "10", ascending_order: false },
			{ model_id: "model-high", benchmark_id: "bench-lower", score: "20", ascending_order: false },
		]);

		expect(map["model-low"].benchmarks["bench-lower"].rank).toBe(1);
		expect(map["model-high"].benchmarks["bench-lower"].rank).toBe(2);
	});
});
