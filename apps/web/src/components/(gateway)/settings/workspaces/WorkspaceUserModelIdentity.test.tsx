import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkspaceUserModelIdentity } from "./WorkspaceUserModelIdentity";

jest.mock("next-intl", () => ({ useTranslations: () => () => "Unknown model" }));
jest.mock("@/i18n/navigation", () => ({ Link: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }));
jest.mock("@/components/Logo", () => ({ Logo: ({ id }: { id: string }) => <span data-logo={id} /> }));

const metadata = new Map([["gpt-5-alias", { modelName: "GPT-5", organisationId: "openai", organisationName: "OpenAI", canonicalModelId: "openai/gpt-5" }]]);

it("shows catalog names and organisation logos with canonical model links", () => {
	const html = renderToStaticMarkup(<WorkspaceUserModelIdentity modelId="gpt-5-alias" metadata={metadata} />);
	expect(html).toContain("OpenAI: GPT 5");
	expect(html).toContain("OpenAI");
	expect(html).toContain('data-logo="openai"');
	expect(html).toContain('href="/models/openai/gpt-5"');
	expect(html).not.toContain("gpt-5-alias");
});

it("humanizes uncatalogued model slugs instead of displaying raw IDs", () => {
	const html = renderToStaticMarkup(<WorkspaceUserModelIdentity modelId="anthropic/claude-sonnet-4" metadata={new Map()} />);
	expect(html).toContain("Claude Sonnet 4");
	expect(html).toContain('data-logo="anthropic"');
	expect(html).not.toContain("anthropic/claude-sonnet-4");
});

it("uses a neutral label for opaque IDs and avoids nested links in log rows", () => {
	const unknown = renderToStaticMarkup(<WorkspaceUserModelIdentity modelId="00000000-0000-4000-8000-000000000000" metadata={new Map()} />);
	expect(unknown).toContain("Unknown model");
	expect(unknown).not.toContain("00000000");
	const log = renderToStaticMarkup(<WorkspaceUserModelIdentity modelId="gpt-5-alias" metadata={metadata} linked={false} />);
	expect(log).not.toContain("<a ");
});
