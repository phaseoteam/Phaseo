import { mapDerivedBenchmarkRankingRow } from "./getBenchmarkResultRankings";

const BASE_ROW = {
	result_id: "7e4f01e2-1ae2-48db-811b-72ca0351b2b5",
	model_id: "moonshotai/kimi-k3",
	benchmark_id: "deepswe",
	score: "67.5",
	score_numeric: "67.5",
	is_self_reported: true,
	other_info: "KimiCode harness",
	source_link: "https://www.kimi.com/blog/kimi-k3",
	created_at: "2026-07-17T00:00:00.000Z",
	updated_at: "2026-07-17T00:00:00.000Z",
	occur_idx: 1,
	variant: null,
	result_key: "moonshotai/kimi-k3|deepswe|hash|1",
	benchmark_rank: "2",
	total_ranked_models: "17",
	is_primary_result: true,
	model_name: "Kimi K3",
	release_date: "2026-07-16T00:00:00.000Z",
	announcement_date: "2026-07-16T00:00:00.000Z",
	organisation_id: "moonshotai",
	organisation_name: "Moonshot AI",
	organisation_colour: "#000000",
};

describe("mapDerivedBenchmarkRankingRow", () => {
	it("normalizes Postgres numeric and bigint strings", () => {
		expect(mapDerivedBenchmarkRankingRow(BASE_ROW)).toMatchObject({
			resultId: BASE_ROW.result_id,
			modelId: "moonshotai/kimi-k3",
			benchmarkId: "deepswe",
			scoreNumeric: 67.5,
			rank: 2,
			totalRankedModels: 17,
			isPrimaryResult: true,
		});
	});

	it("treats invalid and non-positive ranking values as unavailable", () => {
		const mapped = mapDerivedBenchmarkRankingRow({
			...BASE_ROW,
			score_numeric: "not-a-number",
			benchmark_rank: "0",
			total_ranked_models: null,
		});

		expect(mapped.scoreNumeric).toBeNull();
		expect(mapped.rank).toBeNull();
		expect(mapped.totalRankedModels).toBeNull();
	});
});
