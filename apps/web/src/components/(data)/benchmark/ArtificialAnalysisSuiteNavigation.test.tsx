import { it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ArtificialAnalysisSuiteNavigation from "./ArtificialAnalysisSuiteNavigation";
import type { ArtificialAnalysisSuite } from "@/lib/fetchers/benchmarks/types";

vi.mock("@/i18n/navigation", () => ({
	Link: ({ children, ...props }: React.ComponentProps<"a">) => createElement("a", props, children),
}));

const suite: ArtificialAnalysisSuite = {
	id: "artificial-analysis", name: "Artificial Analysis", current_version: 5, selected_version: 4, versions: [5, 4],
	metrics: [
		{ key: "intelligence", id: "aa-intelligence-index-v4", label: "Intelligence", total_models: 2 },
		{ key: "coding", id: "aa-coding-index-v4", label: "Coding", total_models: 1 },
		{ key: "agentic", id: "aa-agentic-index-v4", label: "Agentic", total_models: 0 },
	], other_evaluations: [],
};

it("pins an older version, labels it precisely and keeps metric choice when returning to the latest", () => {
	const html = renderToStaticMarkup(ArtificialAnalysisSuiteNavigation({ suite, selectedId: "aa-coding-index-v4", currentLabel: "v4.3.2" }));
	expect(html).toContain('href="/benchmarks/artificial-analysis?metric=coding&amp;version=4" aria-current="page"');
	expect(html).toContain(">v4.3.2</a>");
	expect(html).toContain('href="/benchmarks/artificial-analysis?metric=coding"');
	expect(html).not.toContain("benchmarkMetrics");
});

it("keeps historical metric links pinned to their selected version", () => {
	const historical = { ...suite, selected_version: 3, versions: [5, 4, 3], metrics: suite.metrics.map((metric) => ({ ...metric, id: metric.id.replace("v4", "v3") })) };
	const html = renderToStaticMarkup(ArtificialAnalysisSuiteNavigation({ suite: historical, selectedId: "aa-coding-index-v3" }));
	expect(html).toContain('href="/benchmarks/artificial-analysis?metric=coding&amp;version=3" aria-current="page"');
	expect(html).toContain('href="/benchmarks/artificial-analysis?metric=coding&amp;version=4"');
	expect(html).toContain('href="/benchmarks/artificial-analysis?metric=coding"');
});

it("leaves the current version unpinned so it follows the latest publication", () => {
	const html = renderToStaticMarkup(ArtificialAnalysisSuiteNavigation({ suite: { ...suite, current_version: 4, versions: [4] }, selectedId: "aa-coding-index-v4" }));
	expect(html).toContain('href="/benchmarks/artificial-analysis?metric=coding" aria-current="page"');
	expect(html).not.toContain(">v5</a>");
});
