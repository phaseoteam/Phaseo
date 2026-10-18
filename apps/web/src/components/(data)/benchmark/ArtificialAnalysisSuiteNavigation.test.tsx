import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ArtificialAnalysisSuiteNavigation from "./ArtificialAnalysisSuiteNavigation";
import type { ArtificialAnalysisSuite } from "@/lib/fetchers/benchmarks/types";

jest.mock("@/i18n/navigation", () => ({
	Link: ({ children, ...props }: React.ComponentProps<"a">) => createElement("a", props, children),
}));

const suite: ArtificialAnalysisSuite = {
	id: "artificial-analysis", name: "Artificial Analysis", current_version: 4, selected_version: 4, versions: [4, 3],
	metrics: [
		{ key: "intelligence", id: "aa-intelligence-index-v4", label: "Intelligence", total_models: 2 },
		{ key: "coding", id: "aa-coding-index-v4", label: "Coding", total_models: 1 },
		{ key: "agentic", id: "aa-agentic-index-v4", label: "Agentic", total_models: 0 },
	], other_evaluations: [],
};

it("keeps the latest version unpinned and resets the metric when changing version", async () => {
	const html = renderToStaticMarkup(await ArtificialAnalysisSuiteNavigation({ suite, selectedId: "aa-coding-index-v4", currentLabel: "Index v4.3.2" }));
	expect(html).toContain('href="/benchmarks/artificial-analysis?metric=coding" aria-current="page"');
	expect(html).toContain(">Index v4.3.2</a>");
	expect(html).toContain('href="/benchmarks/artificial-analysis?metric=intelligence&amp;version=3"');
	expect(html).not.toContain("benchmarkMetrics");
});

it("keeps historical metric links pinned to their selected version", async () => {
	const historical = { ...suite, selected_version: 3, metrics: suite.metrics.map((metric) => ({ ...metric, id: metric.id.replace("v4", "v3") })) };
	const html = renderToStaticMarkup(await ArtificialAnalysisSuiteNavigation({ suite: historical, selectedId: "aa-coding-index-v3" }));
	expect(html).toContain('href="/benchmarks/artificial-analysis?metric=coding&amp;version=3" aria-current="page"');
	expect(html).toContain('href="/benchmarks/artificial-analysis?metric=intelligence"');
});
