import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { DisplayPreferencesProvider } from "@/components/providers/DisplayPreferencesProvider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { englishCatalogueMessages } from "@/i18n/default-messages";
import { MonitorDataTable, type ModelData } from "./MonitorDataTable";

// URL state starts empty, as on a fresh /models/table visit.
jest.mock("nuqs", () => ({
	useQueryState: (_key: string, options: { defaultValue: unknown }) => [options.defaultValue, () => undefined],
}));

function route(providerId: string, overrides: Partial<ModelData> = {}): ModelData {
	return {
		id: `openai/gpt-6.1-sol::${providerId}::text.generate`,
		model: "OpenAI: GPT-6.1 Sol",
		modelId: "openai/gpt-6.1-sol",
		organisationId: "openai",
		provider: {
			id: providerId,
			name: "Mistral",
			inputPrice: 2,
			outputPrice: 10,
			features: ["tools"],
			executionRegions: ["eu"],
		},
		endpoint: "text.generate",
		gatewayStatus: "active",
		inputModalities: ["text"],
		outputModalities: ["text"],
		context: 128_000,
		maxOutput: 16_000,
		tier: "standard",
		added: "2026-01-01",
		popularityTokensWeek: 0,
		...overrides,
	};
}

function render(data: ModelData[]) {
	return renderToStaticMarkup(
		<NextIntlClientProvider locale="en-GB" timeZone="UTC" messages={{ Catalogue: englishCatalogueMessages }}>
			<DisplayPreferencesProvider locale="en-GB">
				<TooltipProvider>
					<MonitorDataTable data={data} effectiveStatuses={["active"]} />
				</TooltipProvider>
			</DisplayPreferencesProvider>
		</NextIntlClientProvider>,
	);
}

describe("MonitorDataTable", () => {
	const html = render([
		route("mistral", { provider: { ...route("mistral").provider, executionRegions: ["eu", "global"] } }),
		route("mistral-eu"),
		route("mistral", { endpoint: "batch", tier: "batch", provider: { ...route("mistral").provider, inputPrice: 0, outputPrice: 0 } }),
	]);

	it("names each provider route with its offer and execution regions", () => {
		expect(html).toContain('aria-label="Mistral · Region routing: Global, EU"');
		expect(html).toContain('aria-label="Mistral (EU) · Region routing: EU"');
	});

	it("shows capabilities as icons with accessible names instead of words", () => {
		expect(html).toContain('role="img" tabindex="0" aria-label="Text generation"');
		expect(html).toContain('aria-label="Batch"');
		expect(html).not.toMatch(/>Text generation</);
		// The only "Batch" text is the Tier column's badge.
		expect(html.match(/>Batch</g)).toHaveLength(1);
	});

	it("shows one token price per column, without a $0 batch line", () => {
		// en-GB formats US dollars as "US$".
		expect(html).toContain(">US$2.00<");
		expect(html).toContain(">US$10.00<");
		expect(html).not.toContain("$0.00");
	});

	it("marks per-capability prices with the capability icon rather than its label", () => {
		const mixed = render([
			route("openai", { provider: { ...route("openai").provider, name: "OpenAI" } }),
			route("openai", { endpoint: "image.generate", provider: { ...route("openai").provider, name: "OpenAI", inputPrice: 5, outputPrice: 40 } }),
		]);
		expect(mixed).toContain(">US$40.00<");
		expect(mixed).toContain('aria-label="Image generation"');
		expect(mixed).not.toMatch(/>Image generation</);
	});
});
