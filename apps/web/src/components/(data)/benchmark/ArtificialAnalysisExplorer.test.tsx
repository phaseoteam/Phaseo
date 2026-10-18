import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import common from "../../../../messages/en-GB/common.json";
import catalogue from "../../../../messages/en-GB/catalogue.json";
import site from "../../../../messages/en-GB/site.json";
import ArtificialAnalysisExplorer from "./ArtificialAnalysisExplorer";

jest.mock("nuqs", () => {
	const parser = { withDefault: () => parser };
	return { parseAsString: parser, parseAsArrayOf: () => parser, parseAsStringLiteral: () => parser,
		useQueryStates: () => [{ aaView: "cost-intelligence", aaScale: "log", aaModels: null, aaEffort: "" }, jest.fn()] };
});
jest.mock("@/i18n/navigation", () => ({ Link: ({ children, ...props }: React.ComponentProps<"a">) => createElement("a", props, children) }));
jest.mock("@/components/Logo", () => ({ Logo: () => null }));

const render = (children: ReactNode) => renderToStaticMarkup(<NextIntlClientProvider locale="en-GB" timeZone="UTC" messages={{ Common: common, Catalogue: catalogue, Site: site }}>{children}</NextIntlClientProvider>);

it("renders an accessible comparison explorer with inspectable configuration scores", () => {
	const html = render(<ArtificialAnalysisExplorer points={[{ id: "one", model_id: "lab/model", model_name: "Model", organisation_id: null, organisation_name: null, variant: "high", intelligence: 50, cost: 20 }]} />);
	expect(html).toContain("Evaluation cost × Intelligence");
	expect(html).toContain('type="checkbox"');
	expect(html).toContain("All configurations");
	expect(html).toContain("Model / configuration");
	expect(html).toContain("$20.00");
});

it("renders a truthful empty state without invented cost values", () => {
	const html = render(<ArtificialAnalysisExplorer points={[{ id: "one", model_id: "lab/model", model_name: "Model", organisation_id: null, organisation_name: null, variant: null, intelligence: 50 }]} />);
	expect(html).toContain("No results available for this metric.");
	expect(html).not.toContain("$0.00");
});
