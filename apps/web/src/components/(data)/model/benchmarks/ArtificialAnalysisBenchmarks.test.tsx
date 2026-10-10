import site from "../../../../../messages/en-GB/site.json";
import catalogue from "../../../../../messages/en-GB/catalogue.json";
import product from "../../../../../messages/en-GB/product.json";
import { NextIntlClientProvider, createTranslator } from "next-intl";
import type { ReactNode } from "react";
import common from "../../../../../messages/en-GB/common.json";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { ArtificialAnalysisBenchmarks } from "./ArtificialAnalysisBenchmarks";
import { EpochCapabilitiesIndex } from "./EpochCapabilitiesIndex";
import ModelBenchmarks from "./ModelBenchmarks";
import type { ModelBenchmarkHighlight } from "@/lib/fetchers/models/getModelBenchmarkData";
import type { PublicBenchmarkRanking } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import { summarizeArtificialAnalysisRankings } from "@/lib/benchmarks/artificialAnalysis";
import { webQueryKeys } from "@/lib/query/queryKeys";

jest.mock("@number-flow/react", () => ({
	__esModule: true,
	default: ({ value }: { value: number }) => String(value),
}));

jest.mock("next-intl/server", () => ({
	getTranslations: async (namespace: string) => createTranslator({ locale: "en-GB", messages: { Catalogue: catalogue }, namespace } as never),
}));

const highlight = (benchmarkId: string, score: number): ModelBenchmarkHighlight => ({
	benchmarkId, benchmarkName: benchmarkId, score, scoreDisplay: String(score), totalModels: 100,
	rank: 1, isPercentage: false, isSelfReported: false,
	otherInfo: `Example (high); Intelligence Index v${benchmarkId.endsWith("v5") ? "5" : "4.3"}`, sourceLink: "https://artificialanalysis.ai/models/example",
});

function renderLocalized(node: ReactNode, client = new QueryClient()) {
	return renderToStaticMarkup(<QueryClientProvider client={client}><NextIntlClientProvider timeZone="UTC" locale="en-GB" messages={{ Common: common, Catalogue: catalogue, Product: product, Site: site }}>{node}</NextIntlClientProvider></QueryClientProvider>);
}

