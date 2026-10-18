import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { createElement } from "react";
import common from "../../../../messages/en-GB/common.json";
import catalogue from "../../../../messages/en-GB/catalogue.json";
import ArtificialAnalysisDashboard from "./ArtificialAnalysisDashboard";
import type { DashboardRow } from "@/lib/benchmarks/artificialAnalysisDashboard";

jest.mock("nuqs", () => {
	const parser = { withDefault: () => parser };
	return { parseAsString: parser, parseAsArrayOf: () => parser, useQueryStates: () => [{ aaModels: null, aaEffort: "", aaBench: "terminalBench40", aaDomain: "financeAndAccounting" }, jest.fn()] };
});
jest.mock("@/i18n/navigation", () => ({ Link: ({ children, ...props }: React.ComponentProps<"a">) => createElement("a", props, children) }));
jest.mock("@/components/Logo", () => ({ Logo: () => null }));

it("renders the comparison sections, shared model controls and inspectable values", () => {
	const row: DashboardRow = { id: "source", modelId: "lab/model", modelName: "Model", sourceName: "Model (High)", creatorId: "lab", colour: null, effort: "high", intelligence: 50, tokensPerTask: 0, totalTokens: null, costPerTask: 0.005, totalCost: 100, timePerTask: 2, benchmarks: { terminalBench40: 0.6 }, capabilities: { financeAndAccounting: 40 } };
	const html = renderToStaticMarkup(<NextIntlClientProvider locale="en-GB" timeZone="UTC" messages={{ Common: common, Catalogue: catalogue }}><ArtificialAnalysisDashboard rows={[row]} /></NextIntlClientProvider>);
	for (const id of ["comparisons", "tokenUsage", "cost", "benchmarks", "capabilities"]) expect(html).toContain(`id="aa-${id}"`);
	expect(html).toContain("Output tokens per task");
	expect(html).toContain("Cost per task (USD)");
	expect(html).toContain("Model (High)");
	expect(html).toContain("0.005");
	expect(html).toContain("—");
	expect(html).toContain('aria-checked="true"');
});
