import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import catalogue from "../../../../../../../messages/en-GB/catalogue.json";
import common from "../../../../../../../messages/en-GB/common.json";
import type { APIProviderModelListItem } from "@/lib/fetchers/api-providers/providerDataTypes";
import { ProviderModelCard } from "./ProviderModelCard";

jest.mock("@/components/providers/DisplayPreferencesProvider", () => ({
	useDisplayFormatters: () => ({
		number: (value: number, options?: Intl.NumberFormatOptions) =>
			new Intl.NumberFormat("en-GB", options).format(value),
		calendarDate: (value: string) => value.slice(0, 10),
	}),
}));
jest.mock("@/components/Logo", () => ({ Logo: () => <span data-logo /> }));
jest.mock("@/i18n/navigation", () => ({
	Link: ({ href, children, prefetch: _prefetch, ...props }: { href: string; children: ReactNode; prefetch?: boolean }) => (
		<a href={href} {...props}>{children}</a>
	),
}));

const model: APIProviderModelListItem = {
	model_id: "openai/gpt-6-sol",
	api_model_id: "openai/gpt-6-sol",
	model_name: "GPT-6 Sol",
	created_at: null,
	release_date: "2026-09-22T00:00:00Z",
	input_modalities: ["text", "image"],
	output_modalities: ["text"],
	supported_params: ["temperature", "max_tokens", "temperature"],
	endpoints: ["text.generate"],
	pricing_meters: [
		{ meter: "input_text_tokens", label: "Input", unit: "token", unit_size: 1, price_per_unit_usd: 0.000002, price_per_1m_usd: 2, estimated_price_per_image_usd: null, display_unit_label: "token" },
		{ meter: "cached_input_text_tokens", label: "Cache read", unit: "token", unit_size: 1, price_per_unit_usd: 0.0000002, price_per_1m_usd: 0.2, estimated_price_per_image_usd: null, display_unit_label: "token" },
		{ meter: "output_text_tokens", label: "Output", unit: "token", unit_size: 1, price_per_unit_usd: 0.00001, price_per_1m_usd: 10, estimated_price_per_image_usd: null, display_unit_label: "token" },
	],
};

function render(item: APIProviderModelListItem) {
	return renderToStaticMarkup(
		<NextIntlClientProvider locale="en-GB" timeZone="UTC" messages={{ Catalogue: catalogue, Common: common }}>
			<ProviderModelCard model={item} onOpenDetails={() => undefined} />
		</NextIntlClientProvider>,
	);
}

describe("ProviderModelCard", () => {
	it("shows the model like other catalogue cards", () => {
		const html = render(model);
		expect(html).toContain(">GPT-6 Sol<");
		expect(html).not.toContain("OpenAI: GPT-6 Sol");
		expect(html).toContain("$2 in · $10 out / 1M tokens");
		expect(html).toContain("2 parameters");
		expect(html).toContain("2026-09-22");
		expect(html).toContain('href="/models/openai/gpt-6-sol"');
	});

	it("falls back to the first meter, then to a not-listed label", () => {
		const perImage = render({
			...model,
			pricing_meters: [
				{ meter: "output_image", label: "Image", unit: "image", unit_size: 1, price_per_unit_usd: 0.04, price_per_1m_usd: null, estimated_price_per_image_usd: null, display_unit_label: "image" },
			],
		});
		expect(perImage).toContain("$0.04 / ");
		expect(render({ ...model, pricing_meters: [] })).toContain("Pricing not listed");
	});
});
