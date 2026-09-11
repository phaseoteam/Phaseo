import { renderToStaticMarkup } from "react-dom/server";
import type { PublicBenchmarkRanking } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import ArtificialAnalysisMetricCharts from "./ArtificialAnalysisMetricCharts";

const ranking = (benchmarkId: string, label: string): PublicBenchmarkRanking => ({
	benchmark_id: benchmarkId,
	name: `Artificial Analysis ${label}`,
	category: "general",
	benchmark_type: "numerical",
	lower_is_better: label === "Evaluation Cost",
	total_models: 2,
	entries: [
		{ model_id: "openai/gpt-6-astra", model_name: "GPT-6 Astra", organisation_id: "openai", organisation_name: "OpenAI", organisation_colour: "#333333", score: label === "Evaluation Cost" ? 1200 : 52.8, rank: label === "Evaluation Cost" ? 1 : 2, release_date: "2026-09-03T00:00:00Z", other_info: "GPT-6 Astra (max)" },
		{ model_id: "anthropic/claude-fable-5.1", model_name: "Claude Fable 5.1", organisation_id: "anthropic", organisation_name: "Anthropic", organisation_colour: "#cc785c", score: label === "Evaluation Cost" ? 1500 : 53.4, rank: label === "Evaluation Cost" ? 2 : 1, release_date: "2026-09-01T00:00:00Z", other_info: "Claude Fable 5.1 (max)" },
		{ model_id: "spacex-ai/grok-4.6", model_name: "Grok 4.6", organisation_id: "spacex-ai", organisation_name: "SpaceXAI", organisation_colour: "#000000", score: label === "Evaluation Cost" ? 1800 : 44.4, rank: 3, release_date: "2026-08-20T00:00:00Z", other_info: "Grok 4.6 (high)" },
	],
});

describe("Artificial Analysis metric charts", () => {
	it("renders all four index comparisons from the rankings payload", () => {
		const html = renderToStaticMarkup(<ArtificialAnalysisMetricCharts rankings={[
			ranking("aa-intelligence-index-v4", "Intelligence Index"),
			ranking("aa-coding-index-v4", "Coding Index"),
			ranking("aa-agentic-index-v4", "Agentic Index"),
			ranking("aa-intelligence-index-cost-v4", "Evaluation Cost"),
		]} />);
		expect(html).toContain("Index comparisons");
		expect(html).toContain('data-testid="intelligence-chart"');
		expect(html).toContain('data-testid="coding-chart"');
		expect(html).toContain('data-testid="agentic-chart"');
		expect(html).toContain('data-testid="cost-chart"');
		expect(html).toContain("Show top 14");
		expect(html).toContain("background-color:#000000");
		expect(html).toContain("background-color:#736cd3");
		expect(html.indexOf('title="Claude Fable 5.1')).toBeLessThan(html.indexOf('title="GPT-6 Astra'));
	});

	it("uses a dark score label for light organisation colours", () => {
		const html = renderToStaticMarkup(<ArtificialAnalysisMetricCharts rankings={[ranking("aa-intelligence-index-v4", "Intelligence Index")] .map((item) => ({
			...item,
			entries: item.entries.map((entry) => ({ ...entry, organisation_colour: "#d4f0da" })),
		}))} />);
		expect(html).toContain("background-color:#d4f0da;color:#111827");
	});

	it("uses the neutral fallback colour for invalid organisation colours", () => {
		const html = renderToStaticMarkup(<ArtificialAnalysisMetricCharts rankings={[ranking("aa-intelligence-index-v4", "Intelligence Index")].map((item) => ({
			...item,
			entries: item.entries.map((entry) => ({ ...entry, organisation_colour: "not-a-colour" })),
		}))} />);
		expect(html).toContain("background-color:#6b7280");
	});
});
