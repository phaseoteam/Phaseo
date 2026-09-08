import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ArtificialAnalysisBenchmarks } from "./ArtificialAnalysisBenchmarks";
import ModelBenchmarks from "./ModelBenchmarks";
import type { ModelBenchmarkHighlight } from "@/lib/fetchers/models/getModelBenchmarkData";

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
});
