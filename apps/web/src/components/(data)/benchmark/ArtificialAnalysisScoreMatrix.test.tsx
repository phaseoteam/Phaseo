import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import common from "../../../../messages/en-GB/common.json";
import catalogue from "../../../../messages/en-GB/catalogue.json";
import { ArtificialAnalysisScoreMatrix } from "./ArtificialAnalysisScoreMatrix";
import type { DashboardRow } from "@/lib/benchmarks/artificialAnalysisDashboard";

jest.mock("@/components/Logo", () => ({ Logo: () => null }));

it("keeps configurations separate and preserves negative, zero, missing and precise scores", () => {
	const base: DashboardRow = { id: "low", modelId: "lab/model", modelName: "Model", sourceName: "Model (Low)", creatorId: "lab", colour: null, effort: "low", intelligence: null, tokensPerTask: null, totalTokens: null, costPerTask: null, totalCost: null, timePerTask: null, benchmarks: { negative: -2.12345, zero: 0 }, capabilities: {} };
	const rows = [base, { ...base, id: "high", sourceName: "Model (High)", effort: "high", benchmarks: { negative: -1, zero: null } }];
	const html = renderToStaticMarkup(<NextIntlClientProvider locale="en-GB" timeZone="UTC" messages={{ Common: common, Catalogue: catalogue }}><ArtificialAnalysisScoreMatrix rows={rows} metrics={["negative", "zero", "missing"].map((key) => ({ key, label: key, value: (row) => row.benchmarks[key] ?? null }))} onSelect={() => {}} /></NextIntlClientProvider>);
	expect(html).toContain("Model (Low)");
	expect(html).toContain("Model (High)");
	expect(html).toContain('title="-2.12345"');
	expect(html).toContain('title="0">0</td>');
	expect(html.match(/>—<\/td>/g)).toHaveLength(3);
	expect(html.match(/font-semibold text-primary/g)).toHaveLength(2);
});
