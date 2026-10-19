import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { createElement } from "react";
import common from "../../../../messages/en-GB/common.json";
import catalogue from "../../../../messages/en-GB/catalogue.json";
import ArtificialAnalysisDashboard from "./ArtificialAnalysisDashboard";
import type { DashboardRow } from "@/lib/benchmarks/artificialAnalysisDashboard";

let mockSection = "comparisons";

jest.mock("nuqs", () => {
	const parser = { withDefault: () => parser };
	return { parseAsString: parser, parseAsArrayOf: () => parser, useQueryStates: () => [{ aaModels: null, aaEffort: "", aaEfforts: null, aaCreator: "", aaLayout: "overview", aaBench: "terminalBench40", aaDomain: "financeAndAccounting", aaSection: mockSection, aaCompare: "cost", aaMeasure: "task" }, jest.fn()] };
});
jest.mock("@/i18n/navigation", () => ({ Link: ({ children, ...props }: React.ComponentProps<"a">) => createElement("a", props, children) }));
jest.mock("@/components/Logo", () => ({ Logo: () => null }));

it.each(["comparisons", "tokenUsage", "cost", "benchmarks", "capabilities"])("mounts only the active %s chart with shared model controls and inspectable values", (section) => {
	mockSection = section;
	const row: DashboardRow = { id: "source", modelId: "lab/model", modelName: "Model", sourceName: "Model (High)", creatorId: "lab", colour: null, effort: "high", intelligence: 50, tokensPerTask: 0, totalTokens: null, costPerTask: 0.005, totalCost: 100, timePerTask: 2, benchmarks: { terminalBench40: 0.6 }, capabilities: { financeAndAccounting: 40 } };
	const html = renderToStaticMarkup(<NextIntlClientProvider locale="en-GB" timeZone="UTC" messages={{ Common: common, Catalogue: catalogue }}><ArtificialAnalysisDashboard rows={[row]} /></NextIntlClientProvider>);
	expect(html).toContain(`id="aa-${section}"`);
	for (const id of ["comparisons", "tokenUsage", "cost", "benchmarks", "capabilities"].filter((id) => id !== section)) expect(html).not.toContain(`id="aa-${id}"`);
	expect(html.match(/role="tabpanel"/g)).toHaveLength(1);
	expect(html).toContain("Domain capabilities");
	expect(html).toContain("Output tokens per task");
	expect(html).toContain("Cost per task (USD)");
	expect(html).toContain("Model (High)");
	expect(html).toContain("0.005");
	expect(html).toContain("—");
	expect(html).toContain('aria-checked="true"');
});
