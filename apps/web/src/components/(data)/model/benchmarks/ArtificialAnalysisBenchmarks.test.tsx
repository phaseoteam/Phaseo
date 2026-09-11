import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ArtificialAnalysisBenchmarks } from "./ArtificialAnalysisBenchmarks";
import ModelBenchmarks from "./ModelBenchmarks";
import type { ModelBenchmarkHighlight } from "@/lib/fetchers/models/getModelBenchmarkData";
import type { PublicBenchmarkRanking } from "@/lib/fetchers/frontend/fetchPublicCatalog";

jest.mock("@number-flow/react", () => ({
	__esModule: true,
	default: ({ value }: { value: number }) => String(value),
}));

const highlight = (benchmarkId: string, score: number): ModelBenchmarkHighlight => ({
	benchmarkId, benchmarkName: benchmarkId, score, scoreDisplay: String(score), totalModels: 100,
	rank: 1, isPercentage: false, isSelfReported: false,
	otherInfo: `Example (high); Intelligence Index v${benchmarkId.endsWith("v5") ? "5" : "4.3"}`, sourceLink: "https://artificialanalysis.ai/models/example",
});

describe("Artificial Analysis benchmark panel", () => {
	it("shows indices as numbers, exact currency, missing values and provenance", () => {
		const html = renderToStaticMarkup(<ArtificialAnalysisBenchmarks highlights={[
			highlight("aa-intelligence-index-v4", 42.5),
			highlight("aa-coding-index-v4", 0),
			highlight("aa-intelligence-index-cost-v4", 123.45),
		]} />);
		expect(html).toContain("42.5");
		expect(html).not.toContain("42.5%");
		expect(html).toContain(">0<");
		expect(html).toContain("$123.45");
		expect(html).toContain("—");
		expect(html).toContain("Source: Artificial Analysis");
	});
	it("renders V5 scores under their separate benchmark IDs", () => {
		const html = renderToStaticMarkup(<ArtificialAnalysisBenchmarks highlights={[
			highlight("aa-intelligence-index-v4", 42.5),
			highlight("aa-intelligence-index-v5", 55),
			highlight("aa-intelligence-index-cost-v5", 98.75),
		]} />);
		expect(html).toContain("55");
		expect(html).toContain("$98.75");
		expect(html).toContain("v4.3 / v5");
	});
	it("does not create a panel for models without AA scores", () => {
		expect(renderToStaticMarkup(<ArtificialAnalysisBenchmarks highlights={[highlight("mmlu", 89)]} />)).toBe("");
		expect(renderToStaticMarkup(<ArtificialAnalysisBenchmarks highlights={[{ ...highlight("aa-intelligence-index-v4", 42), score: null }]} />)).toBe("");
	});
	it("features AA first and retains other highlights and the full benchmark table", () => {
		const html = renderToStaticMarkup(<ModelBenchmarks highlightCards={[
			highlight("mmlu", 89), highlight("aa-intelligence-index-v4", 42),
		]} />);
		expect(html.indexOf("Artificial Analysis")).toBeLessThan(html.indexOf("Other Benchmarks"));
		expect(html).toContain('aria-expanded="false"');
		expect(html).toContain("Other Benchmarks");
		expect(html).toContain("Benchmark table");
	});
	it("dims other models in an expanded comparison", () => {
		const ranking: PublicBenchmarkRanking = {
			benchmark_id: "aa-intelligence-index-v4",
			name: "Artificial Analysis Intelligence Index",
			category: "general",
			benchmark_type: "numerical",
			lower_is_better: false,
			total_models: 2,
			entries: [
				{ model_id: "openai/gpt-6-astra", model_name: "GPT-6 Astra", organisation_id: "openai", organisation_name: "OpenAI", organisation_colour: "#333333", score: 52.8, rank: 1, release_date: "2026-09-03T00:00:00Z" },
				{ model_id: "anthropic/claude-fable-5.1", model_name: "Claude Fable 5.1", organisation_id: "anthropic", organisation_name: "Anthropic", organisation_colour: "#cc785c", score: 53.4, rank: 2, release_date: "2026-09-01T00:00:00Z" },
			],
		};
		const html = renderToStaticMarkup(<ArtificialAnalysisBenchmarks
			highlights={[highlight("aa-intelligence-index-v4", 52.8)]}
			results={[{
				id: "astra-result",
				benchmark_id: "aa-intelligence-index-v4",
				score: 52.8,
				raw_score: 52.8,
				score_display: "52.8",
				is_percentage: false,
				is_self_reported: false,
				other_info: "GPT-6 Astra (max)",
				source_link: null,
				created_at: null,
				updated_at: null,
				rank: 1,
				variant: "max",
				result_key: "astra-max",
				benchmark: { id: "aa-intelligence-index-v4", name: "Artificial Analysis Intelligence Index", category: "general", link: null, total_models: 2, max_score: null, order: null, ascending_order: false, type: "numerical" },
			}]} rankings={[ranking]} modelId="openai/gpt-6-astra" initialExpandedMetric="aa-intelligence-index-v4" />);
		const selectedBar = html.match(/aria-label="GPT-6 Astra"[\s\S]*?href="\/models\/openai\/gpt-6-astra"/)?.[0];
		const dimmedBar = html.match(/aria-label="Claude Fable 5.1"[\s\S]*?href="\/models\/anthropic\/claude-fable-5.1"/)?.[0];
		expect(html).toContain("Other models dimmed");
		expect(selectedBar).toContain("bg-black");
		expect(selectedBar).toContain("text-white");
		expect(selectedBar).not.toContain("opacity-20");
		expect(selectedBar).not.toContain("shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]");
		expect(dimmedBar).toContain("opacity-20");
		expect(dimmedBar).toContain("text-foreground");
		expect(html).not.toContain("ring-2 ring-[#8842FD]");
	});
});
