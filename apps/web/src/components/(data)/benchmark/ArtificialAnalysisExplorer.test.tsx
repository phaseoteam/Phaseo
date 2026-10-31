import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppIntlProvider } from "@/i18n/react";
import common from "../../../../messages/en-GB/common.json";
import catalogue from "../../../../messages/en-GB/catalogue.json";
import site from "../../../../messages/en-GB/site.json";
import ArtificialAnalysisExplorer from "./ArtificialAnalysisExplorer";

let mockView = "cost-intelligence";
afterEach(() => { mockView = "cost-intelligence"; });

jest.mock("nuqs", () => {
	const parser = { withDefault: () => parser };
	return { parseAsString: parser, parseAsArrayOf: () => parser, parseAsStringLiteral: () => parser,
		useQueryStates: () => [{ aaView: mockView, aaScale: "log", aaModels: null, aaEffort: "" }, jest.fn()] };
});
jest.mock("@/i18n/navigation", () => ({ Link: ({ children, ...props }: React.ComponentProps<"a">) => createElement("a", props, children) }));
jest.mock("@/components/Logo", () => ({ Logo: () => null }));

const render = (children: ReactNode) => renderToStaticMarkup(<AppIntlProvider locale="en-GB" timeZone="UTC" messages={{ Common: common, Catalogue: catalogue, Site: site }}>{children}</AppIntlProvider>);

it("includes coding-only models in the default coding selection", () => {
	mockView = "coding";
	const html = render(<ArtificialAnalysisExplorer points={[
		{ id: "paired", model_id: "lab/paired", model_name: "Paired", organisation_id: null, organisation_name: null, variant: null, intelligence: 50, cost: 20 },
		{ id: "coding", model_id: "lab/coding", model_name: "Coding only", organisation_id: null, organisation_name: null, variant: null, coding: 42 },
	]} />);
	expect(html).toContain("Coding only");
	expect(html).not.toContain("No results available for this metric.");
});

it("renders an accessible comparison explorer with inspectable configuration scores", () => {
	const html = render(<ArtificialAnalysisExplorer footer={<p>Source footer</p>} points={[
		{ id: "one", model_id: "lab/model", model_name: "Model", organisation_id: null, organisation_name: null, variant: "high", intelligence: 50, cost: 20 },
		{ id: "two", model_id: "lab/model", model_name: "Model", organisation_id: null, organisation_name: null, variant: "low", intelligence: 40, cost: 10 },
	]} />);
	expect(html).toMatch(/aria-pressed="true"[^>]*>Evaluation cost × Intelligence</);
	expect(html).toMatch(/Models<\/span><span[^>]*>1 \/ 1</);
	expect(html).toContain("All configurations");
	expect(html).toContain("Source footer");
	expect(html).toContain("Model / configuration");
	expect(html).toContain("$20.00");
});

it("renders a truthful empty state without invented cost values", () => {
	const html = render(<ArtificialAnalysisExplorer points={[{ id: "one", model_id: "lab/model", model_name: "Model", organisation_id: null, organisation_name: null, variant: null, intelligence: 50 }]} />);
	expect(html).toContain("No results available for this metric.");
	expect(html).not.toContain("$0.00");
});

it("offers linear scale when selected zero-cost results cannot appear on a log axis", () => {
	const html = render(<ArtificialAnalysisExplorer points={[{ id: "zero", model_id: "lab/model", model_name: "Model", organisation_id: null, organisation_name: null, variant: null, intelligence: 50, cost: 0 }]} />);
	expect(html).not.toContain("No results available for this metric.");
	expect(html).toMatch(/role="status"[^>]*><button[^>]*>Linear scale<\/button>/);
});
