import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import catalogue from "../../../../messages/en-GB/catalogue.json";
import ModelStickyHeader from "./ModelStickyHeader";

jest.mock("./UseModelSheet", () => ({ UseModelSheet: () => <button>Use API</button> }));
jest.mock("@/components/Logo", () => ({ Logo: () => null }));
jest.mock("next/link", () => ({
	__esModule: true, default: ({ href, children, ...props }: any) => <a href={href} {...props}>{children}</a>,
}));

function render(endpoints: string[], decisions: boolean) {
	return renderToStaticMarkup(<NextIntlClientProvider locale="en-GB" timeZone="UTC" messages={{ Catalogue: catalogue }}>
		<ModelStickyHeader modelId="openai/gpt-6-luna" organisationId="openai" organisationName="OpenAI"
			modelName="GPT-6 Luna" observeId="header" isDecisionsModel={decisions}
			gatewayMetadata={{ activeProviders: endpoints.map(endpoint => ({ endpoint })) } as any} />
	</NextIntlClientProvider>);
}
describe("model detail playground actions", () => {
	it("preserves Chat and API actions while adding Decisions for a dual-capability model", () => {
		const html = render(["text.generate", "decisions.make"], true);
		expect(html).toContain('href="/chat?model=openai%2Fgpt-6-luna"');
		expect(html).toContain('href="/chat/decisions?model=openai%2Fgpt-6-luna"');
		expect(html).toContain("Use API");
	});
	it("does not introduce Chat for a Decisions-only model", () => {
		const html = render(["decisions.make"], true);
		expect(html).not.toContain('href="/chat?');
		expect(html).toContain('href="/chat/decisions?');
		expect(html).not.toContain("Use API");
	});
	it("keeps a text-only model unchanged", () => {
		const html = render(["text.generate"], false);
		expect(html).toContain('href="/chat?');
		expect(html).not.toContain('href="/chat/decisions?');
	});
});