describe("Artificial Analysis benchmark panel", () => {
	it("keeps a previously loaded chart visible if a background refresh fails", async () => {
		const id = "aa-intelligence-index-v4";
		const ranking: PublicBenchmarkRanking = { benchmark_id: id, name: "Intelligence", category: null, benchmark_type: null, lower_is_better: false, total_models: 1, entries: [{ model_id: "test/leader", model_name: "Cached leader remains visible", organisation_id: null, organisation_name: null, score: 50, rank: 1, other_info: "Intelligence Index v4.3" }] };
		const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		client.setQueryData(webQueryKeys.public.benchmarkRankings(), [ranking]);
		await client.fetchQuery({ queryKey: webQueryKeys.public.benchmarkRankings(), queryFn: () => Promise.reject(new Error("Temporary refresh failure")), retry: false }).catch(() => undefined);
		const html = renderLocalized(<ArtificialAnalysisBenchmarks highlights={[highlight(id, 43.6)]} loadRankings modelId="test/current" initialExpandedMetric={id} />, client);
		expect(html).toContain("Cached leader remains visible");
		expect(html).not.toContain("Try Again");
		client.clear();
	});
	it("shows progress while retrying a failed initial leaderboard request", async () => {
		const id = "aa-intelligence-index-v4";
		const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		await client.fetchQuery({ queryKey: webQueryKeys.public.benchmarkRankings(), queryFn: () => Promise.reject(new Error("Initial failure")), retry: false }).catch(() => undefined);
		let complete!: (value: PublicBenchmarkRanking[]) => void;
		const retry = client.fetchQuery({ queryKey: webQueryKeys.public.benchmarkRankings(), queryFn: () => new Promise<PublicBenchmarkRanking[]>(resolve => { complete = resolve; }), retry: false });
		const html = renderLocalized(<ArtificialAnalysisBenchmarks highlights={[highlight(id, 43.6)]} loadRankings modelId="test/current" initialExpandedMetric={id} />, client);
		expect(html).toContain('role="status"');
		expect(html).not.toContain("Try Again");
		complete([]);
		await retry;
		client.clear();
	});
	it("renders score and rank from compact summaries before loading interactive leaderboards", () => {
		const id = "aa-intelligence-index-v4";
		const ranking: PublicBenchmarkRanking = { benchmark_id: id, name: "Intelligence", category: null, benchmark_type: null, lower_is_better: false, total_models: 1, entries: [{ model_id: "test/leader", model_name: "Leader detail omitted", organisation_id: null, organisation_name: null, score: 50, rank: 1, other_info: "Intelligence Index v4.3", configurations: [50, 48].map(score => ({ score, variant: null, result_key: null, other_info: null, source_link: null, updated_at: null })) }] };
		const html = renderLocalized(<ArtificialAnalysisBenchmarks highlights={[highlight(id, 43.6)]} rankSummaries={summarizeArtificialAnalysisRankings([ranking])} loadRankings modelId="test/current" />);
		const translate = createTranslator({ locale: "en-GB", messages: { Common: common }, namespace: "Common.ui.benchmarkChartCopy" } as never);
		expect(html).toContain(translate("rankRankOfTotalEvaluatedConfigurations", { rank: 3, total: 3 }));
		expect(html).toContain("43.6");
		expect(html).not.toContain("Leader detail omitted");
	});
	it.each(["aa-intelligence-index-cost-v4", "aa-intelligence-index-cost-v5"])("orders %s by lowest cost without leaderboard metadata", (benchmarkId) => {
		const results = [100, 10].map((score, index) => ({
			id: `cost-${index}`, benchmark_id: benchmarkId, score, raw_score: score, score_display: String(score),
			is_percentage: false, is_self_reported: false, other_info: highlight(benchmarkId, score).otherInfo,
			source_link: null, created_at: null, updated_at: null, rank: null,
			variant: index === 0 ? "max" : "low", result_key: `cost-${index}`,
			benchmark: { id: benchmarkId, name: "Evaluation cost", category: "cost", link: null, total_models: null, max_score: null, order: null, ascending_order: false, type: "numerical" as const },
		}));
		const html = renderLocalized(<ArtificialAnalysisBenchmarks highlights={[highlight(benchmarkId, 100)]} results={results} modelId="test/model" modelName="Test model" initialExpandedMetric={benchmarkId} />);
		expect(html).toContain("Lower is better");
		expect(html).not.toContain("Higher is better");
		expect(html.indexOf("(Low)")).toBeLessThan(html.indexOf("(Max)"));
		expect(html).not.toContain("(#1)");
	});
	it("includes the current model when the shared leaderboard is stale and ranks configurations", () => {
		const benchmarkId = "aa-intelligence-index-v4";
		const ranking: PublicBenchmarkRanking = {
			benchmark_id: benchmarkId, name: "Intelligence", category: "general", benchmark_type: "numerical", lower_is_better: false, total_models: 1,
			entries: [{ model_id: "test/leader", model_name: "Leader", organisation_id: "test", organisation_name: "Test", score: 50, rank: 1,
				other_info: "Intelligence Index v4.3",
				configurations: [50, 48].map((score) => ({ score, variant: String(score), result_key: String(score), other_info: "Intelligence Index v4.3", source_link: null, updated_at: null })) }],
		};
		const html = renderLocalized(<ArtificialAnalysisBenchmarks highlights={[highlight(benchmarkId, 43.6)]} rankings={[ranking]} modelId="stepfun/step-5" modelName="Step 5 Preview" initialExpandedMetric={benchmarkId} />);
		expect(html).toContain('aria-label="Step 5 Preview"');
		expect(html).toContain('href="/models/stepfun/step-5"');
		expect(html).toContain("(#3)");
		expect(html).toContain('<span class="sr-only">Rank 3 of 3 evaluated configurations</span>');
		expect(html).not.toContain("Other models dimmed");
		expect(html).toContain("Ranked across evaluated configurations");
	});
	it("does not duplicate an existing model or compare different index versions", () => {
		const benchmarkId = "aa-intelligence-index-v4";
		const ranking: PublicBenchmarkRanking = {
			benchmark_id: benchmarkId, name: "Intelligence", category: "general", benchmark_type: "numerical", lower_is_better: false, total_models: 2,
			entries: [
				{ model_id: "stepfun/step-5", model_name: "Step 5 Preview", organisation_id: "stepfun", organisation_name: "StepFun", score: 43.6, rank: 2, other_info: "Intelligence Index v4.3." },
				{ model_id: "test/older", model_name: "Old index result", organisation_id: "test", organisation_name: "Test", score: 90, rank: 1, other_info: "Intelligence Index v4.1.1" },
			],
		};
		const html = renderLocalized(<ArtificialAnalysisBenchmarks highlights={[highlight(benchmarkId, 43.6)]} rankings={[ranking]} modelId="stepfun/step-5" initialExpandedMetric={benchmarkId} />);
		expect(html.match(/aria-label="Step 5 Preview"/g)).toHaveLength(1);
		expect(html).not.toContain("Old index result");
		expect(html).not.toContain("(#1)");
	});
	it("does not invent a first-place rank when the comparison dataset is unavailable", () => {
		const html = renderLocalized(<ArtificialAnalysisBenchmarks highlights={[highlight("aa-intelligence-index-v4", 43.6)]} modelId="stepfun/step-5" modelName="Step 5 Preview" initialExpandedMetric="aa-intelligence-index-v4" />);
		expect(html).toContain('aria-label="Step 5 Preview"');
		expect(html).not.toContain("(#1)");
	});
	it("shows indices as numbers, exact currency, missing values and provenance", () => {
		const html = renderLocalized(<ArtificialAnalysisBenchmarks highlights={[
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
		const html = renderLocalized(<ArtificialAnalysisBenchmarks highlights={[
			highlight("aa-intelligence-index-v4", 42.5),
			highlight("aa-intelligence-index-v5", 55),
			highlight("aa-intelligence-index-cost-v5", 98.75),
		]} />);
		expect(html).toContain("55");
		expect(html).toContain("$98.75");
		expect(html).toContain("v4.3 / v5");
	});
	it("does not create a panel for models without AA scores", () => {
		expect(renderLocalized(<ArtificialAnalysisBenchmarks highlights={[highlight("mmlu", 89)]} />)).toBe("");
		expect(renderLocalized(<ArtificialAnalysisBenchmarks highlights={[{ ...highlight("aa-intelligence-index-v4", 42), score: null }]} />)).toBe("");
	});
	it("features AA first and retains other highlights and the full benchmark table", async () => {
		const html = renderLocalized(await ModelBenchmarks({ highlightCards: [
			highlight("mmlu", 89), highlight("aa-intelligence-index-v4", 42),
		] }));
		expect(html.indexOf("Artificial Analysis")).toBeLessThan(html.indexOf("Other benchmarks"));
		expect(html).toContain('aria-expanded="false"');
		expect(html).toContain("Other benchmarks");
		expect(html).toContain("Benchmark table");
	});
	it("features Epoch beneath Artificial Analysis instead of hiding it under other benchmarks", async () => {
		const html = renderLocalized(await ModelBenchmarks({ highlightCards: [
			{ ...highlight("epoch-capabilities-index", 159.12), benchmarkName: "Epoch Capabilities Index", rank: 8, totalModels: 266, sourceLink: "https://epoch.ai/eci" },
			highlight("aa-intelligence-index-v4", 42),
			highlight("mmlu", 89),
		] }));
		expect(html.indexOf("Artificial Analysis")).toBeLessThan(html.indexOf("Epoch AI"));
		expect(html.indexOf("Epoch AI")).toBeLessThan(html.indexOf("Other benchmarks"));
		expect(html).toContain("Ranked #8 of 266");
		expect(html).toContain("159.12");
		expect(html).toContain("text-xl font-semibold tracking-tight tabular-nums sm:text-2xl");
		expect(html.match(/Epoch Capabilities Index/g)).toHaveLength(2);
	});
	it("expands Epoch into an inline leaderboard with published confidence intervals", () => {
		const epoch = { ...highlight("epoch-capabilities-index", 159.12), benchmarkName: "Epoch Capabilities Index", rank: 8, totalModels: 266, otherInfo: "GPT-5.5; Epoch Capabilities Index; 95% CI 156.91–161.95", sourceLink: "https://epoch.ai/eci" };
		const html = renderLocalized(<EpochCapabilitiesIndex highlights={[epoch]} modelId="openai/gpt-5.5" initialExpanded ranking={{
			benchmark_id: "epoch-capabilities-index", name: "Epoch Capabilities Index", category: "general", benchmark_type: "numerical", lower_is_better: false, total_models: 266,
			entries: [{ model_id: "openai/gpt-5.5", model_name: "GPT-5.5", organisation_id: "openai", organisation_name: "OpenAI", score: 159.12, rank: 8, other_info: epoch.otherInfo }],
		}} />);
		expect(html).toContain("ECI leaderboard");
		expect(html).toContain("95% confidence interval");
		expect(html).toContain("156.91–161.95");
		expect(html).toContain("inline-flex items-baseline gap-2 border-l pl-4 tabular-nums");
		expect(html).not.toContain("rounded-md border bg-muted/40");
		expect(html).toContain("View full leaderboard");
		expect(html).toContain("/benchmarks/epoch-capabilities-index");
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
		const html = renderLocalized(<ArtificialAnalysisBenchmarks
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
		expect(html).not.toContain("Other models dimmed");
		expect(selectedBar).toContain("bg-black");
		expect(selectedBar).toContain("text-white");
		expect(selectedBar).not.toContain("opacity-20");
		expect(selectedBar).not.toContain("shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]");
		expect(dimmedBar).toContain("opacity-20");
		expect(dimmedBar).toContain("text-foreground");
		expect(html).not.toContain("ring-2 ring-[#8842FD]");
	});
});
