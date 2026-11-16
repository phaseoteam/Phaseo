import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildAgentPrompt } from "./agentPrompt";

const DOCS_LOCALES = ["", "ar/", "de/", "es/", "fr/", "hi/", "ja/", "pt-BR/", "zh-Hans/"];

function readDocsQuickstart(localePrefix: string) {
	return readFileSync(
		new URL(`../../../../../../docs/${localePrefix}v1/quickstart.mdx`, import.meta.url),
		"utf8",
	);
}

describe("buildAgentPrompt", () => {
	const prompt = buildAgentPrompt({ modelId: "openai/gpt-6-astra", endpointPath: "/responses" });

	it("covers setup and the first request in one numbered prompt", () => {
		expect(prompt).toMatch(/^Set up Phaseo in this project and make a first request to openai\/gpt-6-astra\./);
		for (const step of ["1. ", "2. ", "3. ", "4. ", "5. ", "6. "]) {
			expect(prompt).toContain(`\n${step}`);
		}
	});

	it("reviews an existing Phaseo setup instead of adding a second one", () => {
		expect(prompt).toContain("If the project already uses Phaseo, review that setup");
		expect(prompt).toContain("Check whether the project already uses Phaseo");
		expect(prompt).toContain("don't add a second integration");
		expect(prompt).toContain("behind the latest major version, update it");
		expect(prompt).toContain("If the project already calls openai/gpt-6-astra through Phaseo");
		expect(prompt).toMatch(/list what you added, what you changed in an existing setup/);
	});

	it("lets the agent pick the SDK from the project's language", () => {
		expect(prompt).toContain("work out the project's language and package manager");
		for (const sdk of ["@phaseo/sdk", "phaseo (Python", "sdk-go/v3", "Phaseo.Sdk", "phaseo/sdk (PHP", "phaseo_sdk"]) {
			expect(prompt).toContain(sdk);
		}
		expect(prompt).toContain("node_modules/@phaseo/sdk/SKILL.md");
		expect(prompt).toContain("npx skills@latest add https://phaseo.app/docs --skill phaseo-gateway");
	});

	it("keeps the key server-side and records the AGENTS.md note", () => {
		expect(prompt).toContain("AGENTS.md");
		expect(prompt).toContain("PHASEO_API_KEY");
		expect(prompt).toContain("server-side code only");
	});

	it("describes a text task for text endpoints", () => {
		expect(prompt).toContain(
			"sends a prompt to openai/gpt-6-astra and returns the text reply, using POST /v1/responses",
		);
	});

	it("describes the endpoint's own task for other modalities", () => {
		const imagePrompt = buildAgentPrompt({
			modelId: "openai/gpt-image-2",
			endpointPath: "/images/generations",
		});
		expect(imagePrompt).toContain("generates an image");
		expect(imagePrompt).toContain("POST /v1/images/generations");
	});

	it("falls back to a generic task for unknown endpoints", () => {
		expect(buildAgentPrompt({ modelId: "x/y", endpointPath: "/music/generations" })).toContain(
			"calls x/y and returns the result",
		);
	});
});

describe("docs quickstart", () => {
	it.each(DOCS_LOCALES)("shows the same agent prompt (%s)", (localePrefix) => {
		const mdx = readDocsQuickstart(localePrefix);
		const expected = buildAgentPrompt({ modelId: "phaseo/free", endpointPath: "/responses" });
		expect(mdx).toContain(`\`\`\`text Prompt wrap\n${expected}\n\`\`\``);
	});
});
