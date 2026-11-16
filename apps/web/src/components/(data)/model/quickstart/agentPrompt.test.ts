import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
	AGENT_PROMPT_FAMILY_IDS,
	buildAgentSetupPrompt,
	buildAgentTaskPrompt,
} from "./agentPrompt";

const DOCS_LOCALES = ["", "ar/", "de/", "es/", "fr/", "hi/", "ja/", "pt-BR/", "zh-Hans/"];

function readDocsQuickstart(localePrefix: string) {
	return readFileSync(
		new URL(`../../../../../../docs/${localePrefix}v1/quickstart.mdx`, import.meta.url),
		"utf8",
	);
}

// MDX template literals escape backticks and `${`.
const asMdxTemplate = (text: string) =>
	text.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");

describe("buildAgentSetupPrompt", () => {
	it.each(AGENT_PROMPT_FAMILY_IDS)("builds a numbered setup prompt for %s", (family) => {
		const prompt = buildAgentSetupPrompt(family);
		expect(prompt).toMatch(/^Set up Phaseo in this /);
		expect(prompt).toContain("\n1. ");
		expect(prompt).toContain("AGENTS.md");
		expect(prompt).toContain("PHASEO_API_KEY");
		expect(prompt).toContain("npx skills@latest add https://phaseo.app/docs --skill ");
	});

	it("points TypeScript projects at the SKILL.md shipped in @phaseo/sdk", () => {
		expect(buildAgentSetupPrompt("typescript")).toContain(
			"node_modules/@phaseo/sdk/SKILL.md",
		);
		expect(buildAgentSetupPrompt("typescript")).toContain("--skill phaseo-sdk-typescript");
	});

	it("does not ask HTTP-only projects to install an SDK", () => {
		const prompt = buildAgentSetupPrompt("curl");
		expect(prompt).toContain("Do not add an SDK");
		expect(prompt).not.toContain("release-age policy");
	});
});

describe("buildAgentTaskPrompt", () => {
	it("describes a text task for text endpoints", () => {
		expect(
			buildAgentTaskPrompt({ modelId: "openai/gpt-6-astra", endpointPath: "/responses" }),
		).toContain("sends a prompt to openai/gpt-6-astra and returns the text reply");
	});

	it("describes the endpoint's own task for other modalities", () => {
		const prompt = buildAgentTaskPrompt({
			modelId: "openai/gpt-image-2",
			endpointPath: "/images/generations",
		});
		expect(prompt).toContain("generates an image");
		expect(prompt).toContain("POST /v1/images/generations");
	});

	it("falls back to a generic task for unknown endpoints", () => {
		expect(
			buildAgentTaskPrompt({ modelId: "x/y", endpointPath: "/music/generations" }),
		).toContain("calls x/y and returns the result");
	});
});

describe("docs quickstart", () => {
	it.each(DOCS_LOCALES)("embeds the same agent prompts (%s)", (localePrefix) => {
		const mdx = readDocsQuickstart(localePrefix);
		for (const family of AGENT_PROMPT_FAMILY_IDS) {
			expect(mdx).toContain(asMdxTemplate(buildAgentSetupPrompt(family)));
		}
		expect(mdx).toContain(
			asMdxTemplate(buildAgentTaskPrompt({ modelId: "phaseo/free", endpointPath: "/responses" })),
		);
	});
});
